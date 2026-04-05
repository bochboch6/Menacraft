/**
 * copyleaks/copyleaks.service.js
 * Handles Copyleaks authentication and AI-content detection.
 */

const axios          = require("axios");
const { v4: uuidv4 } = require("uuid");

const EMAIL   = "maha.yousfi@insat.ucar.tn";
const API_KEY = "8791e7b5-dd95-4520-aad0-f9eeaca8a002";

const AUTH_URL  = "https://id.copyleaks.com/v3/account/login/api";
const CHECK_URL = (id) => `https://api.copyleaks.com/v2/writer-detector/${id}/check`;

// Token cached for 55 min
let _token = null, _fetchedAt = null;
const TTL  = 55 * 60 * 1000;

async function _getToken() {
  if (_token && Date.now() - _fetchedAt < TTL) return _token;
  const res  = await axios.post(AUTH_URL, { email: EMAIL, key: API_KEY }, {
    headers: { "Content-Type": "application/json" },
  });
  _token     = res.data.access_token;
  _fetchedAt = Date.now();
  return _token;
}

async function analyzeText(text) {
  if (!text?.trim()) throw new Error("text must be a non-empty string.");

  const token  = await _getToken();
  const scanId = uuidv4().slice(0, 8);

  const { data } = await axios.post(
    CHECK_URL(scanId),
    { text, sandbox: false },
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
  );

  if (data.ErrorCode) throw new Error(`Copyleaks: ${data.ErrorMessage}`);

  const aiScore    = Math.round((data.summary?.ai    ?? 0) * 1000) / 10;
  const humanScore = Math.round((data.summary?.human ?? 0) * 1000) / 10;
  const isAI       = aiScore >= 50;

  const reasons = isAI
    ? [
        "Sentence structure is uniform and highly predictable",
        "Word choices are statistically typical of AI generation",
        "Lack of personal tone or natural human inconsistencies",
        "Repetitive phrasing patterns common in AI-generated text",
        "No emotional variation or spontaneous expression detected",
      ]
    : [
        "Natural variation in tone and sentence structure detected",
        "Word choices feel organic and unpredictable",
        "Writing shows human-like inconsistencies and personality",
        "No dominant AI phrasing patterns found",
        "Sentence rhythm varies naturally throughout the text",
      ];

  return { scanId, verdict: isAI ? "ai" : "human", aiScore, humanScore, reasons };
}

module.exports = { analyzeText };
