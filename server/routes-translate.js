// server/routes-translate.js — مسارات API للترجمة
const express = require('express');
const config = require('./config');
const { extractVideoId, getTranscript, buildSrt } = require('./youtube');
const { translateText, detectLanguage, applyGlossary, getProviders } = require('./translate');
const translate = require('./translate'); // وصول وقت التنفيذ — يسمح بتزييف translateTextWithMeta في الاختبارات
const { transcribeVideoAudio } = require('./audio');
const { trackUsage } = require('./usage'); // عدّاد استخدام بسيط
const { logInfo } = require('./logger');
const { sendError: _sendError, scrubSecrets } = require('./errorHelpers');
const { isSupportedLang } = require('./languages');

const router = express.Router();

// ===== استجابة خطأ موحدة (izu errorHelpers — scrubSecrets + detail for Gemini) =====
function sendError(res, e) {
  return _sendError(res, e, { label: 'translate' });
}

// ===== التحقق من المدخلات =====

// صيغة رمز اللغة: ISO 639-1 مع منطقة اختيارية (مثل 'ar', 'zh-CN', 'pt-BR')
const LANG_CODE_RE = /^[a-z]{2,3}(-[a-zA-Z]{2,})?$/i;

/**
 * تحقق من صلاحية targetLang.
 * يقبل: رمز لغة بسيط أو مع منطقة (≤ 10 حرف)، أو اسم في قاموس languages.js.
 * يُعيد true/strings-safe أو false.
 */
function isValidTargetLang(code) {
  if (typeof code !== 'string') return false;
  const trimmed = code.trim();
  if (trimmed.length === 0 || trimmed.length > 10) return false;
  return LANG_CODE_RE.test(trimmed) || isSupportedLang(trimmed);
}

/**
 * تنقية المسرد: يُزيل الإدخالات غير الصالحة ويُبقي فقط {from,to} صالحتين.
 * @param {any} raw
 * @returns {Array<{from:string,to:string}>}
 */
function sanitizeGlossary(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g) => g && typeof g.from === 'string' && typeof g.to === 'string')
    .map((g) => ({ from: g.from.trim().slice(0, 200), to: g.to.trim().slice(0, 200) }))
    .filter((g) => g.from.length > 0 && g.to.length > 0)
    .slice(0, 100); // سقف 100 مصطلح
}

/**
 * التحقق من المزوّد: يقبل فقط أسماء مزوّدين معروفين (من translate.js).
 * @param {string|undefined} id
 * @returns {string|undefined} — المعرّف الأصلي إن كان صالحًا، وإلا undefined
 */
function sanitizeProvider(id) {
  if (typeof id !== 'string' || !id.trim()) return undefined;
  const KNOWN_IDS = new Set(['google', 'mymemory', 'libre', 'deepl', 'gemini', 'zen']);
  return KNOWN_IDS.has(id.trim()) ? id.trim() : undefined;
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
  // التحقق من لغة الهدف
  if (!isValidTargetLang(targetLang)) {
    return res.status(400).json({ error: 'invalid-lang' });
  }
  const cleanUrl = url.trim();
  // حد طول الرابط — يمنع مدخلات ضخمة عبر URL
  if (cleanUrl.length > 2000) {
    return res.status(413).json({ error: 'input-too-large' });
  }
  // مسرد اختياري: مصفوفة {from,to} — تُنظَّف وتُقصّ إلى 100 إدخال
  const g = sanitizeGlossary(glossary);
  // فرض المزوّد/الترتيب اختياريًا (مُمرَّر كـ opts إلى سلسلة المزوّدين)
  const tOpts = {
    provider: sanitizeProvider(provider),
    providers: Array.isArray(providers) ? providers.map(sanitizeProvider).filter(Boolean) : undefined,
  };

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
  // التحقق من لغة الهدف
  if (!isValidTargetLang(targetLang)) {
    return res.status(400).json({ error: 'invalid-lang' });
  }
  // حد حجم النص (حوالي 200 ألف حرف) — يمنع استهلاك الذاكرة/تعليق الخادم
  if (String(text).length > 200000) {
    return res.status(413).json({ error: 'input-too-large' });
  }
  try {
    const sourceLang = await detectLanguage(text);
    const raw = await translateText(String(text), targetLang, sourceLang, {
      provider: sanitizeProvider(provider),
      providers: Array.isArray(providers) ? providers.map(sanitizeProvider).filter(Boolean) : undefined,
    });
    const translated = applyGlossary(raw, sanitizeGlossary(glossary));
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
    if (!config.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'smart-unavailable' });
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent`;
    const prompt = `أعد صياغة النص التالي إلى ${targetLang === 'ar' ? 'العربية' : targetLang} بأسلوب طبيعي موجز يحافظ على المعنى. لا تشرح، أعد النص المترجم فقط:\n\n${String(text).slice(0, 8000)}`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.GEMINI_API_KEY },
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

// ===== POST /api/srt — بناء ملف SRT =====
// قائمة الترجمة تأتي من جسم الطلب (محدود أصلًا بـ 2MB عبر express.json)، لكن نكفّ
// النمو عدديًا أيضًا: فيديو مدته 3 ساعات يحتاج ~10-11 ألف مقطعًا، فسقف 50000 يمنع
// حلقات بناء ضخمة بدون تقييد مشروع (حتى لو كبر حد الجسم مستقبلًا).
const MAX_SRT_CAPTIONS = 50000;
router.post('/srt', (req, res) => {
  const { captions } = req.body || {};
  if (!Array.isArray(captions) || !captions.length) {
    return res.status(400).json({ error: 'invalid-captions' });
  }
  if (captions.length > MAX_SRT_CAPTIONS) {
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
  let geminiError = null;
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
        geminiError = e; // نحتفظ به: لو فشلت الاحتياطيات أيضًا فهذا هو السبب الحقيقي
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
    // فشل كل المسارات: سبب Gemini أنفع للمستخدم من youtube-blocked، لأن
    // الحجب متوقّع على السحابة بينما فشل Gemini هو العطل القابل للإصلاح.
    if (geminiError && (!e || e.code === 'youtube-blocked' || e.code === 'fetch-failed')) {
      return sendError(res, geminiError);
    }
    return sendError(res, e);
  }
}

// ===== معالجة مقال =====
// opts اختياري: { provider?, providers? } — يُمرَّر إلى سلسلة المزوّدين
async function handleArticle(res, url, targetLang, glossary, opts) {
  const { title, blocks } = await require('./fetchContent').fetchArticleContent(url);

  // كشف لغة المصدر من أول 5 كتل
  const sample = blocks.slice(0, 5).map((b) => b.content).join(' ');
  const sourceLang = await translate.detectLanguage(sample);

  // ترجمة الكتل في دفعات غير متزامنة (5 كتل في المرة) للحفاظ على استجابة الواجهة
  const translatedBlocks = [];
  const chunkSize = 5;
  let totalChunks = 0;
  let cachedChunks = 0;
  for (let i = 0; i < blocks.length; i += chunkSize) {
    const slice = blocks.slice(i, i + chunkSize);
    const results = await Promise.all(
      slice.map(async (b) => {
        const { translated, chunksFromCache, chunksTotal } = await translate.translateTextWithMeta(b.content, targetLang, sourceLang, opts);
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
module.exports.scrubSecrets = scrubSecrets; // إعادة استخدام في أجزاء أخرى عند الحاجة
module.exports.translateBatch = translateBatch; // اختبارات المحاذاة
module.exports.translateLines = translateLines; // فيديو محلي — تُستدعى وقت التنفيذ
