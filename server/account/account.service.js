/**
 * account/account.service.js
 * Analyzes account behavior from extracted Facebook/Instagram data.
 */

function checkImages(images) {
  const count = images.length;
  if (count === 0) return { score: 20, flag: "⚠️  No images found on the account" };
  if (count < 3)   return { score: 10, flag: `⚠️  Very few images (${count}) — low content activity` };
  return { score: 0, flag: `✅  Account has ${count} image(s)` };
}

function checkVideos(videos) {
  const count = videos.length;
  if (count === 0) return { score: 0, flag: "⚠️  No videos found" };
  return { score: 0, flag: `✅  Account has ${count} video(s)` };
}

function checkEngagement(meta) {
  const likes    = meta.likes    || 0;
  const comments = meta.comments || 0;
  const shares   = meta.shares   || 0;

  if (likes === 0 && comments === 0 && shares === 0)
    return { score: 25, flag: "⚠️  Zero engagement detected (likes/comments/shares)" };

  if (likes > 0) {
    const ratio = (comments + shares) / likes;
    if (ratio < 0.01)
      return { score: 15, flag: `⚠️  Very low engagement ratio (${(ratio * 100).toFixed(2)}%)` };
    return { score: 0, flag: `✅  Normal engagement ratio (${(ratio * 100).toFixed(2)}%)` };
  }
  return { score: 0, flag: "✅  Engagement data available" };
}

function checkContentLength(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 10)
    return { score: 15, flag: "⚠️  Very short post content — low information value" };
  return { score: 0, flag: `✅  Post contains ${words.length} words` };
}

function checkSensationalKeywords(text) {
  const keywords = ["BREAKING","SHOCKING","EXPOSED","SECRET","URGENT",
                    "BANNED","SHARE NOW","LEAKED","EXCLUSIVE","CENSORED","MUST READ"];
  const found = keywords.filter(k => text.toUpperCase().includes(k));
  if (found.length)
    return { score: 25, flag: `⚠️  Sensational keywords: ${found.join(", ")}` };
  return { score: 0, flag: "✅  No sensational keywords detected" };
}

function checkUrl(url) {
  if (!url) return null;
  const shorteners = ["bit.ly","tinyurl","t.co","goo.gl","ow.ly"];
  if (shorteners.some(s => url.includes(s)))
    return { score: 20, flag: "⚠️  Shortened URL detected — original source hidden" };
  return { score: 0, flag: "✅  Direct URL — no shortener detected" };
}

function mapRiskLevel(score) {
  if (score >= 60) return {
    risk: "HIGH", label: "🔴 HIGH RISK",
    description: "This account shows multiple suspicious behavioral patterns.",
    reasons: [
      "Multiple credibility signals failed simultaneously",
      "Engagement pattern inconsistent with follower count",
      "Content uses emotional manipulation tactics",
      "Account shows signs of automated or bot-like behavior",
      "Strongly recommended to verify before sharing content",
    ],
  };
  if (score >= 30) return {
    risk: "MEDIUM", label: "🟡 MEDIUM RISK",
    description: "This account shows some suspicious signals.",
    reasons: [
      "Some behavioral signals are weak or missing",
      "Engagement rate is lower than expected",
      "Content lacks proper attribution or sources",
      "Verify this account before trusting its content",
    ],
  };
  return {
    risk: "LOW", label: "🟢 LOW RISK",
    description: "This account appears to behave normally.",
    reasons: [
      "Engagement pattern looks natural",
      "Content has sufficient information value",
      "No manipulation tactics detected",
      "Account behavior is consistent with a real user",
    ],
  };
}

function analyzeAccount(extracted) {
  if (!extracted || typeof extracted !== "object")
    throw new Error("Input must be a valid extracted object from MediaExtractor.");

  const meta   = extracted.meta   || {};
  const text   = extracted.text   || "";
  const images = extracted.images || [];
  const videos = extracted.videos || [];
  const url    = extracted.url    || "";

  let score = 0;
  const flags = [];

  const imgCheck  = checkImages(images);   score += imgCheck.score;  flags.push(imgCheck.flag);
  const vidCheck  = checkVideos(videos);   score += vidCheck.score;  flags.push(vidCheck.flag);
  const engCheck  = checkEngagement(meta); score += engCheck.score;  flags.push(engCheck.flag);
  const lenCheck  = checkContentLength(text); score += lenCheck.score; flags.push(lenCheck.flag);
  const sensCheck = checkSensationalKeywords(text); score += sensCheck.score; flags.push(sensCheck.flag);

  const urlCheck = checkUrl(url);
  if (urlCheck) { score += urlCheck.score; flags.push(urlCheck.flag); }

  score = Math.min(score, 100);
  const risk = mapRiskLevel(score);

  return {
    platform:    extracted.platform || "unknown",
    riskLevel:   risk.risk,
    riskLabel:   risk.label,
    riskScore:   score,
    description: risk.description,
    flags,
    reasons:     risk.reasons,
  };
}

module.exports = { analyzeAccount };
