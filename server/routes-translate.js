// server/routes-translate.js — مسارات API للترجمة
const express = require('express');
const config = require('./config');
const { fetchArticleContent } = require('./fetchContent');
const { extractVideoId, getTranscript, buildSrt } = require('./youtube');
const { translateText, detectLanguage, applyGlossary, getProviders } = require('./translate');
const translate = require('./translate'); // وصول وقت التنفيذ — يسمح بتزييف translateTextWithMeta في الاختبارات
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
  'alignment-failed': 502,
  'gemini-video-failed': 502,
  'video-too-long': 422,
  'download-failed': 502,
  'youtube-blocked': 422,
  'ytdlp-missing': 500,
};

// ===== استجابة خطأ موحدة =====
function sendError(res, e) {
  // رمز الخطأ يجب أن يكون سلسلة معروفة. عمليات execFile الفاشلة تحمل code
  // رقميًا (رمز الخروج)، فكان يتسرّب للواجهة كـ {"error":1} — بلا معنى.
  const raw = e && e.code;
  const code = typeof raw === 'string' && ERROR_STATUS[raw] ? raw : 'server-error';
  const status = ERROR_STATUS[code] || 500;
  console.error('[translate] error:', code, '→', e && e.message);
  return res.status(status).json({ error: code });
}

// ===== GET /api/providers — قائمة المزوّدين وحالتهم (للواجهة) =====
router.get('/providers', (req, res) => {
  const list = getProviders().map((p) => ({
    id: p.id,
    label: p.label,
    requiresKey: p.requiresKey,
    available: p.isAvailable(),
  }));
  res.json({ providers: list, defaultOrder: (config.PROVIDER_ORDER || '').split(',').filter(Boolean) });
});

// ===== POST /api/translate — ترجمة رابط =====
// body: { url, targetLang, videoLang?, glossary?: [{from,to}], provider?, providers?: [] }
router.post('/translate', async (req, res) => {
  const { url, targetLang = 'ar', videoLang, glossary, provider, providers } = req.body || {};

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
  // فرض المزوّد/الترتيب اختياريًا (مُمرَّر كـ opts إلى سلسلة المزوّدين)
  const tOpts = { provider, providers };

  try {
    // 1) يوتيوب؟
    const videoId = extractVideoId(cleanUrl);
    if (videoId) {
      return await handleYouTube(res, videoId, targetLang, videoLang, g, tOpts);
    }

    // 2) مقال / موقع
    return await handleArticle(res, cleanUrl, targetLang, g, tOpts);
  } catch (e) {
    return sendError(res, e);
  }
});

// ===== POST /api/translate-text — ترجمة نص مباشر =====
// body: { text, targetLang?, glossary?: [{from,to}], provider?, providers?: [] }
router.post('/translate-text', async (req, res) => {
  const { text, targetLang = 'ar', glossary, provider, providers } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'invalid-text' });
  }
  // حد حجم النص (حوالي 200 ألف حرف) — يمنع استهلاك الذاكرة/تعليق الخادم
  if (String(text).length > 200000) {
    return res.status(413).json({ error: 'input-too-large' });
  }
  try {
    const sourceLang = await detectLanguage(text);
    const raw = await translateText(String(text), targetLang, sourceLang, { provider, providers });
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

// ===== تقسيم ناتج الترجمة إلى أجزاء بمحاذاة صارمة =====
// الفاصل \n\n هو فاصل القطع في translateTextWithMeta.
// لا «إنقاذ» ولا توزيع تقريبي: إمّا مطابقة 1:1 أو لا شيء.
function splitParts(translated) {
  return String(translated).split('\n\n').map((p) => p.trim()).filter((p) => p.length);
}

function alignmentError(count, expected) {
  const e = new Error(`عدد أجزاء الترجمة ${count} لا يطابق عدد الأسطر ${expected}`);
  e.code = 'alignment-failed';
  return e;
}

// ===== ترجمة دفعة أسطر مع محاذاة 1:1 مضمونة =====
// عند عدم تطابق العدد نقسم الدفعة إلى نصفين ونعيد المحاولة (تكراريًا حتى سطر واحد).
// إن فشل سطر منفرد نرفع alignment-failed → 502، لأن الفشل الصريح أفضل من
// ترجمة تبدو سليمة ومعناها محطّم (التوزيع النسبي القديم كان ينتج ذلك بالضبط).
async function translateBatch(lines, targetLang, sourceLang, opts) {
  const joined = lines.map((l) => l.original).join('\n\n');
  const { translated, chunksFromCache, chunksTotal } = await translate.translateTextWithMeta(joined, targetLang, sourceLang, opts);
  const parts = splitParts(translated);

  if (parts.length === lines.length) {
    return { parts, chunksTotal, chunksFromCache };
  }

  // سطر واحد ولا يزال غير مطابق ⇒ لا مجال لتقسيم آخر
  if (lines.length === 1) {
    throw alignmentError(parts.length, 1);
  }

  // تقسيم إلى نصفين وإعادة المحاولة
  const mid = Math.floor(lines.length / 2);
  const left = await translateBatch(lines.slice(0, mid), targetLang, sourceLang, opts);
  const right = await translateBatch(lines.slice(mid), targetLang, sourceLang, opts);
  return {
    parts: left.parts.concat(right.parts),
    chunksTotal: chunksTotal + left.chunksTotal + right.chunksTotal,
    chunksFromCache: chunksFromCache + left.chunksFromCache + right.chunksFromCache,
  };
}

// ===== معالجة يوتيوب =====
// opts اختياري: { provider?, providers? } — يُمرَّر إلى سلسلة المزوّدين
// ===== ترجمة أسطر زمنية (مقاطع يوتيوب/فيديو محلي) =====
// lines: [{ start, duration, original }] → { sourceLang, captions: [{start,duration,original,translated}], cached }
// منطق مشترك: دفعات ≤4000 حرف + كشف لغة من الدفعة الأولى + محاذاة 1:1 صارمة (translateBatch)
async function translateLines(lines, targetLang, opts, glossary) {
  // تجميع الأسطر في دفعات ≤ 4000 حرف مع الحفاظ على المطابقة 1:1
  const batches = [];
  let cur = [];
  let curLen = 0;
  for (const line of lines) {
    const len = String(line.original || '').length + 1;
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
    // محاذاة 1:1 صارمة — ترمي alignment-failed بدل إنتاج سطور محشوّة/فارغة
    const { parts, chunksTotal, chunksFromCache } = await translateBatch(batch, targetLang, sourceLang, opts);
    totalChunks += chunksTotal;
    cachedChunks += chunksFromCache;
    batch.forEach((line, i) => {
      line.translated = applyGlossary(parts[i], glossary || []);
    });
    translatedAll.push(...batch);
  }
  return { sourceLang, captions: translatedAll, cached: totalChunks > 0 && cachedChunks === totalChunks };
}

async function handleYouTube(res, videoId, targetLang, videoLang, glossary, opts) {
  try {
    // ===== المسار 1: Gemini تشاهد الفيديو وتترجمه =====
    // أولًا دائمًا لأنه الوحيد الذي يعمل على الاستضافة السحابية: خوادم Google
    // تجلب الفيديو، فلا يمسّه حجب يوتيوب لعناوين مراكز البيانات.
    const geminiVideo = require('./geminiVideo');
    if (geminiVideo.isAvailable()) {
      try {
        const r = await geminiVideo.translateYouTubeVideo(videoId, targetLang);
        const captions = r.captions.map((c) => ({
          ...c,
          translated: applyGlossary(c.translated, glossary || []),
        }));
        res.json({
          type: 'youtube',
          videoId,
          sourceLang: r.sourceLang,
          captions,
          meta: { title: 'فيديو يوتيوب', source: 'gemini', cached: r.cached },
        });
        trackUsage({ type: 'youtube', sourceLang: r.sourceLang, targetLang });
        return;
      } catch (e) {
        // الفيديو الطويل خطأ مستخدم لا عطل مسار — لا فائدة من الاحتياطي
        if (e && e.code === 'video-too-long') throw e;
        console.error('[translate] gemini-video failed, falling back:', e && e.message);
      }
    }

    // ===== المسار 2: ترجمات يوتيوب النصية =====
    let metaSource = 'captions';
    let transcript;
    try {
      transcript = await getTranscript(videoId, videoLang);
    } catch (e) {
      if (e.code !== 'no-transcript') throw e;
      // لا توجد ترجمات نصية → تفريغ الصوت تلقائيًا عبر Whisper
      try {
        const { chunks } = await transcribeVideoAudio(videoId, videoLang);
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

    // الأسطر الزمنية (offset بالمللي ثانية → ثوانٍ) ثم الترجمة عبر المسار المشترك
    const lines = transcript.map((l) => ({ start: (l.offset || 0) / 1000, duration: (l.duration || 2000) / 1000, original: l.text }));
    const { sourceLang, captions, cached } = await translateLines(lines, targetLang, opts, glossary);

    res.json({
      type: 'youtube',
      videoId,
      sourceLang,
      captions,
      meta: { title: 'فيديو يوتيوب', source: metaSource, cached },
    });
    trackUsage({ type: 'youtube', sourceLang, targetLang }); // لا يُنتظر
  } catch (e) {
    return sendError(res, e);
  }
}

// ===== معالجة مقال =====
// opts اختياري: { provider?, providers? } — يُمرَّر إلى سلسلة المزوّدين
async function handleArticle(res, url, targetLang, glossary, opts) {
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
        const { translated, chunksFromCache, chunksTotal } = await translateTextWithMeta(b.content, targetLang, sourceLang, opts);
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
module.exports.translateBatch = translateBatch; // اختبارات المحاذاة
module.exports.translateLines = translateLines; // فيديو محلي — تُستدعى وقت التنفيذ
