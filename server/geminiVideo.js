// server/geminiVideo.js — ترجمة فيديو يوتيوب عبر Gemini متعددة الوسائط
//
// الفكرة: نمرّر رابط يوتيوب إلى Gemini عبر fileData.fileUri، فتجلبه **خوادم
// Google** لا خادمنا. هذا يتجاوز حجب يوتيوب لعناوين مراكز البيانات — وهو
// السبب الوحيد لفشل ترجمة الروابط على Render (مُثبَت: youtube-blocked خلال
// 12 ثانية هناك، ونجاح كامل محليًا).
//
// وهي متعددة الوسائط: تسمع الصوت وترى الصورة معًا، فتفهم سياقًا يعجز عنه
// التفريغ الصوتي وحده.
//
// الواجهة العامة: translateYouTubeVideo(videoId, targetLang, opts)
//   → { sourceLang, captions: [{ start, duration, original, translated }] }
// شكل captions مطابق لمخرَج translateLines، فيندمج في الواجهة بلا تعديل.
const config = require('./config');
const { get: cacheGet, set: cacheSet } = require('./cache');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 300000; // الفيديو أبطأ بكثير من النص

// مخطط مُقيَّد للمخرَج. التوثيق لا يؤكد دعمه على مسار الفيديو، لذا التحقق
// الدفاعي أدناه إلزامي لا اعتماد عليه وحده.
const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      start: { type: 'STRING' },
      end: { type: 'STRING' },
      original: { type: 'STRING' },
      translated: { type: 'STRING' },
    },
    required: ['start', 'end', 'translated'],
  },
};

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

/** "MM:SS" أو "HH:MM:SS" (ويقبل الكسور) → ثوانٍ. يُرجع null عند التعذّر. */
function parseTimestamp(ts) {
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts >= 0 ? ts : null;
  const s = String(ts == null ? '' : ts).trim();
  if (!s) return null;
  const parts = s.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  let total = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isFinite(n) || n < 0) return null;
    total = total * 60 + n;
  }
  return total;
}

/**
 * تحقق صارم قبل القبول — بروح البند B2: الفشل الصريح قبل النجاح الكاذب.
 * لا نُرجع أبدًا ترجمة فيها سطر فارغ أو طوابع متراجعة.
 */
function validateAndNormalize(items, maxSeconds) {
  if (!Array.isArray(items) || items.length === 0) {
    throw err('gemini-video-failed', 'الرد ليس مصفوفة أو فارغ');
  }

  const captions = [];
  let prevStart = -1;

  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const start = parseTimestamp(it.start);
    const end = parseTimestamp(it.end);
    const translated = String(it.translated == null ? '' : it.translated).trim();

    if (start === null) throw err('gemini-video-failed', `طابع بداية غير صالح في العنصر ${i + 1}`);
    if (!translated) throw err('gemini-video-failed', `ترجمة فارغة في العنصر ${i + 1}`);
    if (start < prevStart) {
      throw err('gemini-video-failed', `طوابع زمنية متراجعة عند العنصر ${i + 1}`);
    }

    // نهاية غائبة أو غير منطقية → مدة افتراضية معقولة بدل رفض السطر كله
    const duration = end !== null && end > start ? end - start : 2;

    captions.push({
      start,
      duration,
      original: String(it.original == null ? '' : it.original).trim(),
      translated,
    });
    prevStart = start;
  }

  // احتياطي لحدّ المدة: إن لم يحترم Gemini حقل endOffset نرفض هنا صراحةً
  const last = captions[captions.length - 1];
  if (maxSeconds && last.start > maxSeconds + 60) {
    throw err('video-too-long', `الفيديو يتجاوز الحد المسموح (${Math.round(maxSeconds / 60)} دقيقة)`);
  }

  return captions;
}

/** استخراج نص الرد من بنية Gemini مهما تعددت الأجزاء */
function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('').trim();
}

/** إزالة سياج ```json إن أضافه النموذج رغم responseMimeType */
function stripFence(t) {
  return t.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

function buildPrompt(targetLang) {
  return [
    `You are transcribing and translating a video into ${targetLang}.`,
    'Return ONLY a JSON array. Each element:',
    '{"start":"MM:SS","end":"MM:SS","original":"<speech as spoken>","translated":"<translation>"}',
    '',
    'Rules:',
    `- Translate every spoken segment into ${targetLang}. Never leave "translated" empty.`,
    '- Keep segments short (one sentence or clause), suitable for subtitles.',
    '- Timestamps must be in increasing order and must not overlap.',
    '- Use the visual context to disambiguate meaning when the audio is unclear.',
    '- Do not summarize, do not add commentary, do not skip parts.',
  ].join('\n');
}

async function callGemini(videoId, targetLang, maxSeconds) {
  const model = config.GEMINI_VIDEO_MODEL || config.GEMINI_MODEL;
  const url = `${API_BASE}/${model}:generateContent?key=${encodeURIComponent(config.GEMINI_API_KEY)}`;

  const videoPart = {
    fileData: { fileUri: `https://www.youtube.com/watch?v=${videoId}` },
  };
  // حدّ المدة يُفرض عند المصدر: أرخص من معالجة الفيديو كاملًا ثم رفضه.
  // (لا سبيل لمعرفة المدة مسبقًا على Render لأن yt-dlp محجوب هناك.)
  if (maxSeconds) {
    videoPart.videoMetadata = { endOffset: `${maxSeconds}s` };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(targetLang) }, videoPart] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // 400 على مسار الفيديو يعني غالبًا فيديو خاص/محذوف أو غير مدعوم
    throw err('gemini-video-failed', `Gemini HTTP ${res.status} ${body.slice(0, 200)}`);
  }

  const text = extractText(await res.json());
  if (!text) throw err('gemini-video-failed', 'استجابة فارغة');

  let parsed;
  try {
    parsed = JSON.parse(stripFence(text));
  } catch (e) {
    throw err('gemini-video-failed', 'الرد ليس JSON صالحًا');
  }
  return validateAndNormalize(parsed, maxSeconds);
}

/** هل المسار متاح أصلًا؟ (مفتاح + تفعيل) */
function isAvailable() {
  return Boolean(config.GEMINI_API_KEY && config.GEMINI_VIDEO);
}

/**
 * ترجمة فيديو يوتيوب كاملًا.
 * @returns {Promise<{ sourceLang: string, captions: Array, cached: boolean }>}
 */
async function translateYouTubeVideo(videoId, targetLang) {
  if (!isAvailable()) throw err('gemini-video-disabled', 'مسار Gemini للفيديو غير مفعّل');

  const maxSeconds = Math.max(1, Number(config.MAX_VIDEO_MINUTES) || 20) * 60;

  // الكاش أهم حماية للحصة: فيديو واحد لا يُعالَج مرتين للغة نفسها
  const cacheKey = `gemini-video:${videoId}`;
  const hit = cacheGet(cacheKey, 'video', targetLang);
  if (hit) {
    try {
      const captions = JSON.parse(hit);
      if (Array.isArray(captions) && captions.length) {
        return { sourceLang: 'auto', captions, cached: true };
      }
    } catch {
      // كاش تالف — نتجاهله ونعيد الطلب
    }
  }

  let captions;
  try {
    captions = await callGemini(videoId, targetLang, maxSeconds);
  } catch (e) {
    // الفيديو الطويل لا تنفع معه إعادة المحاولة — نرفعه فورًا
    if (e && e.code === 'video-too-long') throw e;
    // محاولة واحدة إضافية: أغلب الإخفاقات هنا تنسيقية لا جوهرية
    captions = await callGemini(videoId, targetLang, maxSeconds);
  }

  cacheSet(cacheKey, 'video', targetLang, JSON.stringify(captions));
  return { sourceLang: 'auto', captions, cached: false };
}

module.exports = {
  translateYouTubeVideo,
  isAvailable,
  // مُصدَّرة للاختبار المباشر
  parseTimestamp,
  validateAndNormalize,
};
