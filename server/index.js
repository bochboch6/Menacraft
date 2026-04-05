const express      = require("express");
const cors         = require("cors");
const path         = require("path");
const { spawn }    = require("child_process");
const deepfakeRouter  = require("./deepfake/index");          // legacy audio-only route
const mediaRouter     = require("./routes/media");             // unified route (audio + image + video)
const pdfRouter         = require("./pdf/pdf.routes");
const copyleaksRouter   = require("./copyleaks/copyleaks.routes");
const accountRouter     = require("./account/account.routes");
const credibilityRouter = require("./credibility/credibility.routes");
const coherenceRouter   = require("./coherence/coherence.routes");

const app  = express();
const PORT = process.env.PORT || 5000;
const HIVE_API_KEY = "jO0l35Xs+OuRGBEPpLYTlw=="

// —— Start extractor service alongside main server ——————————————
const extractor = spawn(
  "node",
  [path.join(__dirname, "extractor/index.js")],
  { stdio: "inherit", env: process.env }
);
extractor.on("error", (err) => console.error("[extractor] Failed to start:", err.message));
extractor.on("exit",  (code) => { if (code !== 0) console.warn(`[extractor] Exited with code ${code}`); });

// —— Middleware ————————————————————————————————————————————————
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// —— Routes ————————————————————————————————————————————————————
app.use("/api/deepfake",   deepfakeRouter);    // kept for backward-compat
app.use("/api/media",      mediaRouter);       // POST /api/media/analyze
app.use("/api/pdf",          pdfRouter);
app.use("/api/ai-detector", copyleaksRouter);
app.use("/api/account",     accountRouter);
app.use("/api/credibility", credibilityRouter);
app.use("/api/fullanalyze", coherenceRouter);

app.get("/", (_req, res) => res.json({ status: "ok" }));

// —— Start ————————————————————————————————————————————————————
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Hive API key: ${HIVE_API_KEY ? "✓ set" : "✗ MISSING — images/videos won't work"}`);
});
