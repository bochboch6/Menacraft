// ───────────────────────────────────────────────────────────────
// extractor/index.js
// Standalone service (port 3001) — uses Gemini Vision for image
// anomaly detection and structured image description.
// ───────────────────────────────────────────────────────────────

const express = require("express");
const multer  = require("multer");
const axios   = require("axios");
const cors    = require("cors");

const app = express();

// ── Config ────────────────────────────────────────────────────────
const PORT           = process.env.EXTRACTOR_PORT || 3001;
const OPENROUTER_API_KEY = "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";
const OPENROUTER_URL     = "https://openrouter.ai/api/v1/chat/completions";
const VISION_MODEL       = "google/gemini-2.0-flash-exp:free";

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// ── Middleware ────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "video/mp4",  "video/quicktime", "video/webm",
    ];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error(`Unsupported: ${file.mimetype}`));
  },
});

// ── Gemini Vision helper ──────────────────────────────────────────
async function askGemini(buffer, mimeType, prompt, maxTokens = 400) {
  const body = {
    model: VISION_MODEL,
    max_tokens: maxTokens,
    messages: [{
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${buffer.toString("base64")}` },
        },
        { type: "text", text: prompt },
      ],
    }],
  };

  let data;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      ({ data } = await axios.post(OPENROUTER_URL, body, {
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type":  "application/json",
        },
        timeout: 60_000,
      }));
      break;
    } catch (err) {
      if (err.response?.status === 429 && attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 3000));
      } else throw err;
    }
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Vision model returned empty response.");
  return text.trim();
}

// ── Anomaly description (for suspicious images) ───────────────────
const ANOMALY_PROMPT =
  "This image was flagged by an AI detection system as likely AI-generated or manipulated. " +
  "In 2-3 concise sentences, describe the specific visual anomalies that suggest it is artificial " +
  "(e.g. unnatural lighting, blurred edges, inconsistent textures, impossible details). " +
  "Be factual and direct.";

// ── Structured description (for Full Analyzer / coherence check) ──
const DESCRIBE_PROMPT = `Analyze this image carefully and respond ONLY with a valid JSON object (no markdown, no code blocks, no explanation) with exactly these fields:
{
  "scene_overview": "brief overall scene description",
  "people": "describe people visible, or 'None visible'",
  "objects_and_elements": "main objects and visual elements present",
  "visible_text": ["array of any text visible in the image"],
  "location_clues": ["array of location/setting hints"],
  "time_and_date_clues": ["array of time or date hints"],
  "event_detected": "what event or situation is depicted",
  "anomalies": ["array of unusual, suspicious, or AI-generated elements"],
  "full_description": "comprehensive paragraph describing the entire image"
}`;

// ── Video: build anomaly text from passed scores ──────────────────
function buildVideoAnomalies(scores) {
  const { ai_generated_peak = 0, deepfake_peak = 0, ai_audio_peak = 0 } = scores || {};
  const aiPct = Math.round(ai_generated_peak * 100);
  const dfPct = Math.round(deepfake_peak      * 100);
  const auPct = Math.round(ai_audio_peak      * 100);

  const parts = [];
  if (aiPct > 0) parts.push(`Visual frames show ${aiPct}% AI-generation confidence, suggesting synthesized footage.`);
  if (dfPct > 0) parts.push(`Deepfake indicators reached ${dfPct}%, pointing to facial or body manipulation.`);
  if (auPct > 0) parts.push(`The audio track scored ${auPct}% on AI-generation, suggesting cloned or synthesized speech.`);

  return parts.length
    ? parts.join(" ")
    : "The video was flagged with elevated anomaly scores across detection categories.";
}

// ── Health ────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── POST /analyze — anomaly description for flagged media ─────────
app.post("/analyze", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded. Use field name 'file'." });

  const { buffer, mimetype } = req.file;

  try {
    let anomalies;
    if (IMAGE_MIMES.has(mimetype)) {
      anomalies = await askGemini(buffer, mimetype, ANOMALY_PROMPT, 200);
    } else {
      let scores = {};
      try { scores = JSON.parse(req.body.scores || "{}"); } catch {}
      anomalies = buildVideoAnomalies(scores);
    }
    return res.json({ anomalies, processed_at: new Date().toISOString() });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message || "Unknown error";
    return res.status(500).json({ error: detail });
  }
});

// ── POST /describe — structured image description ─────────────────
// Body: { imageUrl: string }
app.post("/describe", async (req, res) => {
  const { imageUrl } = req.body || {};
  if (!imageUrl) return res.status(400).json({ error: "imageUrl is required" });

  try {
    const imgRes   = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 15_000 });
    const buffer   = Buffer.from(imgRes.data);
    const mimeType = (imgRes.headers["content-type"] || "image/jpeg").split(";")[0].trim();

    const supported = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!supported.includes(mimeType)) {
      return res.status(400).json({ error: `Unsupported image type: ${mimeType}` });
    }

    const raw         = await askGemini(buffer, mimeType, DESCRIBE_PROMPT, 600);
    const cleaned     = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const description = JSON.parse(cleaned);

    return res.json({ description });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message || "Unknown error";
    return res.status(500).json({ error: detail });
  }
});

// ── Error handler ─────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File too large. Max 50 MB." });
  res.status(400).json({ error: err.message });
});

// ── Boot ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[extractor] Listening on port ${PORT}`);
  console.log(`[extractor] Model: ${VISION_MODEL} via OpenRouter`);
  console.log(`[extractor] OpenRouter key: ${OPENROUTER_API_KEY ? "✓ set" : "✗ MISSING"}`);
});
