/**
 * copyleaks/copyleaks.routes.js  →  mounted at /api/ai-detector
 */

const express         = require("express");
const { analyzeText } = require("./copyleaks.service");

const router = express.Router();

router.post("/analyze", async (req, res) => {
  const { text } = req.body;
  if (!text?.trim())
    return res.status(400).json({ error: "Body must contain a non-empty 'text' field." });

  try {
    return res.json(await analyzeText(text));
  } catch (err) {
    console.error("[ai-detector]", err.message);
    return res.status(502).json({ error: err.message });
  }
});

module.exports = router;
