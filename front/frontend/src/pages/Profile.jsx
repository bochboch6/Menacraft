import { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/Home.css';
import '../styles/Media.css';
import '../styles/Profile.css';

const CREDIBILITY_URL  = 'http://localhost:5000/api/credibility/analyze';
const ACCOUNT_URL      = 'http://localhost:5000/api/account/analyze';
const FULLANALYZE_URL  = 'http://localhost:5000/api/fullanalyze/analyze';

export default function Profile() {
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);

  const hasContent = input.trim().length > 0;

  function reset() { setResult(null); setError(null); }

  // ── Full Analyzer button ───────────────────────────────────────
  async function runFullAnalyzer() {
    const url = input.trim();
    if (!url) return;

    const extractor = window.MediaExtractor;
    if (!extractor) { setError('MediaExtractor not loaded. Please refresh the page.'); return; }

    const platform = extractor.detectPlatform(url);
    if (platform === 'unknown') {
      setError('Error — please enter a valid URL (e.g. https://example.com)');
      return;
    }

    setLoading(true); setResult(null); setError(null);

    try {
      const extracted = await extractor.extract(url);

      // Build posts array: each item needs a caption + imageUrl
      let posts = [];

      if (extracted.posts?.length) {
        // Instagram / Facebook: per-post analysis
        posts = extracted.posts
          .filter(p => p.images?.[0]?.src || p.imageUrl)
          .map(p => ({
            caption:  p.caption || extracted.desc || '',
            imageUrl: p.images?.[0]?.src || p.imageUrl || '',
          }));
      }

      // Fallback: use ogImage / first image from page
      if (!posts.length) {
        const imageUrl = extracted.ogImage || extracted.images?.[0]?.src || '';
        if (!imageUrl) throw new Error('No image found in the URL to analyze.');
        posts = [{ caption: extracted.desc || extracted.text?.slice(0, 500) || '', imageUrl }];
      }

      const res  = await fetch(FULLANALYZE_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ posts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Full analysis failed');
      setResult({ type: 'fullanalyze', platform, ...data });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Source Credibility button ──────────────────────────────────
  async function runSourceCredibility() {
    const url = input.trim();
    if (!url) return;

    // Validate it's a URL
    const extractor = window.MediaExtractor;
    if (!extractor) { setError('MediaExtractor not loaded. Please refresh the page.'); return; }

    const platform = extractor.detectPlatform(url);

    if (platform === 'unknown') {
      setError('Error — please enter a valid URL (e.g. https://example.com)');
      return;
    }

    setLoading(true); setResult(null); setError(null);

    try {
      if (platform === 'facebook' || platform === 'instagram') {
        // Try full account extraction (requires Apify token)
        try {
          const extracted = await extractor.extract(url);
          const res  = await fetch(ACCOUNT_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(extracted),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Account analysis failed');
          setResult({ type: 'account', platform, ...data });
        } catch (extractErr) {
          // Apify not configured — fall back to URL credibility check
          const res  = await fetch(CREDIBILITY_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ input: url }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Credibility analysis failed');
          setResult({ type: 'credibility', platform, fallback: true, ...data });
        }

      } else {
        // web / youtube / tiktok → source credibility check
        const res  = await fetch(CREDIBILITY_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ input: url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Credibility analysis failed');
        setResult({ type: 'credibility', platform, ...data });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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

        <div className="page-header">
          <span className="page-icon">🌐</span>
          <h1 className="page-title page-title-gray">Website Analyser</h1>
        </div>

        <div className="page-guide" data-label="📋 HOW IT WORKS">
          <ul className="guide-steps">
            <li>
              <span className="step-num">01</span>
              Enter any URL — a website, article, Facebook or Instagram post.
            </li>
            <li>
              <span className="step-num">02</span>
              <strong>Source Credibility</strong> — for Facebook/Instagram it analyses account behaviour (engagement, content, keywords). For any website it checks domain age, TLD, HTTPS and misinformation signals.
            </li>
            <li>
              <span className="step-num">03</span>
              <strong>Full Analyzer</strong> — coming soon.
            </li>
          </ul>
        </div>

        {/* URL input */}
        {!result && (
          <div className="mc-input-wrapper">
            <label className="mc-input-label">🌐 ENTER URL</label>
            <input
              type="url"
              className="mc-input"
              placeholder="https://facebook.com/post/...  or  https://example.com/article"
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(null); }}
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="media-error">
            <span>⚠️</span>
            <p>{error}</p>
            <button className="mc-nav-btn" onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        {/* Two buttons */}
        {hasContent && !loading && !result && (
          <div className="profile-btn-row">
            <button className="profile-btn profile-btn-credibility" onClick={runSourceCredibility}>
              <span className="analyze-btn-icon">🔎</span>
              SOURCE CREDIBILITY
            </button>
            <button className="profile-btn profile-btn-full" onClick={runFullAnalyzer}>
              <span className="analyze-btn-icon">🧠</span>
              FULL ANALYZER
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="media-loading">
            <div className="loading-blocks"><span/><span/><span/><span/></div>
            <p className="loading-text">Analyzing… this may take a moment</p>
          </div>
        )}

        {/* Results */}
        {result?.type === 'credibility'  && <CredibilityResult   result={result} onReset={reset} />}
        {result?.type === 'account'      && <AccountResult       result={result} onReset={reset} />}
        {result?.type === 'fullanalyze'  && <FullAnalyzerResult  result={result} onReset={reset} />}

      </main>
    </div>
  );
}

// ── Source Credibility Result (web/youtube/tiktok) ─────────────────
function CredibilityResult({ result, onReset }) {
  const colorMap = { LOW: '#2daa3f', MEDIUM: '#ffb300', HIGH: '#e53935' };
  const keyMap   = { LOW: 'real',    MEDIUM: 'uncertain', HIGH: 'fake' };
  const color    = colorMap[result.riskLevel] || '#4dd0e1';
  const panelKey = keyMap[result.riskLevel]   || 'uncertain';
  const icon     = result.riskLevel === 'LOW' ? '✅' : result.riskLevel === 'HIGH' ? '🚨' : '⚠️';

  return (
    <div className={`result-panel result-${panelKey}`}>
      <div className="result-header">
        <span className="result-icon">{icon}</span>
        <div>
          <div className="result-label">🔎 SOURCE CREDIBILITY · {result.platform?.toUpperCase()}</div>
          <div className="result-status" style={{ color }}>{result.riskLabel}</div>
        </div>
      </div>

      <ConfBar label="RISK SCORE" value={result.riskScore} color={color} />

      {result.fallback && (
        <div className="profile-fallback-note">
          ℹ️ Full social media analysis requires an Apify token. Showing URL-based credibility check instead.
        </div>
      )}

      <div className="profile-summary">{result.summary}</div>

      {result.domainInfo && (
        <div className="generators-section">
          <div className="gen-title">🗂️ DOMAIN REGISTRATION INFO</div>
          <div className="domain-info-grid">
            <div className="domain-info-row"><span className="domain-info-key">Registered</span><span className="domain-info-val">{result.domainInfo.registered}</span></div>
            <div className="domain-info-row"><span className="domain-info-key">Expires</span><span className="domain-info-val">{result.domainInfo.expires}</span></div>
            <div className="domain-info-row"><span className="domain-info-key">Last Updated</span><span className="domain-info-val">{result.domainInfo.updated}</span></div>
            <div className="domain-info-row"><span className="domain-info-key">Age</span><span className="domain-info-val" style={{ color }}>{result.domainInfo.age}</span></div>
            <div className="domain-info-row"><span className="domain-info-key">Registrar</span><span className="domain-info-val">{result.domainInfo.registrar}</span></div>
          </div>
        </div>
      )}

      <div className="generators-section">
        <div className="gen-title">🚩 SIGNALS DETECTED</div>
        <div className="gen-list">
          {result.flags.map((f, i) => (
            <div key={i} className="profile-flag">{f}</div>
          ))}
        </div>
      </div>

      <div className="generators-section">
        <div className="gen-title">🧾 REASONS</div>
        <div className="gen-list">
          {result.reasons.map((r, i) => (
            <div key={i} className="profile-reason" style={{ borderLeftColor: color }}>{r}</div>
          ))}
        </div>
      </div>

      <div className="result-footer">
        {result.url && <span className="result-filename">🌐 {result.url}</span>}
        <button className="mc-nav-btn" onClick={onReset}>Analyze Another</button>
      </div>
    </div>
  );
}

// ── Account Behaviour Result (facebook/instagram) ──────────────────
function AccountResult({ result, onReset }) {
  const colorMap = { LOW: '#2daa3f', MEDIUM: '#ffb300', HIGH: '#e53935' };
  const keyMap   = { LOW: 'real',    MEDIUM: 'uncertain', HIGH: 'fake' };
  const color    = colorMap[result.riskLevel] || '#4dd0e1';
  const panelKey = keyMap[result.riskLevel]   || 'uncertain';
  const icon     = result.riskLevel === 'LOW' ? '✅' : result.riskLevel === 'HIGH' ? '🚨' : '⚠️';

  return (
    <div className={`result-panel result-${panelKey}`}>
      <div className="result-header">
        <span className="result-icon">{icon}</span>
        <div>
          <div className="result-label">🧠 ACCOUNT BEHAVIOUR · {result.platform?.toUpperCase()}</div>
          <div className="result-status" style={{ color }}>{result.riskLabel}</div>
        </div>
      </div>

      <ConfBar label="RISK SCORE" value={result.riskScore} color={color} />

      <div className="profile-summary">{result.description}</div>

      <div className="generators-section">
        <div className="gen-title">🚩 SIGNALS DETECTED</div>
        <div className="gen-list">
          {result.flags.map((f, i) => (
            <div key={i} className="profile-flag">{f}</div>
          ))}
        </div>
      </div>

      <div className="generators-section">
        <div className="gen-title">🧾 REASONS</div>
        <div className="gen-list">
          {result.reasons.map((r, i) => (
            <div key={i} className="profile-reason" style={{ borderLeftColor: color }}>{r}</div>
          ))}
        </div>
      </div>

      <div className="result-footer">
        <button className="mc-nav-btn" onClick={onReset}>Analyze Another</button>
      </div>
    </div>
  );
}

// ── Full Analyzer Result ───────────────────────────────────────────
function FullAnalyzerResult({ result, onReset }) {
  const { results = [], platform } = result;

  return (
    <div className="result-panel result-uncertain">
      <div className="result-header">
        <span className="result-icon">🧠</span>
        <div>
          <div className="result-label">🧠 FULL ANALYZER · {platform?.toUpperCase()}</div>
          <div className="result-status" style={{ color: '#4dd0e1' }}>{results.length} post(s) analyzed</div>
        </div>
      </div>

      {results.map((r, i) => (
        <PostCoherenceCard key={i} post={r} index={i} />
      ))}

      <div className="result-footer">
        <button className="mc-nav-btn" onClick={onReset}>Analyze Another</button>
      </div>
    </div>
  );
}

function PostCoherenceCard({ post, index }) {
  if (post.error) {
    return (
      <div className="fa-post-card fa-error">
        <div className="fa-post-num">POST {index + 1}</div>
        <div className="fa-post-error">⚠️ {post.error}</div>
      </div>
    );
  }

  const verdict = post.verdict?.verdict || 'UNKNOWN';
  const verdictColor = { CONSISTENT: '#2daa3f', MISLEADING: '#ffb300', INCONSISTENT: '#e53935' }[verdict] || '#4dd0e1';
  const verdictIcon  = { CONSISTENT: '✅', MISLEADING: '⚠️', INCONSISTENT: '🚨' }[verdict] || '❓';
  const overall      = post.scores?.overall_alignment_score ?? 0;
  const fs           = post.scores?.field_scores || {};

  return (
    <div className="fa-post-card">
      <div className="fa-post-header">
        <span className="fa-post-num">POST {index + 1}</span>
        <span className="fa-verdict" style={{ color: verdictColor }}>{verdictIcon} {verdict}</span>
        <span className="fa-confidence" style={{ color: verdictColor }}>{post.verdict?.confidence_score ?? Math.round(overall)}%</span>
      </div>

      {post.caption && (
        <div className="fa-caption">"{post.caption.slice(0, 200)}{post.caption.length > 200 ? '…' : ''}"</div>
      )}

      <ConfBar label="ALIGNMENT SCORE" value={overall} color={verdictColor} />

      <div className="fa-explanation">{post.verdict?.verdict_explanation}</div>

      {/* Per-field scores */}
      <div className="fa-fields">
        {Object.entries(fs).map(([field, score]) => {
          const barColor = score >= 72 ? '#2daa3f' : score <= 58 ? '#e53935' : '#ffb300';
          return (
            <div key={field} className="fa-field-row">
              <span className="fa-field-name">{field.replace(/_/g, ' ')}</span>
              <div className="fa-field-bar-track">
                <div className="fa-field-bar-fill" style={{ width: `${score}%`, background: barColor }} />
              </div>
              <span className="fa-field-score" style={{ color: barColor }}>{score}</span>
            </div>
          );
        })}
      </div>

      {post.verdict?.red_flags?.length > 0 && (
        <div className="fa-flags">
          {post.verdict.red_flags.map((f, i) => (
            <div key={i} className="profile-flag">🚩 {f}</div>
          ))}
        </div>
      )}

      <div className="fa-recommendation">{post.verdict?.recommendation}</div>
    </div>
  );
}

function ConfBar({ label, value, color }) {
  return (
    <div className="conf-bar-wrap">
      <div className="conf-bar-label">
        <span>{label}</span>
        <span style={{ color }}>{value}%</span>
      </div>
      <div className="conf-bar-track">
        <div className="conf-bar-fill" style={{ width: `${value}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
      </div>
    </div>
  );
}
