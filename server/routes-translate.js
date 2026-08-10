// server/routes-translate.js — مسارات API للترجمة
const express = require('express');
const { fetchArticleContent } = require('./fetchContent');
const { extractVideoId, getTranscript, buildSrt } = require('./youtube');
const { translateTextWithMeta, detectLanguage } = require('./translate');
const { transcribeVideoAudio } = require('./audio');

const router = express.Router();

// ===== خريطة رمز الخطأ → حالة HTTP (العقد الموحد في task-06) =====
const ERROR_STATUS = {
  'invalid-url': 400,
  'fetch-failed': 422,
  'no-transcript': 422,
  'audio-empty': 422,
  'content-empty': 422,
  'pdf-unsupported': 422,
  'translate-failed': 502,
  'server-error': 500,
};

// ===== استجابة خطأ موحدة =====
function sendError(res, e) {
  const code = (e && e.code) || 'server-error';
  const status = ERROR_STATUS[code] || 500;
  console.error('[translate] error:', code, '→', e && e.message);
  return res.status(status).json({ error: code });
}

// ===== POST /api/translate — ترجمة رابط =====
router.post('/translate', async (req, res) => {
  const { url, targetLang = 'ar', videoLang } = req.body || {};

  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
    return res.status(400).json({ error: 'invalid-url' });
  }
  const cleanUrl = url.trim();

  try {
    // 1) يوتيوب؟
    const videoId = extractVideoId(cleanUrl);
    if (videoId) {
      return await handleYouTube(res, videoId, targetLang, videoLang);
    }

    // 2) مقال / موقع
    return await handleArticle(res, cleanUrl, targetLang);
  } catch (e) {
    return sendError(res, e);
  }
});

// ===== POST /api/translate-text — ترجمة نص مباشر =====
router.post('/translate-text', async (req, res) => {
  const { text, targetLang = 'ar' } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'invalid-text' });
  }
  try {
    const sourceLang = await detectLanguage(text);
    const translated = await translateText(String(text), targetLang, sourceLang);
    res.json({ type: 'text', sourceLang, translated, original: String(text) });
  } catch (e) {
    console.error('[translate-text] error:', e.message);
    return sendError(res, e);
  }
});

// ===== POST /api/srt — بناء ملف SRT =====
router.post('/srt', (req, res) => {
  const { captions } = req.body || {};
  if (!Array.isArray(captions) || !captions.length) {
    return res.status(400).json({ error: 'invalid-captions' });
  }
  const srt = buildSrt(captions);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="translation.srt"');
  res.send(srt);
});

// ===== معالجة يوتيوب =====
async function handleYouTube(res, videoId, targetLang, videoLang) {
  try {
    // محاولة جلب الترجمات النصية أولًا
    let metaSource = 'captions';
    let transcript;
    try {
      transcript = await getTranscript(videoId, videoLang);
    } catch (e) {
      if (e.code !== 'no-transcript') throw e;
      // لا توجد ترجمات نصية → تفريغ الصوت تلقائيًا عبر Whisper
      try {
        const { chunks } = await transcribeVideoAudio(videoId);
        transcript = chunks.map((c) => ({
          text: c.text,
          offset: Math.round(c.start * 1000),
          duration: Math.round(c.duration * 1000),
        }));
        metaSource = 'audio';
      } catch (e2) {
        throw e2; // code = fetch-failed → تُترجم لخطأ عربي 422
      }
    }

    // تجميع الأسطر في دفعات للترجمة (offset بالمللي ثانية → نحوله لثوانٍ)
    const lines = transcript.map((l) => ({ start: (l.offset || 0) / 1000, duration: (l.duration || 2000) / 1000, original: l.text }));

    // دمج الأسطر القصيرة في دفعات ≤ 4000 حرف مع الحفاظ على المطابقة 1:1
    const batches = [];
    let cur = [];
    let curLen = 0;
    for (const line of lines) {
      const len = line.original.length + 1;
      if (curLen + len > 4000 && cur.length) {
        batches.push(cur);
        cur = [line];
        curLen = len;
      } else {
        cur.push(line);
        curLen += len;
      }
    }
    if (cur.length) batches.push(cur);

    // ترجمة كل دفعة ثم توزيع النص المترجم على الأسطر بنسبة الطول
    let sourceLang = 'en';
    for (const batch of batches) {
      const joined = batch.map((l) => l.original).join('\n');
      const detected = await detectLanguage(joined);
      if (detected && detected !== 'en' || !sourceLang) sourceLang = detected;
    }

    const translatedAll = [];
    let totalChunks = 0;
    let cachedChunks = 0;
    for (const batch of batches) {
      const joined = batch.map((l) => l.original).join('\n');
      const { translated, chunksFromCache, chunksTotal } = await translateTextWithMeta(joined, targetLang, sourceLang);
      totalChunks += chunksTotal;
      cachedChunks += chunksFromCache;
      const parts = translated.split('\n');
      // توزيع: إذا عدد الأجزاء يساوي عدد الأسطر نطابق 1:1، وإلا نضع الترجمة كاملة في أول سطر
      batch.forEach((line, i) => {
        line.translated = parts[i] !== undefined && parts.length === batch.length ? parts[i] : (i === 0 ? translated : line.original);
      });
      translatedAll.push(...batch);
    }

    res.json({
      type: 'youtube',
      videoId,
      sourceLang,
      captions: translatedAll,
      meta: { title: 'فيديو يوتيوب', source: metaSource, cached: totalChunks > 0 && cachedChunks === totalChunks },
    });
  } catch (e) {
    return sendError(res, e);
  }
}

// ===== معالجة مقال =====
async function handleArticle(res, url, targetLang) {
  const { title, blocks } = await fetchArticleContent(url);

  // كشف لغة المصدر من أول 5 كتل
  const sample = blocks.slice(0, 5).map((b) => b.content).join(' ');
  const sourceLang = await detectLanguage(sample);

  // ترجمة الكتل في دفعات غير متزامنة (5 كتل في المرة) للحفاظ على استجابة الواجهة
  const translatedBlocks = [];
  const chunkSize = 5;
  let totalChunks = 0;
  let cachedChunks = 0;
  for (let i = 0; i < blocks.length; i += chunkSize) {
    const slice = blocks.slice(i, i + chunkSize);
    const results = await Promise.all(
      slice.map(async (b) => {
        const { translated, chunksFromCache, chunksTotal } = await translateTextWithMeta(b.content, targetLang, sourceLang);
        totalChunks += chunksTotal;
        cachedChunks += chunksFromCache;
        return translated;
      })
    );
    slice.forEach((b, j) => {
      translatedBlocks.push({ type: b.type, content: results[j] });
    });
  }

  res.json({
    type: 'article',
    sourceLang,
    translatedBlocks,
    originalBlocks: blocks,
    meta: { title: title || 'مقال', cached: totalChunks > 0 && cachedChunks === totalChunks },
  });
}

module.exports = router;
