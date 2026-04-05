/**
 * coherence/coherence.routes.js
 * POST /api/fullanalyze/analyze
 *
 * Receives an array of posts (each with caption + imageUrl),
 * describes each image via the extractor service (Gemini),
 * then scores caption↔description alignment via Cohere.
 */

const express  = require("express");
const axios    = require("axios");
const { analyzeCoherence } = require("./coherence.service");

const router        = express.Router();
const EXTRACTOR_URL = process.env.EXTRACTOR_URL || "http://localhost:3001";
const MAX_POSTS     = 5;   // cap to avoid rate-limit storms

// ── POST /analyze ─────────────────────────────────────────────────
// Body: { posts: [{ caption, imageUrl }] }
//   or: { caption, imageUrl }   (single-post shorthand)
router.post("/analyze", async (req, res) => {
  let posts = req.body?.posts;

  // Accept single-post shorthand
  if (!posts && req.body?.imageUrl) {
    posts = [{ caption: req.body.caption || "", imageUrl: req.body.imageUrl }];
  }

  if (!Array.isArray(posts) || posts.length === 0) {
    return res.status(400).json({ error: "posts array is required (each item needs imageUrl)." });
  }

  const capped = posts.slice(0, MAX_POSTS);

  const results = await Promise.all(
    capped.map(async ({ caption = "", imageUrl }) => {
      if (!imageUrl) return { caption, imageUrl: null, error: "No imageUrl for this post." };

      try {
        // 1 — get structured image description from Gemini
        const descRes     = await axios.post(
          `${EXTRACTOR_URL}/describe`,
          { imageUrl },
          { timeout: 45_000 }
        );
        const description = descRes.data.description;

        // 2 — compute Cohere alignment
        const { scores, verdict } = await analyzeCoherence(caption, description);

        return { caption, imageUrl, description, scores, verdict };
      } catch (err) {
        const msg = err.response?.data?.error || err.message || "Analysis failed";
        return { caption, imageUrl, error: msg };
      }
    })
  );

  return res.json({ results });
});

module.exports = router;
