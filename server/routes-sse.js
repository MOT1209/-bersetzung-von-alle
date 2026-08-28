// server/routes-sse.js — بث الترجمة عبر SSE (Server-Sent Events)
// يمكّن الواجهة من عرض الترجمة فورًا مع التقدّم بدلاً من انتظار النتيجة كاملة.
const express = require('express');
const { extractVideoId, getTranscript } = require('./youtube');
const translate = require('./translate'); // وصول وقت التنفيذ (نمط routes-translate.js)
const fetchContent = require('./fetchContent');

// أغلفة وصول وقت التنفيذ: تفكيك الدوال وقت الاستيراد يجمّد المرجع الأصلي،
// فيصبح المسار غير قابل للتزييف في الاختبارات (نفس الخلل الذي عولج في
// routes-translate.js بالالتزام efd81ed). الوصول عبر الوحدة يبقيه حيًّا.
const detectLanguage = (...a) => translate.detectLanguage(...a);
const applyGlossary = (...a) => translate.applyGlossary(...a);
const fetchArticleContent = (...a) => fetchContent.fetchArticleContent(...a);
const { transcribeVideoAudio } = require('./audio');
const { trackUsage } = require('./usage');

const router = express.Router();

// ===== خريطة رمز الخطأ → كود موحّد (مطابقة لـ routes-translate.js) =====
const ERROR_CODES = {
  'invalid-url': 'invalid-url',
  'fetch-failed': 'fetch-failed',
  'no-transcript': 'no-transcript',
  'audio-empty': 'audio-empty',
  'content-empty': 'content-empty',
  'pdf-unsupported': 'pdf-unsupported',
  'blocked-url': 'blocked-url',
  'translate-failed': 'translate-failed',
  'alignment-failed': 'alignment-failed',
  'invalid-text': 'invalid-text',
  'input-too-large': 'input-too-large',
  'server-error': 'server-error',
};

function normalizeError(e) {
  const raw = e && e.code;
  const code = typeof raw === 'string' && ERROR_CODES[raw] ? raw : 'server-error';
  return { error: code };
}

// ===== POST /api/translate-stream — ترجمة بثّ مباشر عبر SSE =====
// body: { url?, text?, targetLang?, glossary?, provider?, providers? }
// Events: init → chunk* → done | error
router.post('/translate-stream', async (req, res) => {
  // 1) ترويسات SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // منع التخزين المؤقت عند الوسيطات/البوابات
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // 2) كشف انقطاع العميل
  // لا تستخدم req.on('close') هنا: منذ Node 16 يُطلق IncomingMessage الحدث
  // 'close' فور اكتمال قراءة جسم الطلب — وexpress.json يستهلكه قبل بلوغ هذا
  // المعالج، فيصبح disconnected=true دائمًا وكل sendEvent يُهمَل، فيعود البثّ
  // فارغًا. حدث res هو الذي يعبّر فعلاً عن انقطاع الاتصال.
  let disconnected = false;
  res.on('close', () => { disconnected = true; });

  // 3) مساعد إرسال الأحداث
  function sendEvent(event, data) {
    if (disconnected) return false;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      disconnected = true;
      return false;
    }
  }

  // 4) استخراج المُدخلات
  const { url, text, targetLang = 'ar', glossary, provider, providers } = req.body || {};
  const g = Array.isArray(glossary) ? glossary : [];
  const tOpts = { provider, providers };

  try {
    // ===== المسار 1: يوتيوب =====
    if (url) {
      const cleanUrl = String(url).trim();
      if (!/^https?:\/\//i.test(cleanUrl)) {
        if (sendEvent('error', normalizeError({ code: 'invalid-url' }))) res.end();
        return;
      }
      if (cleanUrl.length > 2000) {
        if (sendEvent('error', normalizeError({ code: 'input-too-large' }))) res.end();
        return;
      }

      const videoId = extractVideoId(cleanUrl);
      if (videoId) {
        return await streamYouTube(res, sendEvent, videoId, targetLang, g, tOpts);
      }

      // رابط عادي → مقال/موقع
      return await streamArticle(res, sendEvent, cleanUrl, targetLang, g, tOpts);
    }

    // ===== المسار 2: نص مباشر =====
    if (text) {
      if (!String(text).trim()) {
        if (sendEvent('error', normalizeError({ code: 'invalid-text' }))) res.end();
        return;
      }
      if (String(text).length > 200000) {
        if (sendEvent('error', normalizeError({ code: 'input-too-large' }))) res.end();
        return;
      }
      return await streamText(res, sendEvent, text, targetLang, g, tOpts);
    }

    // لا رابط ولا نص
    if (sendEvent('error', { error: 'invalid-input' })) res.end();
  } catch (e) {
    console.error('[translate-stream] unhandled:', e);
    sendEvent('error', normalizeError(e));
    res.end();
  }
});

// ===== بث ترجمة يوتيوب =====
async function streamYouTube(res, sendEvent, videoId, targetLang, glossary, tOpts) {
  let geminiError = null;

  try {
    // ===== المسار 1: Gemini تشاهد الفيديو =====
    const geminiVideo = require('./geminiVideo');
    if (geminiVideo.isAvailable()) {
      try {
        const r = await geminiVideo.translateYouTubeVideo(videoId, targetLang);
        const captions = r.captions.map((c) => ({
          ...c,
          translated: applyGlossary(c.translated, glossary || []),
        }));

        // إرسال init ثم كل الكابشنز دفعة واحدة (Gemini يعيد النتيجة كاملة)
        if (!sendEvent('init', {
          sourceLang: r.sourceLang,
          totalChunks: captions.length,
          title: 'فيديو يوتيوب',
          type: 'youtube',
        })) return res.end();

        for (let i = 0; i < captions.length; i++) {
          if (!sendEvent('chunk', {
            index: i,
            text: captions[i].translated,
            total: captions.length,
            start: captions[i].start,
            duration: captions[i].duration,
            original: captions[i].original,
          })) return res.end();
        }

        trackUsage({ type: 'youtube', sourceLang: r.sourceLang, targetLang });
        sendEvent('done', {
          type: 'youtube',
          videoId,
          sourceLang: r.sourceLang,
          captions,
          meta: { title: 'فيديو يوتيوب', source: 'gemini', cached: r.cached },
        });
        return res.end();
      } catch (e) {
        if (e && e.code === 'video-too-long') throw e;
        console.error('[translate-stream] gemini-video failed, fallback:', e && e.message);
        geminiError = e;
      }
    }

    // ===== المسار 2: ترجمات يوتيوب النصية =====
    let metaSource = 'captions';
    let transcript;
    try {
      transcript = await getTranscript(videoId);
    } catch (e) {
      if (e.code !== 'no-transcript') throw e;
      try {
        const { chunks } = await transcribeVideoAudio(videoId);
        transcript = chunks.map((c) => ({
          text: c.text,
          offset: Math.round(c.start * 1000),
          duration: Math.round(c.duration * 1000),
        }));
        metaSource = 'audio';
      } catch (e2) {
        throw e2;
      }
    }

    // تحويل الأسطر
    const lines = transcript.map((l) => ({
      start: (l.offset || 0) / 1000,
      duration: (l.duration || 2000) / 1000,
      original: l.text,
    }));

    // إرسال init
    if (!sendEvent('init', {
      sourceLang: 'auto',
      totalChunks: lines.length,
      title: 'فيديو يوتيوب',
      type: 'youtube',
    })) return res.end();

    // كشف لغة المصدر من أول عينة
    let sourceLang = 'en';
    const sample = lines.slice(0, 5).map((l) => l.original).join(' ').slice(0, 500);
    if (sample) {
      const detected = await detectLanguage(sample);
      if (detected) sourceLang = detected;
    }

    // ترجمة الأسطر دفعة دفعة وإرسال chunk لكل سطر
    const batchSize = 4000;
    let curBatch = [];
    let curLen = 0;
    const allBatches = [];
    for (const line of lines) {
      const len = String(line.original || '').length + 1;
      if (curLen + len > batchSize && curBatch.length) {
        allBatches.push(curBatch);
        curBatch = [line];
        curLen = len;
      } else {
        curBatch.push(line);
        curLen += len;
      }
    }
    if (curBatch.length) allBatches.push(curBatch);

    let sentCount = 0;
    const translatedCaptions = []; // نجمع النتائج لإرسالها في done
    for (const batch of allBatches) {
      if (res.writableEnded) return; // فحص انقطاع العميل

      const joined = batch.map((l) => l.original).join('\n\n');
      const { translated } = await translate.translateTextWithMeta(joined, targetLang, sourceLang, tOpts);
      const parts = String(translated).split('\n\n').map((p) => p.trim()).filter(Boolean);

      // محاذاة 1:1 — لو العدد لا يطابق، نرسل النص كما هو لكل سطر
      for (let i = 0; i < batch.length; i++) {
        const part = parts[i] || parts[0] || '';
        const translatedText = applyGlossary(part, glossary);
        sentCount++;

        translatedCaptions.push({
          start: batch[i].start,
          duration: batch[i].duration,
          original: batch[i].original,
          translated: translatedText,
        });

        if (!sendEvent('chunk', {
          index: sentCount - 1,
          text: translatedText,
          total: lines.length,
          start: batch[i].start,
          duration: batch[i].duration,
          original: batch[i].original,
        })) return res.end();
      }
    }

    trackUsage({ type: 'youtube', sourceLang, targetLang });

    sendEvent('done', {
      type: 'youtube',
      videoId,
      sourceLang,
      captions: translatedCaptions,
      meta: { title: 'فيديو يوتيوب', source: metaSource, cached: false },
    });
    return res.end();

  } catch (e) {
    if (geminiError && (!e || e.code === 'youtube-blocked' || e.code === 'fetch-failed')) {
      sendEvent('error', normalizeError(geminiError));
    } else {
      sendEvent('error', normalizeError(e));
    }
    res.end();
  }
}

// ===== بث ترجمة مقال/موقع =====
async function streamArticle(res, sendEvent, url, targetLang, glossary, tOpts) {
  try {
    const { title, blocks } = await fetchArticleContent(url);

    // كشف لغة المصدر
    const sample = blocks.slice(0, 5).map((b) => b.content).join(' ');
    const sourceLang = await detectLanguage(sample);

    // إرسال init
    if (!sendEvent('init', {
      sourceLang,
      totalChunks: blocks.length,
      title: title || 'مقال',
      type: 'article',
    })) return res.end();

    // ترجمة الكتل 5 في المرة وإرسال chunk لكل كتلة
    const chunkSize = 5;
    for (let i = 0; i < blocks.length; i += chunkSize) {
      if (res.writableEnded) return; // فحص انقطاع العميل

      const slice = blocks.slice(i, i + chunkSize);
      const results = await Promise.all(
        slice.map(async (b) => {
          const { translated } = await translate.translateTextWithMeta(
            b.content, targetLang, sourceLang, tOpts
          );
          return translated;
        })
      );

      for (let j = 0; j < slice.length; j++) {
        const idx = i + j;
        const translatedText = applyGlossary(results[j], glossary);
        if (!sendEvent('chunk', {
          index: idx,
          text: translatedText,
          total: blocks.length,
          blockType: slice[j].type,
          original: slice[j].content,
        })) return res.end();
      }
    }

    trackUsage({ type: 'article', sourceLang, targetLang });

    sendEvent('done', {
      type: 'article',
      sourceLang,
      title: title || 'مقال',
      blocksCount: blocks.length,
      meta: { cached: false },
    });
    return res.end();
  } catch (e) {
    sendEvent('error', normalizeError(e));
    res.end();
  }
}

// ===== بث ترجمة نص مباشر =====
async function streamText(res, sendEvent, text, targetLang, glossary, tOpts) {
  try {
    const sourceLang = await detectLanguage(text);

    // تقسيم النص إلى فقرات (\n\n)
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    // إذا لم تكن هناك فقرات واضحة، قسّم على الجمل
    const chunks = paragraphs.length > 1
      ? paragraphs
      : text.split(/(?<=[.!?؟])\s+/).filter((s) => s.trim().length > 0);

    // إرسال init
    if (!sendEvent('init', {
      sourceLang,
      totalChunks: chunks.length,
      title: null,
      type: 'text',
    })) return res.end();

    // ترجمة كل قطعة على حدة وإرسال chunk
    for (let i = 0; i < chunks.length; i++) {
      if (res.writableEnded) return; // فحص انقطاع العميل

      const { translated } = await translate.translateTextWithMeta(
        chunks[i], targetLang, sourceLang, tOpts
      );
      const translatedText = applyGlossary(translated, glossary);

      if (!sendEvent('chunk', {
        index: i,
        text: translatedText,
        total: chunks.length,
        original: chunks[i],
      })) return res.end();
    }

    trackUsage({ type: 'text', sourceLang, targetLang });

    sendEvent('done', {
      type: 'text',
      sourceLang,
      totalChunks: chunks.length,
      meta: { cached: false },
    });
    return res.end();
  } catch (e) {
    sendEvent('error', normalizeError(e));
    res.end();
  }
}

module.exports = router;
