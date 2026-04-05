/**
 * ============================================================
 *  MediaLens — Extractor Module
 *  extractor.module.js
 * ============================================================
 */

const MediaExtractor = (() => {

  /* ── CONFIG ───────────────────────────────────────────────── */
  const CFG = {
    APIFY_TOKEN: window.APIFY_TOKEN || 'YOUR_APIFY_TOKEN_HERE',
    APIFY_BASE:  'https://api.apify.com/v2',
    JINA_BASE:   'https://r.jina.ai',
    ACTORS: {
      instagram: 'apify/instagram-scraper',
      facebook:  'KoJrdxJCTtpon81KY',
    },
    PROXIES: [
      u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
      u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
      u => `https://thingproxy.freeboard.io/fetch/${u}`,
    ],
  };

  /* ── HELPERS ──────────────────────────────────────────────── */
  const sleep      = ms => new Promise(r => setTimeout(r, ms));
  const resolveUrl = (src, base) => { try { return new URL(src, base).href; } catch { return src; } };
  const isImageUrl = u => /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp|tiff)(\?|$)/i.test(u) || /\/(image|img|photo|media|thumbnail|thumb|picture|banner|cover)\//i.test(u);

  async function fetchViaProxy(url) {
    for (const fn of CFG.PROXIES) {
      try {
        const res = await fetch(fn(url), { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const text = await res.text();
        if (text && text.length > 100) return text;
      } catch { continue; }
    }
    return null;
  }

  /* ── PLATFORM DETECTION ───────────────────────────────────── */
  function detectPlatform(url) {
    if (!url) return 'unknown';
    if (/instagram\.com/i.test(url))         return 'instagram';
    if (/facebook\.com/i.test(url))          return 'facebook';
    if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
    if (/tiktok\.com/i.test(url))            return 'tiktok';
    if (/^https?:\/\/.+\..+/i.test(url))    return 'web';
    return 'unknown';
  }

  /* ── PUBLIC METHOD 1 — extract(url) ──────────────────────── */
  async function extract(url) {
    if (!url) throw new Error('URL is required');
    const platform = detectPlatform(url);
    if (platform === 'instagram') return _extractInstagram(url);
    if (platform === 'facebook')  return _extractFacebook(url);
    if (platform === 'youtube')   return _extractYouTube(url);
    return _extractWeb(url);
  }

  /* ── PUBLIC METHOD 2 — extractFromText(text, platform, sourceUrl) */
  function extractFromText(text, platform = 'unknown', sourceUrl = '') {
    if (!text) throw new Error('Text is required');
    const parsed = _parseMarkdownMedia(text, sourceUrl);
    const blocks = parsed.textBlocks.length
      ? parsed.textBlocks
      : [{ tag: 'p', type: 'paragraph', text: text.trim(), level: null, id: 0 }];
    const mediaFromText = _extractVideoLinksFromText(text, sourceUrl);
    const videos = mediaFromText.filter(m => !m.type?.startsWith('audio'));
    const audios  = mediaFromText.filter(m => m.type?.startsWith('audio'));
    const imageUrlRe = /https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|gif|webp|avif)(\?[^\s"']*)?/gi;
    const images = [];
    let m;
    while ((m = imageUrlRe.exec(text)) !== null) {
      images.push({ src: m[0], alt: '', source: 'text-image-url' });
    }
    return {
      url: sourceUrl, platform, title: blocks.find(b => b.type === 'heading')?.text || '',
      desc: blocks.find(b => b.type === 'paragraph')?.text?.slice(0, 200) || '',
      text, textBlocks: blocks, images, videos, audios, ogImage: images[0]?.src || '',
      meta: { inputMethod: 'paste', platform },
    };
  }

  /* ── PUBLIC METHOD 3 — extractFromFiles(fileList, sourceUrl) */
  async function extractFromFiles(fileList, sourceUrl = '') {
    const files = Array.from(fileList);
    const images = [], videos = [], audios = [], textBlocks = [];
    await Promise.all(files.map(file => new Promise(resolve => {
      const url  = URL.createObjectURL(file);
      const type = file.type || '';
      const name = file.name || 'uploaded-file';
      if (type.startsWith('image/'))      { images.push({ src: url, alt: name, source: 'upload', file, mimeType: type }); }
      else if (type.startsWith('video/')) { videos.push({ src: url, type, source: 'upload', file, name }); }
      else if (type.startsWith('audio/')) { audios.push({ src: url, type, source: 'upload', file, name }); }
      else if (type === 'text/plain') {
        const reader = new FileReader();
        reader.onload = e => {
          const content = e.target.result || '';
          textBlocks.push({ tag: 'p', type: 'paragraph', text: content, level: null, id: textBlocks.length });
          resolve(); return;
        };
        reader.readAsText(file); return;
      }
      resolve();
    })));
    return {
      url: sourceUrl, platform: 'upload', title: files.map(f => f.name).join(', '),
      desc: `${files.length} file(s) uploaded`, text: textBlocks.map(b => b.text).join('\n'),
      textBlocks, images, videos, audios, ogImage: images[0]?.src || '',
      meta: { inputMethod: 'upload', fileCount: files.length, fileTypes: files.map(f => f.type) },
    };
  }

  /* ── INTERNAL: Web extraction ─────────────────────────────── */
  async function _extractWeb(url) {
    const jinaRes = await fetch(`${CFG.JINA_BASE}/${url}`, { headers: { Accept: 'text/plain' } });
    if (!jinaRes.ok) throw new Error('Jina fetch failed (' + jinaRes.status + ')');
    const markdown     = await jinaRes.text();
    const fromMarkdown = _parseMarkdownMedia(markdown, url);
    let fromHTML = { images: [], videos: [], audios: [], title: '', desc: '', ogImage: '', textBlocks: [] };
    const html = await fetchViaProxy(url);
    if (html) fromHTML = _parseHTMLMedia(html, url);
    const { videos: urlVideos, audios: urlAudios } = _detectAllMedia(null, html || '', url);
    urlVideos.forEach(v => { if (!fromHTML.videos.find(e => e.src === v.src)) fromHTML.videos.push(v); });
    urlAudios.forEach(a => { if (!fromHTML.audios.find(e => e.src === a.src)) fromHTML.audios.push(a); });
    const mdMedia = _extractVideoLinksFromText(markdown, url);
    mdMedia.forEach(v => {
      const arr = v.type?.startsWith('audio') ? fromHTML.audios : fromHTML.videos;
      if (!arr.find(e => e.src === v.src)) arr.push(v);
    });
    return _buildResult(url, 'web', fromMarkdown, fromHTML);
  }

  /* ── INTERNAL: YouTube ────────────────────────────────────── */
  async function _extractYouTube(url) {
    const id = url.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1]
      || url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)?.[1]
      || url.match(/shorts\/([A-Za-z0-9_-]{11})/)?.[1];
    if (!id) throw new Error('Could not extract YouTube video ID');
    let title = `YouTube video ${id}`, desc = '', textBlocks = [];
    try {
      const jinaRes = await fetch(`${CFG.JINA_BASE}/${url}`, { headers: { Accept: 'text/plain' } });
      if (jinaRes.ok) {
        const md = await jinaRes.text();
        const parsed = _parseMarkdownMedia(md, url);
        textBlocks = parsed.textBlocks || [];
        title = textBlocks.find(b => b.type === 'heading')?.text || title;
        desc  = textBlocks.find(b => b.type === 'paragraph')?.text?.slice(0, 200) || '';
      }
    } catch {}
    try {
      const oembed = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      if (oembed.ok) { const d = await oembed.json(); if (d.title) title = d.title; }
    } catch {}
    const thumbQualities = ['maxresdefault','sddefault','hqdefault','mqdefault','0'];
    const images = thumbQualities.map(q => ({ src: `https://img.youtube.com/vi/${id}/${q}.jpg`, alt: `Thumbnail (${q})`, source: 'youtube-thumb' }));
    const videos = [
      { src: `https://www.youtube.com/watch?v=${id}`, type: 'embed', source: 'youtube-watch', embed: true, platform: 'youtube', videoId: id, thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg` },
      { src: `https://www.youtube.com/embed/${id}`,   type: 'embed', source: 'youtube-embed', embed: true, platform: 'youtube', videoId: id, thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg` },
    ];
    return { url, platform: 'youtube', title, desc, text: textBlocks.map(b => b.text).join('\n'), textBlocks, images, videos, audios: [], ogImage: images[2]?.src || '', meta: { videoId: id, platform: 'youtube' } };
  }

  /* ── INTERNAL: Instagram via Apify ───────────────────────── */
  async function _extractInstagram(url) {
    if (CFG.APIFY_TOKEN === 'YOUR_APIFY_TOKEN_HERE') throw new Error('Set window.APIFY_TOKEN before calling extract()');
    const runRes = await fetch(
      `${CFG.APIFY_BASE}/acts/${CFG.ACTORS.instagram}/run-sync-get-dataset-items?token=${CFG.APIFY_TOKEN}&timeout=60`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directUrls: [url], resultsType: 'posts', resultsLimit: 1, addParentData: false }) }
    );
    if (!runRes.ok) throw new Error('Apify Instagram failed (' + runRes.status + ')');
    const items = await runRes.json();
    if (!items?.length) throw new Error('No Instagram data returned');
    const item = items[0];
    const images = [], videos = [];
    if (item.displayUrl) images.push({ src: item.displayUrl, alt: 'Post image', source: 'instagram-main' });
    (item.images || []).forEach(img => { const s = typeof img === 'string' ? img : img.url || ''; if (s && !images.find(e => e.src === s)) images.push({ src: s, alt: '', source: 'instagram-sidecar' }); });
    if (item.videoUrl) videos.push({ src: item.videoUrl, type: 'video/mp4', source: 'instagram-video', platform: 'instagram' });
    (item.videoUrls || []).forEach(v => { if (!videos.find(e => e.src === v)) videos.push({ src: v, type: 'video/mp4', source: 'instagram-video', platform: 'instagram' }); });
    const text = [item.caption || '', item.hashtags ? '#' + item.hashtags.join(' #') : ''].filter(Boolean).join('\n\n');
    const textBlocks = text ? [{ tag: 'p', type: 'paragraph', text, level: null, id: 0 }] : [];
    const posts = [{ postId: item.id || null, postUrl: url, time: item.timestamp || null, caption: item.caption || '', likes: item.likesCount || 0, comments: item.commentsCount || 0, images, videos }];
    return { url, platform: 'instagram', title: item.ownerUsername ? `@${item.ownerUsername}` : 'Instagram post', desc: item.caption?.slice(0, 200) || '', text, textBlocks, images, videos, audios: [], ogImage: images[0]?.src || '', posts, meta: { likes: item.likesCount, comments: item.commentsCount, owner: item.ownerUsername, type: item.type } };
  }

  /* ── INTERNAL: Facebook via Apify ────────────────────────── */
  async function _extractFacebook(url) {
    if (CFG.APIFY_TOKEN === 'YOUR_APIFY_TOKEN_HERE') throw new Error('Set window.APIFY_TOKEN before calling extract()');
    const runRes = await fetch(`${CFG.APIFY_BASE}/acts/${CFG.ACTORS.facebook}/runs?token=${CFG.APIFY_TOKEN}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startUrls: [{ url }], resultsLimit: 10, captionText: false }) }
    );
    if (!runRes.ok) throw new Error('Apify Facebook failed (' + runRes.status + ')');
    const runData   = await runRes.json();
    const runId     = runData.data?.id;
    const datasetId = runData.data?.defaultDatasetId;
    if (!runId) throw new Error('No Apify run ID returned');
    for (let i = 0; i < 30; i++) {
      await sleep(4000);
      const s     = await (await fetch(`${CFG.APIFY_BASE}/actor-runs/${runId}?token=${CFG.APIFY_TOKEN}`)).json();
      const state = s.data?.status;
      if (state === 'SUCCEEDED') break;
      if (['FAILED','ABORTED','TIMED-OUT'].includes(state)) throw new Error('Apify run ended: ' + state);
    }
    const items = await (await fetch(`${CFG.APIFY_BASE}/datasets/${datasetId}/items?token=${CFG.APIFY_TOKEN}&clean=true`)).json();
    if (!items?.length) throw new Error('No Facebook data returned');
    return _parseFacebookItems(items, url);
  }

  function _parseFacebookItems(items, url) {
    const images = [], videos = [], textBlocks = [], posts = [];
    const seenI = new Set(), seenT = new Set();
    const first    = items[0];
    const pageName = first?.user?.name || first?.pageName || 'Facebook page';
    if (first?.user?.profilePic && !seenI.has(first.user.profilePic)) {
      seenI.add(first.user.profilePic);
      images.push({ src: first.user.profilePic, alt: pageName + ' profile', source: 'fb-profile-pic' });
    }
    items.forEach(post => {
      const postImages = [], postVideos = [];
      if (post.text && !seenT.has(post.text)) {
        seenT.add(post.text);
        textBlocks.push({ tag: 'p', type: 'paragraph', text: post.text, level: null, id: textBlocks.length,
          meta: { postId: post.postId, postUrl: post.url, time: post.time, likes: post.likes, comments: post.comments, shares: post.shares } });
      }
      (post.media || []).forEach(m => {
        if (m.mediaset_token && !m.image && !m.photo_image && !m.thumbnail) return;
        const uri = m.image?.uri || m.photo_image?.uri || m.thumbnail || '';
        if (uri && !seenI.has(uri)) {
          seenI.add(uri);
          const imgItem = { src: uri, alt: m.ocrText || '', source: 'fb-post-photo', postId: post.postId };
          images.push(imgItem); postImages.push(imgItem);
        }
        if (m.__typename === 'Video' || m.video) {
          const src = m.video?.hd_src || m.video?.sd_src || '';
          if (src) {
            const vidItem = { src, type: 'video/mp4', source: 'fb-video', platform: 'facebook', postId: post.postId, thumb: m.thumbnail || '' };
            videos.push(vidItem); postVideos.push(vidItem);
          }
        }
      });
      posts.push({ postId: post.postId || null, postUrl: post.url || null, time: post.time || null, caption: post.text || '', likes: post.likes || 0, comments: post.comments || 0, shares: post.shares || 0, images: postImages, videos: postVideos });
    });
    const text = textBlocks.map(b => b.text).join('\n\n---\n\n');
    return { url, platform: 'facebook', title: pageName, desc: `${items.length} posts`, text, textBlocks, images, videos, audios: [], ogImage: first?.user?.profilePic || images[0]?.src || '', posts, meta: { pageName: first?.pageName, totalPosts: items.length } };
  }

  /* ── INTERNAL: HTML parser ────────────────────────────────── */
  function _parseHTMLMedia(html, baseUrl) {
    if (!html) return { images: [], videos: [], audios: [], title: '', desc: '', ogImage: '', textBlocks: [] };
    const doc     = new DOMParser().parseFromString(html, 'text/html');
    const title   = doc.querySelector('title')?.textContent?.trim() || '';
    const desc    = doc.querySelector('meta[name="description"]')?.getAttribute('content') || doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
    const textBlocks = _extractTextBlocks(doc);
    const images = [];
    doc.querySelectorAll('img').forEach(img => {
      const src = resolveUrl(img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '', baseUrl);
      if (src && isImageUrl(src) && !src.startsWith('data:') && src.length < 500) images.push({ src, alt: img.getAttribute('alt') || '', source: 'html-img' });
    });
    const { videos, audios } = _detectAllMedia(doc, html, baseUrl);
    return { images, videos, audios, title, desc, ogImage, textBlocks };
  }

  /* ── INTERNAL: universal media detector ──────────────────── */
  function _detectAllMedia(docIn, rawHtml, baseUrl) {
    let doc = docIn;
    if (rawHtml?.length > 50) { try { doc = new DOMParser().parseFromString(rawHtml, 'text/html'); } catch {} }
    if (!doc) doc = document.createElement('div');
    const videos = [], audios = [], seenV = new Set(), seenA = new Set();
    const addV = (src, type, source, meta = {}) => { if (src && !seenV.has(src)) { seenV.add(src); videos.push({ src, type, source, ...meta }); } };
    const addA = (src, type, source, meta = {}) => { if (src && !seenA.has(src)) { seenA.add(src); audios.push({ src, type, source, ...meta }); } };
    doc.querySelectorAll('video, video source').forEach(el => { const s = resolveUrl(el.getAttribute('src') || '', baseUrl); if (s) addV(s, el.getAttribute('type') || 'video/*', 'html-video'); });
    doc.querySelectorAll('audio, audio source').forEach(el => { const s = resolveUrl(el.getAttribute('src') || '', baseUrl); if (s) addA(s, el.getAttribute('type') || 'audio/*', 'html-audio'); });
    const ogV = doc.querySelector('meta[property="og:video"],meta[property="og:video:url"]')?.getAttribute('content');
    if (ogV) addV(ogV, doc.querySelector('meta[property="og:video:type"]')?.getAttribute('content') || 'video/*', 'og-meta-video');
    doc.querySelectorAll('iframe[src],iframe[data-src]').forEach(f => {
      const src = f.getAttribute('src') || f.getAttribute('data-src') || '';
      if (/youtube\.com\/embed/i.test(src))          { const id = src.match(/embed\/([^?/]+)/)?.[1]; addV(src, 'embed', 'youtube-embed',    { embed: true, platform: 'youtube',     videoId: id, thumb: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '' }); }
      else if (/vimeo\.com\/video/i.test(src))        addV(src, 'embed', 'vimeo-embed',      { embed: true, platform: 'vimeo' });
      else if (/tiktok\.com\/embed/i.test(src))       addV(src, 'embed', 'tiktok-embed',     { embed: true, platform: 'tiktok' });
      else if (/facebook\.com\/plugins\/video/i.test(src)) addV(src, 'embed', 'facebook-embed', { embed: true, platform: 'facebook' });
      else if (/dailymotion\.com\/embed/i.test(src))  addV(src, 'embed', 'dailymotion-embed',{ embed: true, platform: 'dailymotion' });
      else if (/twitch\.tv\/embed/i.test(src))        addV(src, 'embed', 'twitch-embed',     { embed: true, platform: 'twitch' });
      else if (/open\.spotify\.com\/embed/i.test(src))addA(src, 'embed', 'spotify-embed',   { embed: true, platform: 'spotify' });
      else if (/soundcloud\.com/i.test(src))          addA(src, 'embed', 'soundcloud-embed', { embed: true, platform: 'soundcloud' });
    });
    doc.querySelectorAll('a[href]').forEach(a => {
      const h = a.getAttribute('href') || '';
      if (/\.(mp4|webm|ogv|mov|m4v)(\?|$)/i.test(h))    addV(resolveUrl(h, baseUrl), 'video/file', 'link-video');
      if (/\.(mp3|wav|ogg|aac|m4a|opus)(\?|$)/i.test(h)) addA(resolveUrl(h, baseUrl), 'audio/file', 'link-audio');
      if (/youtube\.com\/watch\?.*v=|youtu\.be\//i.test(h)) { const id = h.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1] || h.match(/youtu\.be\/([^?/]+)/)?.[1]; if (id) addV(`https://www.youtube.com/watch?v=${id}`, 'embed', 'youtube-link', { embed: true, platform: 'youtube', videoId: id, thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg` }); }
    });
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try {
        const d = JSON.parse(s.textContent);
        [d].flat().forEach(item => {
          if (item['@type'] === 'VideoObject') { const src = item.contentUrl || item.embedUrl || ''; if (src) addV(src, 'video/ld+json', 'json-ld', { thumb: item.thumbnailUrl, name: item.name }); }
          if (item['@type'] === 'AudioObject') { const src = item.contentUrl || item.embedUrl || ''; if (src) addA(src, 'audio/ld+json', 'json-ld', { name: item.name }); }
        });
      } catch {}
    });
    const VRE  = /["'](https?:\/\/[^"']*\.(mp4|webm|m3u8|mov)[^"']*?)["']/gi;
    const ARE  = /["'](https?:\/\/[^"']*\.(mp3|wav|ogg|aac|m4a)[^"']*?)["']/gi;
    const YTRE = /["'](https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?(?:[^&"']*&)*v=|youtu\.be\/)([A-Za-z0-9_-]{11})[^"']*?)["']/gi;
    doc.querySelectorAll('script:not([src])').forEach(s => {
      const c = s.textContent || '';
      let m;
      while ((m = VRE.exec(c))  !== null) addV(m[1], `video/${m[2]}`, 'inline-script');
      while ((m = ARE.exec(c))  !== null) addA(m[1], `audio/${m[2]}`, 'inline-script');
      while ((m = YTRE.exec(c)) !== null) addV(`https://www.youtube.com/watch?v=${m[2]}`, 'embed', 'script-youtube', { embed: true, platform: 'youtube', videoId: m[2], thumb: `https://img.youtube.com/vi/${m[2]}/hqdefault.jpg` });
    });
    if (baseUrl) {
      if (/youtube\.com\/watch|youtu\.be\//i.test(baseUrl))                  { const id = baseUrl.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1] || baseUrl.match(/youtu\.be\/([^?/]+)/)?.[1]; if (id) addV(`https://www.youtube.com/watch?v=${id}`, 'embed', 'youtube-url',    { embed: true, platform: 'youtube', videoId: id, thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg` }); }
      if (/youtube\.com\/shorts\//i.test(baseUrl))                           { const id = baseUrl.match(/shorts\/([A-Za-z0-9_-]{11})/)?.[1];                                            if (id) addV(`https://www.youtube.com/watch?v=${id}`, 'embed', 'youtube-shorts', { embed: true, platform: 'youtube', videoId: id, thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg` }); }
      if (/instagram\.com\/(reel|reels|tv)\//i.test(baseUrl))                addV(baseUrl, 'embed', 'instagram-reel', { embed: true, platform: 'instagram', note: 'Use Apify for direct file URL' });
      if (/facebook\.com\/(reel|reels|watch|video)\//i.test(baseUrl))        addV(baseUrl, 'embed', 'facebook-reel',  { embed: true, platform: 'facebook',  note: 'Use Apify for direct file URL' });
      if (/tiktok\.com\/@.+\/video\//i.test(baseUrl))                        addV(baseUrl, 'embed', 'tiktok-video',   { embed: true, platform: 'tiktok',    note: 'Use Apify for direct file URL' });
    }
    return { videos, audios };
  }

  /* ── INTERNAL: video link extractor from plain text ──────── */
  function _extractVideoLinksFromText(text, baseUrl) {
    const results = [], seen = new Set();
    const add = (src, type, source, meta = {}) => { if (src && !seen.has(src)) { seen.add(src); results.push({ src, type, source, ...meta }); } };
    let m;
    const ytRe  = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?(?:[^&\s"')]*&)*v=|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
    while ((m = ytRe.exec(text))  !== null) add(`https://www.youtube.com/watch?v=${m[1]}`, 'embed', 'text-youtube',  { embed: true, platform: 'youtube',   videoId: m[1], thumb: `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` });
    const vimRe = /https?:\/\/vimeo\.com\/(\d+)/g;
    while ((m = vimRe.exec(text)) !== null) add(`https://vimeo.com/${m[1]}`, 'embed', 'text-vimeo', { embed: true, platform: 'vimeo' });
    const ttRe  = /https?:\/\/(?:www\.)?tiktok\.com\/@[^/\s"']+\/video\/\d+/g;
    while ((m = ttRe.exec(text))  !== null) add(m[0], 'embed', 'text-tiktok',    { embed: true, platform: 'tiktok' });
    const igRe  = /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|tv)\/[A-Za-z0-9_-]+/g;
    while ((m = igRe.exec(text))  !== null) add(m[0], 'embed', 'text-ig-reel',   { embed: true, platform: 'instagram' });
    const fbRe  = /https?:\/\/(?:www\.)?facebook\.com\/(?:watch|reel|reels)[/?][^\s"')]+/g;
    while ((m = fbRe.exec(text))  !== null) add(m[0], 'embed', 'text-fb-video',  { embed: true, platform: 'facebook' });
    const dvRe  = /https?:\/\/[^\s"']+\.(mp4|webm|ogv|mov|m4v|m3u8)(\?[^\s"']*)?/gi;
    while ((m = dvRe.exec(text))  !== null) add(m[0], `video/${m[1]}`, 'text-direct-video');
    const daRe  = /https?:\/\/[^\s"']+\.(mp3|wav|ogg|aac|m4a|opus)(\?[^\s"']*)?/gi;
    while ((m = daRe.exec(text))  !== null) add(m[0], `audio/${m[1]}`, 'text-direct-audio');
    return results;
  }

  /* ── INTERNAL: markdown parser ────────────────────────────── */
  function _parseMarkdownMedia(md, baseUrl) {
    const images = [];
    const imgRe  = /!\[([^\]]*)\]\(([^\s)]+)[^)]*\)/g;
    let m;
    while ((m = imgRe.exec(md)) !== null) {
      const src = resolveUrl(m[2].trim(), baseUrl);
      if (src && !images.find(e => e.src === src)) images.push({ src, alt: m[1], source: 'jina-markdown' });
    }
    let body = md;
    const marker = /Markdown Content:\s*/i.exec(body);
    if (marker) body = body.slice(marker.index + marker[0].length);
    else body = body.replace(/^(Title:[^\n]*\n)?(URL Source:[^\n]*\n)?(Published Time:[^\n]*\n)?/i, '');
    body = body.replace(/!\[.*?\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`{3}[\s\S]*?`{3}/g, '').replace(/`[^`]+`/g, '')
      .replace(/^\s*[-*_]{3,}\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    const textBlocks = [], seen = new Set();
    let buf = [];
    const flush = () => {
      if (!buf.length) return;
      const t = buf.join(' ').replace(/\s+/g, ' ').trim(); buf = [];
      if (t.length < 3 || seen.has(t) || /^https?:\/\/\S+$/.test(t)) return;
      seen.add(t); textBlocks.push({ tag: 'p', type: 'paragraph', text: t, level: null, id: textBlocks.length });
    };
    for (const raw of body.split('\n')) {
      const line = raw.trimEnd();
      const hm = line.match(/^(#{1,6})\s+(.+)/);
      if (hm) { flush(); const t = hm[2].replace(/[*_`]/g,'').trim(); if (t && !seen.has(t)) { seen.add(t); textBlocks.push({ tag:`h${hm[1].length}`, type:'heading', text:t, level:hm[1].length, id:textBlocks.length }); } continue; }
      const lm = line.match(/^[\s]*[-*+]\s+(.+)/) || line.match(/^[\s]*\d+\.\s+(.+)/);
      if (lm) { flush(); const t = lm[1].replace(/[*_`]/g,'').trim(); if (t && !seen.has(t)) { seen.add(t); textBlocks.push({ tag:'li', type:'list-item', text:t, level:null, id:textBlocks.length }); } continue; }
      const bm = line.match(/^>\s*(.+)/);
      if (bm) { flush(); const t = bm[1].replace(/[*_`]/g,'').trim(); if (t && !seen.has(t)) { seen.add(t); textBlocks.push({ tag:'blockquote', type:'quote', text:t, level:null, id:textBlocks.length }); } continue; }
      if (!line.trim()) { flush(); continue; }
      const c = line.replace(/[*_`#]/g,'').trim();
      if (c) buf.push(c);
    }
    flush();
    return { text: textBlocks.map(b => b.text).join('\n'), images, textBlocks };
  }

  /* ── INTERNAL: DOM text block extractor ──────────────────── */
  function _extractTextBlocks(doc) {
    const SKIP       = new Set(['script','style','noscript','svg','head','meta','link','button','input','select','textarea','option','nav','footer','aside']);
    const TAG_TYPE   = { h1:'heading',h2:'heading',h3:'heading',h4:'heading',h5:'heading',h6:'heading',p:'paragraph',li:'list-item',blockquote:'quote',q:'quote',figcaption:'caption',td:'table-cell',th:'table-header',label:'label',span:'inline',div:'block',a:'link',time:'inline' };
    const PRIORITY   = new Set(['h1','h2','h3','h4','h5','h6','p','blockquote','figcaption','li','td','th','label']);
    const CONTAINERS = new Set(['div','section','article','ul','ol','table','tbody','thead','tr','figure','main','header']);
    const seen = new Set(), blocks = [];
    function visit(el) {
      const tag = el.tagName?.toLowerCase();
      if (!tag || SKIP.has(tag)) return;
      const raw = (el.textContent || '').replace(/\s+/g,' ').trim();
      if (!raw) return;
      if (PRIORITY.has(tag)) {
        if (!seen.has(raw) && raw.length >= 2) { seen.add(raw); blocks.push({ tag, type: TAG_TYPE[tag] || 'block', text: raw, level: tag.match(/^h(\d)$/) ? parseInt(tag[1]) : null, id: blocks.length }); }
        return;
      }
      if (CONTAINERS.has(tag)) { Array.from(el.children).forEach(visit); return; }
      const hasBlock = Array.from(el.children).some(c => { const ct = c.tagName?.toLowerCase(); return PRIORITY.has(ct) || CONTAINERS.has(ct); });
      if (!hasBlock && raw.length >= 10 && !seen.has(raw)) { seen.add(raw); blocks.push({ tag, type: TAG_TYPE[tag] || 'inline', text: raw, level: null, id: blocks.length }); }
      else if (hasBlock) Array.from(el.children).forEach(visit);
    }
    const root = doc.querySelector('main,article,[role="main"]') || doc.body;
    if (root) Array.from(root.children).forEach(visit);
    if (!blocks.length) doc.body?.querySelectorAll('h1,h2,h3,h4,h5,h6,p,blockquote,li').forEach(el => {
      const t = (el.textContent||'').replace(/\s+/g,' ').trim();
      if (t.length >= 2 && !seen.has(t)) { seen.add(t); const tag = el.tagName.toLowerCase(); blocks.push({ tag, type: TAG_TYPE[tag]||'block', text:t, level: tag.match(/^h(\d)$/)?.[1]|0||null, id:blocks.length }); }
    });
    return blocks;
  }

  /* ── INTERNAL: build final result ────────────────────────── */
  function _buildResult(url, platform, fromMarkdown, fromHTML) {
    const allImages = [...fromMarkdown.images];
    fromHTML.images.forEach(hi => { if (!allImages.find(e => e.src === hi.src)) allImages.push(hi); });
    if (fromHTML.ogImage) { const og = resolveUrl(fromHTML.ogImage, url); if (og && !allImages.find(e => e.src === og)) allImages.unshift({ src: og, alt: 'OG image', source: 'og-meta' }); }
    const textBlocks = fromHTML.textBlocks?.length ? fromHTML.textBlocks : (fromMarkdown.textBlocks || []);
    return { url, platform, title: fromHTML.title || '', desc: fromHTML.desc || '', ogImage: fromHTML.ogImage || '', text: textBlocks.map(b => b.text).join('\n'), textBlocks, images: allImages.filter(i => i.src).slice(0, 40), videos: fromHTML.videos, audios: fromHTML.audios, meta: {} };
  }

  /* ── EXPOSE PUBLIC API ────────────────────────────────────── */
  return { extract, extractFromText, extractFromFiles, detectPlatform };

})();

window.MediaExtractor = MediaExtractor;
