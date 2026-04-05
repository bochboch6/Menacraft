/**
 * pdf/pdf.routes.js  →  mounted at /api/pdf
 */

const express  = require("express");
const multer   = require("multer");
const { extractTextFromPdfBuffer } = require("./pdf.service");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/extract", upload.single("file"), async (req, res) => {
  if (!req.file)
    return res.status(400).json({ error: "No file uploaded. Send a PDF in the 'file' field." });

  if (req.file.mimetype !== "application/pdf")
    return res.status(400).json({ error: "Only PDF files are supported." });

  try {
    const text      = await extractTextFromPdfBuffer(req.file.buffer);
    const wordCount = text.trim().split(/\s+/).length;
    return res.json({ filename: req.file.originalname, wordCount, text });
  } catch (err) {
    console.error("[PDF]", err.message);
    return res.status(500).json({ error: "Failed to extract text from PDF." });
  }
});

module.exports = router;
