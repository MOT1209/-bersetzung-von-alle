// server/routes-translate.js — مسارات API للترجمة
const express = require('express');
const { fetchArticleContent } = require('./fetchContent');
const { extractVideoId, getTranscript, buildSrt } = require('./youtube');
const { translateText, translateTextWithMeta, detectLanguage, applyGlossary } = require('./translate');
const { transcribeVideoAudio } = require('./audio');
const { trackUsage, getUsage } = require('./usage'); // عدّاد استخدام بسيط
const { logInfo } = require('./logger');

const router = express.Router();

// ===== خريطة رمز الخطأ → حالة HTTP (العقد الموحد في task-06) =====
const ERROR_STATUS = {
  'invalid-url': 400,
  'fetch-failed': 422,
  'no-transcript': 422,
  'audio-empty': 422,
  'content-empty': 422,
  'pdf-unsupported': 422,
  'invalid-settings': 400,
  'blocked-url': 400,
  'rate-limited': 429,
  'translate-failed': 502,
  'server-error': 500,
  'invalid-text': 400,
  'smart-unavailable': 503,
  'input-too-large': 413,
};

// ===== استجابة خطأ موحدة =====
function sendError(res, e) {
  const code = (e && e.code) || 'server-error';
  const status = ERROR_STATUS[code] || 500;
  console.error('[translate] error:', code, '→', e && e.message);
  return res.status(status).json({ error: code });
}

// ===== POST /api/translate — ترجمة رابط =====
// body: { url, targetLang, videoLang?, glossary?: [{from,to}] }
router.post('/translate', async (req, res) => {
  const { url, targetLang = 'ar', videoLang, glossary } = req.body || {};

  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
    return res.status(400).json({ error: 'invalid-url' });
  }
  const cleanUrl = url.trim();
  // حد طول الرابط — يمنع مدخلات ضخمة عبر URL
  if (cleanUrl.length > 2000) {
    return res.status(413).json({ error: 'input-too-large' });
  }
  // مسرد اختياري: مصفوفة {from,to} — تُطبَّق بعد الترجمة على النص النهائي فقط
  const g = Array.isArray(glossary) ? glossary : [];

  try {
    // 1) يوتيوب؟
    const videoId = extractVideoId(cleanUrl);
    if (videoId) {
      return await handleYouTube(res, videoId, targetLang, videoLang, g);
    }

    // 2) مقال / موقع
    return await handleArticle(res, cleanUrl, targetLang, g);
  } catch (e) {
    return sendError(res, e);
  }
});

// ===== POST /api/translate-text — ترجمة نص مباشر =====
// body: { text, targetLang?, glossary?: [{from,to}] }
router.post('/translate-text', async (req, res) => {
  const { text, targetLang = 'ar', glossary } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'invalid-text' });
  }
  // حد حجم النص (حوالي 200 ألف حرف) — يمنع استهلاك الذاكرة/تعليق الخادم
  if (String(text).length > 200000) {
    return res.status(413).json({ error: 'input-too-large' });
  }
  try {
    const sourceLang = await detectLanguage(text);
    const raw = await translateText(String(text), targetLang, sourceLang);
    const translated = applyGlossary(raw, Array.isArray(glossary) ? glossary : []);
    trackUsage({ type: 'text', sourceLang, targetLang }); // لا يُنتظر — احتياطي
    res.json({ type: 'text', sourceLang, translated, original: String(text) });
  } catch (e) {
    console.error('[translate-text] error:', e.message);
    return sendError(res, e);
  }
});

// ===== POST /api/translate-smart — ترجمة ذكية (Gemini: تلخيص/إعادة صياغة) =====
// body: { text, targetLang? } — يستخدم Gemini إن توفر مفتاح، وإلا ترجمة عادية مع تنبيه
router.post('/translate-smart', async (req, res) => {
  const { text, targetLang = 'ar' } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'invalid-text' });
  }
  try {
    const config = require('./config');
    if (!config.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'smart-unavailable' });
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent`;
    const prompt = `أعد صياغة النص التالي إلى ${targetLang === 'ar' ? 'العربية' : targetLang} بأسلوب طبيعي موجز يحافظ على المعنى. لا تشرح، أعد النص المترجم فقط:\n\n${String(text).slice(0, 8000)}`;
    const geminiRes = await fetch(url + `?key=${encodeURIComponent(config.GEMINI_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!geminiRes.ok) throw new Error('Gemini HTTP ' + geminiRes.status);
    const data = await geminiRes.json();
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!out) throw new Error('Gemini empty');
    logInfo('translate-smart', 'نجحت الترجمة الذكية');
    trackUsage({ type: 'smart', sourceLang: 'auto', targetLang });
    res.json({ type: 'smart', translated: out.trim(), sourceLang: 'auto' });
  } catch (e) {
    console.error('[translate-smart] error:', e.message);
    return sendError(res, e);
  }
});

// ===== GET /api/stats — عدّاد الاستخدام =====
router.get('/stats', async (req, res) => {
  try {
    res.json(await getUsage());
  } catch (e) {
    res.status(500).json({ error: 'server-error' });
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

// ===== توزيع الترجمة على أسطر الدفعة بنسبة طول كل سطر أصلي =====
// المثالي: عدد الأجزاء = عدد الأسطر (مطابقة 1:1). وإلا نوزع الكلمات نسبيًا
// بحيث يبقى كل سطر متناسبًا مع مدته الأصلية بدل حشر كل شيء في السطر الأول.
function distributeByRatio(translated, lines) {
  // الفاصل هو \n\n (فاصل القطع في translateTextWithMeta) حتى لا تُكسر الأسطر
  // التي تحوي سطرًا جديدًا مدمجًا من الترجمة الأصلية
  const parts = translated.split('\n\n').map((p) => p.trim()).filter((p) => p.length);
  if (parts.length === lines.length) return parts;

  const totalLen = lines.reduce((s, l) => s + String(l.original || '').length, 0) || 1;
  const words = translated.split(/\s+/).filter(Boolean);
  const out = [];
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    const ratio = String(lines[i].original || '').length / totalLen;
    let count = Math.round(words.length * ratio);
    if (i === lines.length - 1) count = Math.max(0, words.length - idx);
    out.push(words.slice(idx, idx + count).join(' '));
    idx += count;
  }
  return out;
}

// ===== معالجة يوتيوب =====
async function handleYouTube(res, videoId, targetLang, videoLang, glossary) {
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
    // كشف لغة المصدر من أول دفعة فقط (تكراره لكل دفعة يهدر طلبات الشبكة)
    let sourceLang = 'en';
    if (batches[0]) {
      const sample = batches[0].map((l) => l.original).join(' ').slice(0, 500);
      const detected = await detectLanguage(sample);
      if (detected) sourceLang = detected;
    }

    const translatedAll = [];
    let totalChunks = 0;
    let cachedChunks = 0;
    for (const batch of batches) {
      // ضم الأسطر بـ \n\n حتى يُعامل كل سطر كقطعة مستقلة في chunkText
      // (يضمن محاذاة الترجمة 1:1 مع الأسطر بدل فقدان المطابقة)
      const joined = batch.map((l) => l.original).join('\n\n');
      const { translated, chunksFromCache, chunksTotal } = await translateTextWithMeta(joined, targetLang, sourceLang);
      totalChunks += chunksTotal;
      cachedChunks += chunksFromCache;
      const parts = distributeByRatio(translated, batch);
      // توزيع: مطابقة 1:1 إن أمكن، وإلا توزيع نسبي على كل الأسطر
      batch.forEach((line, i) => {
        line.translated = parts[i] !== undefined ? parts[i] : line.original;
        line.translated = applyGlossary(line.translated, glossary || []);
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
    trackUsage({ type: 'youtube', sourceLang, targetLang }); // لا يُنتظر
  } catch (e) {
    return sendError(res, e);
  }
}

// ===== معالجة مقال =====
async function handleArticle(res, url, targetLang, glossary) {
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
      translatedBlocks.push({ type: b.type, content: applyGlossary(results[j], glossary || []) });
    });
  }

  res.json({
    type: 'article',
    sourceLang,
    translatedBlocks,
    originalBlocks: blocks,
    meta: { title: title || 'مقال', cached: totalChunks > 0 && cachedChunks === totalChunks },
  });
  trackUsage({ type: 'article', sourceLang, targetLang }); // لا يُنتظر
}

module.exports = router;
module.exports.distributeByRatio = distributeByRatio;
