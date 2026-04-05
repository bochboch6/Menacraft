/**
 * hive.js — calls the Hive AI detection API for images and videos.
 * Returns a normalized result object.
 */

const axios = require("axios");

const HIVE_API_KEY = "jO0l35Xs+OuRGBEPpLYTlw=="
const HIVE_URL =
  "https://api.thehive.ai/api/v3/hive/ai-generated-and-deepfake-content-detection";

const THRESHOLDS = {
  ai_generated: 0.9,
  deepfake: 0.9,
  ai_generated_audio: 0.9,
};

const GEN_KEYS = [
  "midjourney", "stablediffusion", "dalle", "firefly",
  "ideogram", "flux", "runway", "other_image_generators",
];

// ── helpers ──────────────────────────────────────────────────────
function toDataUri(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function parseClasses(classList) {
  const out = {};
  for (const item of classList || []) {
    out[item.class] = Math.round(item.value * 10000) / 10000;
  }
  return out;
}

function verdictLabel(score, threshold, yes, no) {
  return score >= threshold ? yes : no;
}

// ── main export ───────────────────────────────────────────────────
async function detectWithHive(buffer, mimeType, filename) {
  const hiveKey = HIVE_API_KEY || "";
  if (!hiveKey) throw new Error("HIVE_API_KEY is not set on the server.");

  const dataUri = toDataUri(buffer, mimeType);

  const { data } = await axios.post(
    HIVE_URL,
    { media_metadata: true, input: [{ media_base64: dataUri }] },
    {
      headers: {
        Authorization: `Bearer ${hiveKey}`,
        "Content-Type": "application/json",
      },
      timeout: 120_000,
    }
  );

  const frames = data.output || [];
  if (!frames.length) throw new Error("No output returned from Hive API.");

  const isVideo = mimeType.startsWith("video/");

  if (isVideo) {
    const aiScores = frames.map((f) => parseClasses(f.classes).ai_generated || 0);
    const dfScores = frames.map((f) => parseClasses(f.classes).deepfake || 0);
    const auScores = frames.map((f) => parseClasses(f.classes).ai_generated_audio || 0);

    const maxAI  = Math.max(...aiScores);
    const avgAI  = aiScores.reduce((s, v) => s + v, 0) / aiScores.length;
    const maxDF  = Math.max(...dfScores);
    const maxAud = Math.max(...auScores);

    return {
      filename,
      file_type: "video",
      frame_count: frames.length,
      summary: {
        ai_generated_peak: maxAI,
        ai_generated_avg:  Math.round(avgAI * 10000) / 10000,
        deepfake_peak:     maxDF,
        ai_audio_peak:     maxAud,
      },
      verdict: {
        ai_generated: verdictLabel(maxAI,  THRESHOLDS.ai_generated,       "AI_GENERATED",     "REAL"),
        deepfake:     verdictLabel(maxDF,  THRESHOLDS.deepfake,            "DEEPFAKE_DETECTED", "NO_DEEPFAKE"),
        ai_audio:     verdictLabel(maxAud, THRESHOLDS.ai_generated_audio, "AI_AUDIO",          "REAL_AUDIO"),
      },
    };
  }

  // image
  const scores = parseClasses(frames[0].classes);
  const aiScore  = scores.ai_generated       || 0;
  const dfScore  = scores.deepfake            || 0;
  const audScore = scores.ai_generated_audio || 0;

  const generators = GEN_KEYS
    .filter((k) => scores[k] > 0.01)
    .map((k) => ({ name: k, score: scores[k] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return {
    filename,
    file_type: "image",
    scores: {
      ai_generated:      aiScore,
      not_ai_generated:  scores.not_ai_generated || 0,
      deepfake:          dfScore,
      ai_generated_audio: audScore,
    },
    verdict: {
      ai_generated: verdictLabel(aiScore, THRESHOLDS.ai_generated, "AI_GENERATED", "REAL"),
      deepfake:     verdictLabel(dfScore, THRESHOLDS.deepfake,      "DEEPFAKE_DETECTED", "NO_DEEPFAKE"),
    },
    generators: generators.length ? generators : undefined,
  };
}

module.exports = { detectWithHive };
