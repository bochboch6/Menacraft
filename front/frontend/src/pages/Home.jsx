import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/Home.css';

function Particles() {
  return (
    <div className="particles" aria-hidden="true">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="particle" />
      ))}
    </div>
  );
}


export default function Home() {
  return (
    <div className="home-wrapper">
      <Particles />

      {/* ── NAVBAR ── */}
      <nav className="mc-navbar">
        <Link to="/" className="mc-logo">
          <span className="mc-logo-icon">⚔️</span>
          <span className="mc-logo-text">زعمة صحيحة؟</span>
        </Link>
        <ul className="mc-nav-links">
          <li><Link to="/"        className="mc-nav-btn">Home</Link></li>
          <li><Link to="/about"   className="mc-nav-btn">About</Link></li>
          <li><Link to="/how"     className="mc-nav-btn">How It Works</Link></li>
        </ul>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <main className="home-content">

        {/* ── HERO ── */}
        <section className="hero-section">
          <h1 className="hero-title-arabic">زعمة صحيحة؟</h1>
          <p className="hero-subtitle">Truth Verification Powered by AI</p>
        </section>

        {/*<GrassDivider /> */}

        {/* ── DESCRIPTION PANEL ── */}
        <div className="mc-book-panel">
          <p>
            In a world where photos, videos, and documents can be faked or manipulated
            in seconds, knowing what's real has never been harder. زعمة صحيحة؟ is an
            AI-powered verification platform that fights misinformation by analyzing
            three critical dimensions:
          </p>

          <ul>
            <li>
              <span className="li-icon">🧠</span>
              <span>
                <strong>Content Authenticity</strong> — Detects AI-generated or tampered
                media (images, videos, audio, documents)
              </span>
            </li>
            <li>
              <span className="li-icon">🔍</span>
              <span>
                <strong>Contextual Consistency</strong> — Checks whether content is being
                used in a misleading or out-of-context way
              </span>
            </li>
            <li>
              <span className="li-icon">🌐</span>
              <span>
                <strong>Source Credibility</strong> — Evaluates whether the source of a
                claim or content can be trusted
              </span>
            </li>
          </ul>

          <p className="panel-footer">
            Submit media, a post, or a profile/website URL — and get an instant AI verdict
            with a confidence score and a clear explanation.
          </p>
        </div>

        {/* ── ACTION BUTTONS ── */}
        <section className="action-buttons-section">
          <p className="action-buttons-title">▶ SELECT VERIFICATION TYPE</p>

          <div className="action-buttons-grid">
            {/* Media */}
            <Link to="/media" className="mc-action-btn mc-btn-media">
              <span className="btn-icon">🎬</span>
              <span className="btn-label">Upload Content</span>
              <span className="btn-sublabel">Images · Videos · Audio · PDF</span>
            </Link>

            {/* Post */}
            <Link to="/post" className="mc-action-btn mc-btn-post">
              <span className="btn-icon">📜</span>
              <span className="btn-label">Content link</span>
              <span className="btn-sublabel">Articles · Social Posts</span>
            </Link>

            {/* Profile / Website */}
            <Link to="/profile" className="mc-action-btn mc-btn-profile">
              <span className="btn-icon">🌐</span>
              <span className="btn-label">Website analyser</span>
              <span className="btn-sublabel">Accounts & URLs</span>
            </Link>
          </div>
        </section>

      </main>

      {/* ── FOOTER ── */}
      <footer className="mc-footer">
        <p className="mc-footer-main">⛏️ زعمة صحيحة؟</p>
        <p className="mc-footer-sub">Powered by AI · Fighting Misinformation</p>
      </footer>
    </div>
  );
}
