/**
 * credibility/credibility.routes.js  →  mounted at /api/credibility
 */

const express           = require("express");
const { analyzeSource } = require("./credibility.service");

const router = express.Router();

router.post("/analyze", async (req, res) => {
  const { input } = req.body;
  if (!input || typeof input !== "string" || !input.trim())
    return res.status(400).json({ error: "Request body must contain a non-empty 'input' field." });

  try {
    return res.json(await analyzeSource(input));
  } catch (err) {
    console.error("[Credibility]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
