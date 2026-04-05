/**
 * account/account.routes.js  →  mounted at /api/account
 */

const express            = require("express");
const { analyzeAccount } = require("./account.service");

const router = express.Router();

router.post("/analyze", (req, res) => {
  const extracted = req.body;
  if (!extracted || typeof extracted !== "object")
    return res.status(400).json({ error: "Request body must be a valid extracted object." });

  try {
    return res.json(analyzeAccount(extracted));
  } catch (err) {
    console.error("[Account]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
