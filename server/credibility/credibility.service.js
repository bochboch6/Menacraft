/**
 * credibility/credibility.service.js
 * Analyzes a URL or text for source credibility / misinformation signals.
 * Reasons are dynamic — derived from what was actually detected.
 */

const axios = require("axios");

function extractUrl(text) {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// ── URL / Domain checks ──────────────────────────────────────────

function checkSuspiciousTld(domain) {
  const bad = [".xyz",".top",".click",".loan",".win",".gq",".cf",".tk",".ml",".ga",".icu",".pw",".buzz"];
  const found = bad.find(tld => domain.endsWith(tld));
  if (found) return { score: 30, flag: `⚠️ Suspicious domain extension detected (${found})`, reason: `The domain uses a "${found}" extension commonly associated with low-credibility or spam sites.` };
  return null;
}

function checkTrustedDomain(domain) {
  const trusted = ["bbc.com","bbc.co.uk","reuters.com","apnews.com","nytimes.com","theguardian.com",
    "france24.com","aljazeera.net","aljazeera.com","lemonde.fr","cnn.com","washingtonpost.com",
    "bloomberg.com","economist.com","nature.com","science.org","who.int","un.org",
    "facebook.com","instagram.com","twitter.com","x.com","youtube.com","tiktok.com","linkedin.com"];
  if (trusted.includes(domain)) return { score: -20, flag: `✅ Domain is a well-known trusted source (${domain})`, reason: `${domain} is a globally recognized and established platform.` };
  return null;
}

function checkDomainLength(domain) {
  const name = domain.split(".")[0];
  const flags = [], reasons = [];
  let score = 0;
  if (name.length > 20) {
    score += 15;
    flags.push("⚠️ Unusually long domain name — may indicate auto-generated or spam domain");
    reasons.push("The domain name is unusually long, which is a common pattern in auto-generated spam domains.");
  }
  if (/[a-z]{2,}\d{3,}|[0-9]{3,}[a-z]{2,}/.test(name)) {
    score += 20;
    flags.push("⚠️ Domain name mixes letters and numbers — random-generation pattern");
    reasons.push("The domain mixes letters and numbers in a pattern typical of machine-generated or disposable sites.");
  }
  return { score, flags, reasons };
}

function checkTyposquatting(domain) {
  const trusted = ["bbc","cnn","reuters","aljazeera","nytimes","guardian","france24","apnews",
                   "facebook","instagram","twitter","youtube","google","wikipedia"];
  for (const t of trusted) {
    if (domain.includes(t) && !domain.endsWith(`${t}.com`) && !domain.endsWith(`${t}.net`) && !domain.endsWith(`${t}.org`))
      return { score: 40, flag: `🚨 Possible typosquatting of "${t}"`, reason: `The domain contains "${t}" but is not the official site — this is a known impersonation tactic.` };
  }
  return null;
}

async function fetchRdap(domain) {
  const { data } = await axios.get(`https://rdap.org/domain/${domain}`, { timeout: 10000 });

  const events  = data.events || [];
  const getDate = (action) => events.find(e => e.eventAction === action)?.eventDate || null;

  const createdRaw = getDate("registration");
  const expiryRaw  = getDate("expiration");
  const updatedRaw = getDate("last changed");

  // Extract registrar from entities
  let registrar = null;
  for (const entity of (data.entities || [])) {
    if (entity.roles?.includes("registrar")) {
      const fn = entity.vcardArray?.[1]?.find(v => v[0] === "fn");
      registrar = fn?.[3] || null;
      break;
    }
  }

  const fmt     = (d) => d ? new Date(d).toISOString().slice(0, 10) : "N/A";
  const ageDays = createdRaw
    ? Math.floor((Date.now() - new Date(createdRaw).getTime()) / 86400000)
    : null;

  return {
    ageDays,
    domainInfo: {
      registered: fmt(createdRaw),
      expires:    fmt(expiryRaw),
      updated:    fmt(updatedRaw),
      registrar:  registrar || "Unknown",
      age:        ageDays !== null
        ? (ageDays >= 365 ? `${Math.floor(ageDays / 365)} year(s)` : `${ageDays} day(s)`)
        : "Unknown",
    },
  };
}

async function checkDomainAge(domain) {
  try {
    const { ageDays, domainInfo } = await fetchRdap(domain);

    if (ageDays === null) throw new Error("no date");

    if (ageDays < 30)
      return { score: 40, flag: `🚨 Domain registered only ${ageDays} day(s) ago — very new`, reason: `This domain was registered only ${ageDays} day(s) ago. Newly registered domains are frequently used in misinformation campaigns.`, domainInfo };
    if (ageDays < 180)
      return { score: 20, flag: `⚠️ Domain is relatively new — registered ${domainInfo.age} ago`, reason: `The domain is less than 6 months old, limiting the ability to verify its track record.`, domainInfo };

    return { score: 0, flag: `✅ Domain has been active for ${domainInfo.age}`, reason: null, domainInfo };
  } catch {
    return { score: 5, flag: "ℹ️ Domain registration info could not be retrieved", reason: null, domainInfo: null };
  }
}

function checkHttps(url) {
  if (url.startsWith("http://"))
    return { score: 15, flag: "⚠️ URL uses HTTP (not HTTPS) — connection is not encrypted", reason: "The page uses an unencrypted HTTP connection, which is unusual for legitimate news or information sites." };
  return { score: 0, flag: "✅ URL uses HTTPS (secure connection)", reason: null };
}

function checkShortener(url) {
  const shorteners = ["bit.ly","tinyurl","t.co","goo.gl","ow.ly","shorturl","rb.gy","cutt.ly"];
  if (shorteners.some(s => url.includes(s)))
    return { score: 25, flag: "⚠️ URL is a shortened link — the real destination is hidden", reason: "Shortened URLs hide the actual destination, making it impossible to verify the source before clicking." };
  return null;
}

function checkSubdomains(domain) {
  const parts = domain.split(".");
  if (parts.length > 3) {
    return { score: 15, flag: `⚠️ Multiple subdomains detected (${domain}) — may mask the real host`, reason: "Excessive subdomains can be used to make a fake domain look more legitimate by resembling a trusted site." };
  }
  return null;
}

function checkIpAddress(url) {
  if (/https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url))
    return { score: 35, flag: "🚨 URL uses a raw IP address instead of a domain name", reason: "Legitimate websites almost never use raw IP addresses — this is a strong indicator of a suspicious or phishing site." };
  return null;
}

// ── Text-only checks ─────────────────────────────────────────────

function checkCapsWords(text) {
  const capsWords = text.split(/\s+/).filter(w => w.length > 3 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (capsWords.length > 3)
    return { score: 20, flag: `⚠️ ${capsWords.length} ALL-CAPS words detected — clickbait signal`, reason: `Using all-caps words like "${capsWords.slice(0,3).join('", "')}" is a classic emotional manipulation tactic.` };
  return null;
}

function checkPunctuation(text) {
  const excl = (text.match(/!/g) || []).length;
  const ques = (text.match(/\?/g) || []).length;
  if (excl + ques > 5)
    return { score: 15, flag: `⚠️ Excessive punctuation (${excl} "!", ${ques} "?") — emotional manipulation signal`, reason: "Overuse of exclamation marks and question marks is used to trigger emotional responses and bypass critical thinking." };
  return null;
}

function checkSensationalKeywords(text) {
  const keywords = ["BREAKING","SHOCKING","EXPOSED","SECRET","URGENT","BANNED",
                    "CENSORED","LEAKED","EXCLUSIVE","MUST READ","SHARE NOW","HOAX","FAKE NEWS"];
  const found = keywords.filter(k => text.toUpperCase().includes(k));
  if (found.length)
    return { score: 35, flag: `⚠️ Sensational keywords detected: ${found.join(", ")}`, reason: `Words like "${found[0]}" are used to trigger urgency and emotional reactions, common in misinformation.` };
  return null;
}

function checkContentLength(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 20)
    return { score: 10, flag: "⚠️ Very short content — not enough to verify credibility", reason: "The content is too short to assess its credibility or verify its claims." };
  return { score: 0, flag: "✅ Content length is sufficient for analysis", reason: null };
}

function checkSourceMention(text) {
  const signals = ["according to","reported by","source:","via","published by","study shows","cited by","as stated by"];
  if (!signals.some(s => text.toLowerCase().includes(s)))
    return { score: 15, flag: "⚠️ No source or reference mentioned in the content", reason: "Credible content typically cites sources. The absence of any attribution is a weak credibility signal." };
  return { score: 0, flag: "✅ Content references a source or attribution", reason: null };
}

// ── Risk level mapper ────────────────────────────────────────────

function mapRiskLevel(score) {
  if (score >= 60) return { level: "HIGH",   label: "🔴 HIGH RISK" };
  if (score >= 30) return { level: "MEDIUM", label: "🟡 MEDIUM RISK" };
  return                  { level: "LOW",    label: "🟢 LOW RISK" };
}

function buildSummary(level, flags) {
  const badFlags = flags.filter(f => f.startsWith("⚠️") || f.startsWith("🚨"));
  if (level === "HIGH")   return `${badFlags.length} suspicious signal(s) detected. This source should not be trusted without independent verification.`;
  if (level === "MEDIUM") return `${badFlags.length} signal(s) require attention. Verify this source before sharing its content.`;
  return badFlags.length === 0
    ? "No suspicious signals detected. This source passes basic credibility checks."
    : `1 minor signal detected. The source appears credible but review the flag below.`;
}

// ── Main export ──────────────────────────────────────────────────

async function analyzeSource(input) {
  if (!input?.trim()) throw new Error("Input must be a non-empty string.");

  const url   = extractUrl(input);
  let score   = 0;
  const flags = [];
  const reasons = [];

  let domainInfo = null;

  const addCheck = (result) => {
    if (!result) return;
    score += result.score || 0;
    if (result.flag)       flags.push(result.flag);
    if (result.reason)     reasons.push(result.reason);
    if (result.domainInfo) domainInfo = result.domainInfo;
  };

  const addMulti = (result) => {
    if (!result) return;
    score += result.score || 0;
    (result.flags   || []).forEach(f => flags.push(f));
    (result.reasons || []).forEach(r => reasons.push(r));
  };

  if (url) {
    const domain = extractDomain(url);

    addCheck(checkIpAddress(url));
    addCheck(checkShortener(url));
    addCheck(checkHttps(url));
    addCheck(checkTrustedDomain(domain));
    addCheck(checkSuspiciousTld(domain));
    addMulti(checkDomainLength(domain));
    addCheck(checkTyposquatting(domain));
    addCheck(checkSubdomains(domain));
    addCheck(await checkDomainAge(domain));
  } else {
    addCheck(checkCapsWords(input));
    addCheck(checkPunctuation(input));
    addCheck(checkSensationalKeywords(input));
    addCheck(checkContentLength(input));
    addCheck(checkSourceMention(input));
  }

  score = Math.max(0, Math.min(score, 100));
  const risk = mapRiskLevel(score);

  return {
    url,
    riskScore:  score,
    riskLevel:  risk.level,
    riskLabel:  risk.label,
    summary:    buildSummary(risk.level, flags),
    flags,
    reasons:    reasons.length ? reasons : ["No specific issues were identified for this source."],
    domainInfo: domainInfo || null,
  };
}

module.exports = { analyzeSource };
