// server/youtube.js — استخراج ترجمات يوتيوب
const { YoutubeTranscript } = require('youtube-transcript');

// ===== استخراج معرف الفيديو من الرابط =====
function extractVideoId(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// ===== جلب الترجمات =====
async function getTranscript(videoId, preferLang) {
  const attempts = [];
  if (preferLang && preferLang !== 'auto') attempts.push(preferLang);
  attempts.push('en', 'en.auto', 'ar', 'ar.auto', 'auto');

  let lastErr = null;
  for (const lang of attempts) {
    try {
      const list = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      if (list && list.length) return list;
    } catch (e) {
      lastErr = e;
    }
  }

  // محاولة أخيرة بدون تحديد لغة
  try {
    const list = await YoutubeTranscript.fetchTranscript(videoId);
    if (list && list.length) return list;
  } catch (e) {
    lastErr = e;
  }

  const err = new Error('no-transcript');
  err.code = 'no-transcript';
  err.cause = lastErr;
  throw err;
}

// ===== تنسيق زمني SRT =====
function formatSrtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

// ===== بناء ملف SRT من الترجمة المترجمة =====
function buildSrt(captions) {
  return captions
    .map((c, i) => {
      const start = formatSrtTime(c.start);
      const end = formatSrtTime(c.start + (c.duration || 2));
      return `${i + 1}\n${start} --> ${end}\n${c.translated || c.original}\n`;
    })
    .join('\n');
}

module.exports = { extractVideoId, getTranscript, buildSrt, formatSrtTime };
