import { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/Home.css';
import '../styles/Media.css';
import '../styles/Post.css';
import '../styles/Profile.css';

const FULLANALYZE_URL = 'http://localhost:5000/api/fullanalyze/analyze';

export default function Post() {
  const [urlInput, setUrlInput] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);

  function reset() { setUrlInput(''); setResult(null); setError(null); }

  async function analyzeUrl() {
    const url = urlInput.trim();
    if (!url) return;

    const extractor = window.MediaExtractor;
    if (!extractor) { setError('MediaExtractor not loaded. Please refresh the page.'); return; }

    const platform = extractor.detectPlatform(url);
    if (platform === 'unknown') {
      setError('Error — please enter a valid post URL');
      return;
    }

    setLoading(true); setResult(null); setError(null);

    try {
      const extracted = await extractor.extract(url);

      let posts = [];

      if (extracted.posts?.length) {
        extracted.posts.forEach(p => {
          const imageUrl =
            p.images?.[0]?.src ||
            p.videos?.[0]?.thumb ||
            extracted.ogImage || '';
          if (imageUrl) posts.push({ caption: p.caption || '', imageUrl });
        });
      }

      if (!posts.length) {
        const imageUrl =
          extracted.ogImage ||
          extracted.images?.[0]?.src ||
          extracted.videos?.[0]?.thumb || '';
        if (!imageUrl) throw new Error('No image or thumbnail found in this URL.');
        posts = [{ caption: extracted.desc || extracted.text?.slice(0, 500) || '', imageUrl }];
      }

      const res  = await fetch(FULLANALYZE_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ posts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Full analysis failed');
      setResult({ platform, ...data });
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
          <span className="page-icon">📜</span>
          <h1 className="page-title page-title-brown">Post Verification</h1>
        </div>

        <div className="page-guide" data-label="📋 HOW IT WORKS">
          <ul className="guide-steps">
            <li><span className="step-num">01</span>Paste a Facebook, Instagram, YouTube, or web article URL.</li>
            <li><span className="step-num">02</span>The post is scraped — caption and images/thumbnails are extracted.</li>
            <li><span className="step-num">03</span>AI describes each image, then checks if the caption matches the visual content.</li>
          </ul>
        </div>

        {!result && (
          <>
            <div className="mc-input-wrapper">
              <label className="mc-input-label">🔗 ENTER POST URL</label>
              <input
                type="url"
                className="mc-input"
                placeholder="https://facebook.com/post/...  or  https://instagram.com/p/..."
                value={urlInput}
                onChange={(e) => { setUrlInput(e.target.value); setError(null); }}
              />
            </div>

            {urlInput.trim() && !loading && (
              <div className="analyze-btn-wrap">
                <button
                  className="mc-analyze-btn"
                  style={{ background: '#0d2a38', borderColor: '#4dd0e1', color: '#4dd0e1' }}
                  onClick={analyzeUrl}
                >
                  <span className="analyze-btn-icon">🧠</span>
                  VERIFY POST
                </button>
              </div>
            )}
          </>
        )}

        {loading && (
          <div className="media-loading">
            <div className="loading-blocks"><span/><span/><span/><span/></div>
            <p className="loading-text">Scraping post · describing visuals · checking alignment…</p>
          </div>
        )}

        {error && (
          <div className="media-error">
            <span>⚠️</span>
            <p>{error}</p>
            <button className="mc-nav-btn" onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        {result && <UrlCoherenceResult result={result} onReset={reset} />}

      </main>
    </div>
  );
}

function UrlCoherenceResult({ result, onReset }) {
  const { results = [], platform } = result;
  return (
    <div className="result-panel result-uncertain">
      <div className="result-header">
        <span className="result-icon">🧠</span>
        <div>
          <div className="result-label">🔗 POST CONTENT VERIFICATION · {platform?.toUpperCase()}</div>
          <div className="result-status" style={{ color: '#4dd0e1' }}>{results.length} post(s) analyzed</div>
        </div>
      </div>

      {results.map((r, i) => <PostCoherenceCard key={i} post={r} index={i} />)}

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

  const verdict      = post.verdict?.verdict || 'UNKNOWN';
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

      <div className="conf-bar-wrap">
        <div className="conf-bar-label">
          <span>ALIGNMENT SCORE</span>
          <span style={{ color: verdictColor }}>{overall}%</span>
        </div>
        <div className="conf-bar-track">
          <div className="conf-bar-fill" style={{ width: `${overall}%`, background: verdictColor, boxShadow: `0 0 8px ${verdictColor}` }} />
        </div>
      </div>

      <div className="fa-explanation">{post.verdict?.verdict_explanation}</div>

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
          {post.verdict.red_flags.map((f, i) => <div key={i} className="profile-flag">🚩 {f}</div>)}
        </div>
      )}

      {post.verdict?.key_mismatches?.length > 0 && (
        <div className="generators-section">
          <div className="gen-title">❌ MISMATCHES</div>
          {post.verdict.key_mismatches.map((m, i) => (
            <div key={i} className="profile-reason" style={{ borderLeftColor: '#e53935' }}>{m}</div>
          ))}
        </div>
      )}

      {post.verdict?.key_matches?.length > 0 && (
        <div className="generators-section">
          <div className="gen-title">✅ MATCHES</div>
          {post.verdict.key_matches.map((m, i) => (
            <div key={i} className="profile-reason" style={{ borderLeftColor: '#2daa3f' }}>{m}</div>
          ))}
        </div>
      )}

      <div className="fa-recommendation">{post.verdict?.recommendation}</div>
    </div>
  );
}
