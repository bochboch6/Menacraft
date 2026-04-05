import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import '../styles/Home.css';
import '../styles/Media.css';

const API_URL = 'http://localhost:5000/api/media/analyze';

const ACCEPTED = '.wav,.mp3,.flac,.ogg,.m4a,.jpg,.jpeg,.png,.pdf,.webp,.gif,.mp4,.webm,.mov';

// ── file type detection ────────────────────────────────────────
function getFileCategory(file) {
  if (!file) return null;
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type === 'application/pdf') return 'document';
  return 'unknown';
}

const CATEGORY_META = {
  audio: { icon: '🎵', label: 'Audio',  accept: 'WAV · MP3 · FLAC · OGG · M4A', formField: 'file' },
  image: { icon: '🖼️', label: 'Image',  accept: 'JPG · PNG · WEBP · GIF',        formField: 'file' },
  video: { icon: '🎬', label: 'Video',  accept: 'MP4 · WEBM · MOV',              formField: 'file' },
  document: { icon: '📄', label: 'Document', accept: 'PDF', formField: 'file' },
};

export default function Media() {
  const [file,     setFile]     = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);
  const inputRef = useRef();

  const category = getFileCategory(file);

  function handleFile(f) {
    if (!f) return;
    const cat = getFileCategory(f);
    if (cat === 'unknown') {
      setError(`Unsupported file type "${f.type || f.name}". Use the Post page for documents.`);
      return;
    }
    setResult(null);
    setError(null);
    setFile(f);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res  = await fetch(API_URL, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setFile(null);
    setError(null);
  }

  return (
    <div className="home-wrapper page-wrapper">
      <nav className="mc-navbar">
        <Link to="/" className="mc-logo">
          <span className="mc-logo-icon">⚔️</span>
          <span className="mc-logo-text">زعمة صحيحة؟</span>
        </Link>
        <Link to="/" className="mc-nav-btn">← Home</Link>
      </nav>

      <main className="page-main">

        {/* ── Header ── */}
        <div className="page-header">
          <span className="page-icon">🔬</span>
          <h1 className="page-title page-title-green">Media Verification</h1>
        </div>

        {/* ── Guide ── */}
        <div className="page-guide" data-label="📋 HOW IT WORKS">
          <ul className="guide-steps">
            <li>
              <span className="step-num">01</span>
              Upload an image, video, or audio file using the zone below.
            </li>
            <li>
              <span className="step-num">02</span>
              <strong>Audio</strong> → two local AI models detect deepfakes &amp; voice cloning.
              &nbsp;<strong>Images/Videos</strong> → Hive AI checks for AI-generation &amp; manipulation.
            </li>
            <li>
              <span className="step-num">03</span>
              Get a detailed verdict with confidence scores and a clear explanation.
            </li>
          </ul>
        </div>

        {/* ── Upload zone ── */}
        {!result && (
          <div
            className={`upload-zone ${dragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current.click()}
          >
            <input
              ref={inputRef}
              type="file"
              className="upload-hidden"
              accept={ACCEPTED}
              onChange={(e) => handleFile(e.target.files[0])}
              onClick={(e) => e.stopPropagation()}
            />

            {file ? (
              <>
                <span className="upload-icon">{CATEGORY_META[category]?.icon || '📁'}</span>
                <div className="upload-file-name">📁 {file.name}</div>
                <p className="upload-sublabel">
                  {CATEGORY_META[category]?.label} detected · Click to change file
                </p>
              </>
            ) : (
              <>
                <span className="upload-icon">📂</span>
                <p className="upload-label">DRAG & DROP YOUR FILE HERE<br/>or click to browse</p>
                <p className="upload-sublabel">
                  🎵 Audio: WAV · MP3 · FLAC · OGG · M4A &nbsp;|&nbsp;
                  🖼️ Image: JPG · PNG · WEBP · GIF &nbsp;|&nbsp;
                  🎬 Video: MP4 · WEBM · MOV &nbsp;|&nbsp;
                  📄 Document: PDF
                </p>
                <p className="upload-sublabel" style={{ marginTop: 4 }}>Max 50 MB</p>
              </>
            )}
          </div>
        )}

        {/* ── Analyze button ── */}
        {file && !loading && !result && (
          <div className="analyze-btn-wrap">
            <button className="mc-analyze-btn" onClick={analyze}>
              <span className="analyze-btn-icon">🔍</span>
              ANALYZE {category ? category.toUpperCase() : 'FILE'}
            </button>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="media-loading">
            <div className="loading-blocks">
              <span /><span /><span /><span />
            </div>
            <p className="loading-text">
              Analyzing {category || 'file'}… this may take a moment
            </p>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="media-error">
            <span>⚠️</span>
            <p>{error}</p>
            <button className="mc-nav-btn" onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        {/* ── Results ── */}
        {result && result.file_type === 'audio'    && <AudioResult    result={result} onReset={reset} />}
        {result && result.file_type === 'image'    && <ImageResult    result={result} onReset={reset} />}
        {result && result.file_type === 'video'    && <VideoResult    result={result} onReset={reset} />}
        {result && result.file_type === 'document' && <DocumentResult result={result} onReset={reset} />}

      </main>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  AUDIO RESULT  (Python deepfake detector)
// ══════════════════════════════════════════════════════════════
function AudioResult({ result, onReset }) {
  const meta = audioVerdictMeta(result.status);

  return (
    <div className={`result-panel result-${meta.key}`}>
      <div className="result-header">
        <span className="result-icon">{meta.icon}</span>
        <div>
          <div className="result-label">🎵 AUDIO DEEPFAKE VERDICT</div>
          <div className="result-status" style={{ color: meta.color }}>{result.status}</div>
        </div>
      </div>

      <ConfBar label="FAKE PROBABILITY" value={result.confidence} color={meta.color} />

      <div className="result-footer">
        <span className="result-filename">📁 {result.filename}</span>
        <button className="mc-nav-btn" onClick={onReset}>Analyze Another</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  IMAGE RESULT  (Hive API)
// ══════════════════════════════════════════════════════════════
function ImageResult({ result, onReset }) {
  const aiVerdict  = result.verdict?.ai_generated;
  const dfVerdict  = result.verdict?.deepfake;
  const isFake     = aiVerdict === 'AI_GENERATED' || dfVerdict === 'DEEPFAKE_DETECTED';
  const isReal     = aiVerdict === 'REAL' && dfVerdict === 'NO_DEEPFAKE';
  const meta       = isFake ? { key:'fake', icon:'🚨', color:'#e53935', label:'Suspicious / AI Generated' }
                   : isReal ? { key:'real', icon:'✅', color:'#2daa3f', label:'Appears Authentic' }
                   :          { key:'uncertain', icon:'⚠️', color:'#4dd0e1', label:'Uncertain' };

  const aiPct  = Math.round((result.scores?.ai_generated || 0) * 100);
  const dfPct  = Math.round((result.scores?.deepfake      || 0) * 100);

  return (
    <div className={`result-panel result-${meta.key}`}>
      <div className="result-header">
        <span className="result-icon">{meta.icon}</span>
        <div>
          <div className="result-label">🖼️ IMAGE ANALYSIS VERDICT</div>
          <div className="result-status" style={{ color: meta.color }}>{meta.label}</div>
        </div>
      </div>

      <ConfBar label="AI-GENERATED PROBABILITY" value={aiPct}  color="#e53935" />
      <ConfBar label="DEEPFAKE PROBABILITY"      value={dfPct}  color="#ff7043" />

      {result.generators && result.generators.length > 0 && (
        <div className="generators-section">
          <div className="gen-title">🎨 DETECTED GENERATOR</div>
          <div className="gen-list">
            {result.generators.map((g) => (
              <div key={g.name} className="gen-row">
                <span className="gen-name">{g.name}</span>
                <div className="model-bar-track" style={{ flex: 1 }}>
                  <div
                    className="model-bar-fill"
                    style={{ width: `${Math.round(g.score * 100)}%`, background: '#e53935' }}
                  />
                </div>
                <span className="model-pct">{Math.round(g.score * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.anomalies && (
        <div className="ai-description">
          <div className="ai-desc-label">🔎 ANOMALIES DETECTED</div>
          <p className="ai-desc-text">{result.anomalies}</p>
        </div>
      )}

      <div className="result-footer">
        <span className="result-filename">📁 {result.filename}</span>
        <button className="mc-nav-btn" onClick={onReset}>Analyze Another</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  VIDEO RESULT  (Hive API)
// ══════════════════════════════════════════════════════════════
function VideoResult({ result, onReset }) {
  const s         = result.summary || {};
  const aiPeak    = Math.round((s.ai_generated_peak || 0) * 100);
  const dfPeak    = Math.round((s.deepfake_peak      || 0) * 100);
  const auPeak    = Math.round((s.ai_audio_peak      || 0) * 100);

  const v         = result.verdict || {};
  const isFake    = v.ai_generated === 'AI_GENERATED' || v.deepfake === 'DEEPFAKE_DETECTED';
  const isReal    = v.ai_generated === 'REAL' && v.deepfake === 'NO_DEEPFAKE';
  const meta      = isFake ? { key:'fake', icon:'🚨', color:'#e53935', label:'Suspicious / AI Generated' }
                  : isReal ? { key:'real', icon:'✅', color:'#2daa3f', label:'Appears Authentic' }
                  :          { key:'uncertain', icon:'⚠️', color:'#4dd0e1', label:'Uncertain' };

  return (
    <div className={`result-panel result-${meta.key}`}>
      <div className="result-header">
        <span className="result-icon">{meta.icon}</span>
        <div>
          <div className="result-label">🎬 VIDEO ANALYSIS VERDICT</div>
          <div className="result-status" style={{ color: meta.color }}>{meta.label}</div>
        </div>
      </div>

      {result.frame_count && (
        <p className="frame-count-note">Analyzed across {result.frame_count} frames</p>
      )}

      <ConfBar label="AI-GENERATED PEAK"   value={aiPeak} color="#e53935" />
      <ConfBar label="DEEPFAKE PEAK"        value={dfPeak} color="#ff7043" />
      {auPeak > 0 && (
        <ConfBar label="AI AUDIO PEAK"      value={auPeak} color="#ab47bc" />
      )}

      <div className="verdict-tags">
        <VerdictTag label="AI Visual" value={v.ai_generated} />
        <VerdictTag label="Deepfake"  value={v.deepfake}     dfMode />
        <VerdictTag label="AI Audio"  value={v.ai_audio}     audioMode />
      </div>

      {result.anomalies && (
        <div className="ai-description">
          <div className="ai-desc-label">🔎 ANOMALIES DETECTED</div>
          <p className="ai-desc-text">{result.anomalies}</p>
        </div>
      )}

      <div className="result-footer">
        <span className="result-filename">📁 {result.filename}</span>
        <button className="mc-nav-btn" onClick={onReset}>Analyze Another</button>
      </div>
    </div>
  );
}

// ── shared sub-components ──────────────────────────────────────
function ConfBar({ label, value, color }) {
  return (
    <div className="conf-bar-wrap">
      <div className="conf-bar-label">
        <span>{label}</span>
        <span style={{ color }}>{value}%</span>
      </div>
      <div className="conf-bar-track">
        <div
          className="conf-bar-fill"
          style={{ width: `${value}%`, background: color, boxShadow: `0 0 8px ${color}` }}
        />
      </div>
    </div>
  );
}

function VerdictTag({ label, value, dfMode, audioMode }) {
  const positiveValues = dfMode
    ? ['DEEPFAKE_DETECTED']
    : audioMode
    ? ['AI_AUDIO']
    : ['AI_GENERATED'];

  const negativeValues = dfMode
    ? ['NO_DEEPFAKE']
    : audioMode
    ? ['REAL_AUDIO']
    : ['REAL'];

  const isBad  = positiveValues.includes(value);
  const isGood = negativeValues.includes(value);
  const color  = isBad ? '#e53935' : isGood ? '#2daa3f' : '#4dd0e1';

  return (
    <div className="verdict-tag" style={{ borderColor: color, color }}>
      <span className="verdict-tag-label">{label}</span>
      <span className="verdict-tag-value">{value || '—'}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  DOCUMENT RESULT  (PDF → Copyleaks)
// ══════════════════════════════════════════════════════════════
function DocumentResult({ result, onReset }) {
  const isAI  = result.verdict === 'ai';
  const color = isAI ? '#e53935' : '#2daa3f';
  const icon  = isAI ? '🚨' : '✅';
  const label = isAI ? 'AI-Generated Content' : 'Human-Written Content';

  return (
    <div className={`result-panel result-${isAI ? 'fake' : 'real'}`}>
      <div className="result-header">
        <span className="result-icon">{icon}</span>
        <div>
          <div className="result-label">📄 DOCUMENT AI DETECTION</div>
          <div className="result-status" style={{ color }}>{label}</div>
        </div>
      </div>

      <ConfBar label="AI SCORE"    value={result.aiScore}    color="#e53935" />
      <ConfBar label="HUMAN SCORE" value={result.humanScore} color="#2daa3f" />

      <div className="generators-section">
        <div className="gen-title">🧠 DETECTION SIGNALS</div>
        <div className="gen-list">
          {result.reasons.map((r, i) => (
            <div key={i} style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10, fontFamily: 'var(--mc-body-font)', fontSize: 13, color: '#bbb', lineHeight: 1.5 }}>
              {r}
            </div>
          ))}
        </div>
      </div>

      <div className="result-footer">
        <span className="result-filename">📁 {result.filename} · {result.wordCount} words</span>
        <button className="mc-nav-btn" onClick={onReset}>Analyze Another</button>
      </div>
    </div>
  );
}

// ── audio verdict helper ───────────────────────────────────────
function audioVerdictMeta(status) {
  if (status === 'Likely Real')              return { key: 'real',      icon: '✅', color: '#2daa3f' };
  if (status === 'Suspicious / Likely Fake') return { key: 'fake',      icon: '🚨', color: '#e53935' };
  return                                            { key: 'uncertain', icon: '⚠️', color: '#4dd0e1' };
}
