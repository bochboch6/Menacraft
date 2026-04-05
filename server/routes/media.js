/**
 * routes/media.js — unified /api/media/analyze endpoint.
 *
 * Routing logic:
 *   audio/*  → Python deepfake detector (detector.py)
 *   image/*  → Hive AI detection API
 *   video/*  → Hive AI detection API
 */

const express  = require("express");
const multer   = require("multer");
const path     = require("path");
const fs       = require("fs");
const os       = require("os");
const { spawn } = require("child_process");
const axios    = require("axios");
const FormData = require("form-data");

const { detectWithHive }           = require("../detector/hive");
const { extractTextFromPdfBuffer } = require("../pdf/pdf.service");
const { analyzeText }              = require("../copyleaks/copyleaks.service");

const EXTRACTOR_URL = process.env.EXTRACTOR_URL || "http://localhost:3001";

const router = express.Router();

// ── multer: keep everything in memory ───────────────────────────
const ACCEPTED_TYPES = [
  // audio
  "audio/wav", "audio/mpeg", "audio/mp3", "audio/flac",
  "audio/ogg", "audio/x-m4a", "audio/mp4",
  // image
  "image/jpeg", "image/png", "image/webp", "image/gif",
  // video
  "video/mp4", "video/webm", "video/quicktime",
  // document
  "application/pdf",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error(
      `Unsupported file type: ${file.mimetype}. ` +
      `Accepted: wav, mp3, flac, ogg, m4a, jpg, png, webp, gif, mp4, webm`
    ));
  },
});

// ── audio helper: write buffer to disk → run Python ─────────────
function runAudioDetector(buffer, ext) {
  return new Promise((resolve, reject) => {
    const tmpPath   = path.join(os.tmpdir(), `deepfake_${Date.now()}${ext}`);
    const scriptPath = path.join(__dirname, "../deepfake/detector.py");

    fs.writeFile(tmpPath, buffer, (writeErr) => {
      if (writeErr) return reject(new Error(`Could not write temp file: ${writeErr.message}`));

      const py = spawn("python", [scriptPath, tmpPath], { env: process.env });

      let stdout = "";
      let stderr = "";
      py.stdout.on("data", (d) => (stdout += d.toString()));
      py.stderr.on("data", (d) => (stderr += d.toString()));

      py.on("close", (code) => {
        fs.unlink(tmpPath, () => {});
        if (code !== 0) {
          try {
            const parsed = JSON.parse(stdout);
            if (parsed.error) return reject(new Error(parsed.error));
          } catch {}
          return reject(new Error(`Python exited ${code}: ${stderr}`));
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(`Failed to parse detector output: ${stdout}`));
        }
      });

      py.on("error", (err) => {
        fs.unlink(tmpPath, () => {});
        reject(new Error(`Could not start Python: ${err.message}`));
      });
    });
  });
}

// ── POST /analyze ────────────────────────────────────────────────
router.post("/analyze", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });

  const { buffer, mimetype, originalname } = req.file;
  const ext = path.extname(originalname) || "";

  try {
    if (mimetype.startsWith("audio/")) {
      const result = await runAudioDetector(buffer, ext);
      return res.json({ file_type: "audio", filename: originalname, ...result });
    }

    if (mimetype === "application/pdf") {
      const text      = await extractTextFromPdfBuffer(buffer);
      const wordCount = text.trim().split(/\s+/).length;
      const analysis  = await analyzeText(text);
      return res.json({ file_type: "document", filename: originalname, wordCount, ...analysis });
    }

    if (mimetype.startsWith("image/") || mimetype.startsWith("video/")) {
      const result = await detectWithHive(buffer, mimetype, originalname);

      // If anomaly detected, enrich with AI description from extractor service
      const hasAnomaly =
        result.verdict?.ai_generated === "AI_GENERATED" ||
        result.verdict?.deepfake     === "DEEPFAKE_DETECTED";

      if (hasAnomaly) {
        try {
          const form = new FormData();
          form.append("file", buffer, { filename: originalname, contentType: mimetype });
          // for video, pass the Hive summary scores so the extractor can use them
          if (mimetype.startsWith("video/")) {
            form.append("scores", JSON.stringify(result.summary || {}));
          }
          const { data } = await axios.post(`${EXTRACTOR_URL}/analyze`, form, {
            headers: { ...form.getHeaders() },
            timeout: 120_000,
            maxContentLength: Infinity,
            maxBodyLength:    Infinity,
          });
          result.anomalies = data.anomalies || null;
        } catch (e) {
          console.warn("[media] Extractor unavailable:", e.message);
        }
      }

      return res.json(result);
    }

    return res.status(400).json({ error: "Unsupported file type." });

  } catch (err) {
    console.error("[media] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── multer error handler ─────────────────────────────────────────
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err.message.startsWith("Unsupported")) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: "Internal server error." });
});

module.exports = router;
