/**
 * coherence/coherence.service.js
 * Port of coherance.py — compares a caption against a structured
 * Gemini image description using Cohere semantic embeddings.
 */

const axios = require("axios");

const COHERE_API_KEY  = process.env.COHERE_API_KEY || "";
const COHERE_EMBED    = "embed-english-v3.0";
const COHERE_EMBED_URL = "https://api.cohere.com/v1/embed";

const DESCRIPTION_FIELDS = [
  "scene_overview",
  "people",
  "objects_and_elements",
  "visible_text",
  "location_clues",
  "time_and_date_clues",
  "event_detected",
  "anomalies",
  "full_description",
];

const FIELD_WEIGHTS = {
  scene_overview:        0.20,
  people:                0.10,
  objects_and_elements:  0.10,
  visible_text:          0.08,
  location_clues:        0.12,
  time_and_date_clues:   0.10,
  event_detected:        0.15,
  anomalies:             0.05,
  full_description:      0.10,
};

// ── Cosine similarity ─────────────────────────────────────────────
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Cohere embed API ──────────────────────────────────────────────
async function getCohereEmbeddings(texts) {
  if (!COHERE_API_KEY) throw new Error("COHERE_API_KEY is not set.");

  const { data } = await axios.post(
    COHERE_EMBED_URL,
    { model: COHERE_EMBED, texts, input_type: "search_document", embedding_types: ["float"] },
    { headers: { Authorization: `Bearer ${COHERE_API_KEY}`, "Content-Type": "application/json" }, timeout: 30_000 }
  );

  return data.embeddings.float;
}

// ── Compute per-field alignment scores ───────────────────────────
async function computeAlignment(description, caption) {
  const texts = [caption];
  const fieldOrder = [];

  for (const field of DESCRIPTION_FIELDS) {
    let value = description[field] ?? "";
    if (Array.isArray(value)) value = value.join("; ");
    texts.push(String(value).trim() || "Not available");
    fieldOrder.push(field);
  }

  const embeddings  = await getCohereEmbeddings(texts);
  const captionVec  = embeddings[0];

  const fieldScores = {};
  for (let i = 0; i < fieldOrder.length; i++) {
    const sim   = cosineSimilarity(captionVec, embeddings[i + 1]);
    fieldScores[fieldOrder[i]] = Math.round(Math.max(0, Math.min(1, (sim + 1) / 2)) * 1000) / 10;
  }

  const overall = Math.round(
    DESCRIPTION_FIELDS.reduce((sum, f) => sum + fieldScores[f] * FIELD_WEIGHTS[f], 0) * 10
  ) / 10;

  const visualFields  = ["scene_overview", "event_detected", "location_clues", "people"];
  const contextFields = ["location_clues", "time_and_date_clues", "visible_text"];

  return {
    overall_alignment_score: overall,
    visual_claim_alignment:  Math.round(visualFields.reduce((s, f)  => s + fieldScores[f], 0) / visualFields.length  * 10) / 10,
    context_plausibility:    Math.round(contextFields.reduce((s, f) => s + fieldScores[f], 0) / contextFields.length * 10) / 10,
    field_scores: fieldScores,
  };
}

// ── Verdict ───────────────────────────────────────────────────────
function generateVerdict(scores) {
  const { overall_alignment_score: overall, field_scores: fs } = scores;

  let verdict, explanation, recommendation;
  if (overall >= 70) {
    verdict        = "CONSISTENT";
    explanation    = "The caption is generally consistent with the structured description.";
    recommendation = "Caption is likely aligned with the provided description.";
  } else if (overall >= 40) {
    verdict        = "MISLEADING";
    explanation    = "The caption partially aligns with the description but has notable mismatches.";
    recommendation = "Manual review is recommended before trusting this claim.";
  } else {
    verdict        = "INCONSISTENT";
    explanation    = "The caption conflicts with major elements in the description.";
    recommendation = "Treat the claim as likely unrelated to the described media context.";
  }

  const label = (f) => f.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  const key_matches    = Object.entries(fs).filter(([, s]) => s >= 72).map(([f]) => label(f));
  const key_mismatches = Object.entries(fs).filter(([, s]) => s <= 58).map(([f]) => label(f));

  const red_flags = [];
  if ((fs.people         ?? 100) <= 58) red_flags.push("Weak alignment on people-related claims.");
  if ((fs.location_clues ?? 100) <= 58) red_flags.push("Weak alignment on location clues.");
  if ((fs.event_detected ?? 100) <= 58) red_flags.push("Weak alignment on event claim.");

  return {
    verdict,
    confidence_score:    Math.round(overall),
    verdict_explanation: explanation,
    key_matches,
    key_mismatches,
    red_flags,
    recommendation,
  };
}

// ── Main export ───────────────────────────────────────────────────
async function analyzeCoherence(caption, description) {
  const scores  = await computeAlignment(description, caption);
  const verdict = generateVerdict(scores);
  return { scores, verdict };
}

module.exports = { analyzeCoherence };
