const express = require("express");
const multer  = require("multer");
const { spawn } = require("child_process");
const path    = require("path");
const fs      = require("fs");

const router  = express.Router();

// —— Multer: accept only audio, store in /tmp ——————————————————
const SUPPORTED_MIMETYPES = [
  "audio/wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/flac",
  "audio/ogg",
  "audio/x-m4a",
  "audio/mp4",
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, require("os").tmpdir()),
  filename:    (_req, file, cb) => {
    cb(null, `deepfake_${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (SUPPORTED_MIMETYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error(`Unsupported format: ${file.mimetype}. Accepted: wav, mp3, flac, ogg, m4a`));
  },
});

// —— Helper: run Python detector ———————————————————————————————
function runDetector(audioPath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "detector.py");
    const py = spawn("python", [scriptPath, audioPath], { env: process.env });

    let stdout = "";
    let stderr = "";

    py.stdout.on("data", (d) => (stdout += d.toString()));
    py.stderr.on("data", (d) => (stderr += d.toString()));

    py.on("close", (code) => {
      fs.unlink(audioPath, () => {});
      if (code !== 0) {
        // detector.py catches exceptions and prints {"error": "..."} to stdout before sys.exit(1)
        // so try stdout first for the real error message
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
      fs.unlink(audioPath, () => {});
      reject(new Error(`Could not start Python: ${err.message}`));
    });
  });
}

// —— POST /analyze —————————————————————————————————————————————
router.post("/analyze", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No audio file uploaded." });

  try {
    const result = await runDetector(req.file.path);
    return res.json({ filename: req.file.originalname, ...result });
  } catch (err) {
    console.error("[deepfake] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// —— Multer error handler ——————————————————————————————————————
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err.message.startsWith("Unsupported")) {
    return res.status(400).json({ error: err.message });
  }
  console.error("[deepfake] Unhandled:", err);
  return res.status(500).json({ error: "Internal server error." });
});

module.exports = router;
