/**
 * pdf/pdf.service.js
 * Extracts raw text from a PDF buffer.
 */

const pdfParse = require("pdf-parse");

async function extractTextFromPdfBuffer(buffer) {
  const data = await pdfParse(buffer);
  return data.text.trim();
}

module.exports = { extractTextFromPdfBuffer };
