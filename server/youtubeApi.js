// server/youtubeApi.js — عميل YouTube Data API v3 الرسمي (المسار المتوافق)
//
// ═══ ما يستطيعه هذا الملف وما لا يستطيعه — اقرأ قبل التوسيع ═══
//
// ✅ البيانات الوصفية عبر videos.list: مفتاح API وحده يكفي للفيديوهات العامة،
//    والتكلفة **وحدة واحدة** من حصة 10,000 وحدة يوميًا.
//
// ❌ **نص الترجمات غير متاح رسميًا لفيديو لا تملكه.** captions.download يتطلب
//    OAuth بحساب **مالك** الفيديو، ويعيد 403 لأي طرف ثالث — وهذا سلوك مقصود
//    بالتصميم لا خلل ولا مسألة حصة، ولا يلتفّ عليه أي نطاق OAuth أوسع ولا حساب
//    خدمة. لذلك لا توجد هنا دالة لتنزيل الترجمات، ولن تُضاف.
//
// الأثر المعماري: في المسار المتوافق تأتي **البيانات الوصفية** من هذا العميل،
// ويأتي **المحتوى** من ملف يرفعه المستخدم (/api/video-local) — فهو يملك حق
// معالجة ما يرفعه. حقل contentDetails.caption يخبرنا إن كان للفيديو ترجمات
// أصلًا (بلا تكلفة إضافية)، لكنه لا يمنحنا نصّها.
const config = require('./config');
const youtube = require('./youtube'); // وصول وقت التنفيذ (extractVideoId)

const TIMEOUT_MS = 15000;

// يُقرأ وقت الاستدعاء لا وقت الاستيراد (تجميده يمنع الاختبارات من توجيهه لخادم محلي)
function apiBase() {
  return String(config.YOUTUBE_API_BASE || 'https://www.googleapis.com/youtube/v3').replace(/\/+$/, '');
}

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

// هل المسار مفعّل؟ يُقرأ وقت الاستدعاء — حفظ المفتاح من لوحة الإعدادات يعدّل config مباشرةً
function isAvailable() {
  return Boolean(config.YOUTUBE_API_KEY);
}

// مدة ISO 8601 (PT1H2M10S) → ثوانٍ. تعيد 0 عند التعذّر.
function parseIsoDuration(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(iso || ''));
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return (Number(d || 0) * 86400) + (Number(h || 0) * 3600) + (Number(min || 0) * 60) + Math.round(Number(s || 0));
}

// أفضل صورة مصغّرة متاحة (تتدرّج نزولًا — الحقول اختيارية حسب الفيديو)
function bestThumbnail(thumbnails) {
  const t = thumbnails || {};
  const pick = t.maxres || t.standard || t.high || t.medium || t.default;
  return (pick && pick.url) || null;
}

// معرّف الفيديو من رابط كامل أو من المعرّف نفسه (11 محرفًا)
function toVideoId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const fromUrl = youtube.extractVideoId(raw);
  if (fromUrl) return fromUrl;
  return /^[\w-]{11}$/.test(raw) ? raw : null;
}

/**
 * جلب البيانات الوصفية لفيديو عام عبر videos.list (وحدة واحدة من الحصة).
 * @param {string} urlOrId رابط يوتيوب أو معرّف الفيديو
 * @returns {Promise<object>} { videoId, title, description, channel, durationSec, hasCaptions, ... }
 */
async function getVideoMetadata(urlOrId) {
  if (!isAvailable()) {
    throw err('youtube-api-disabled', 'YOUTUBE_API_KEY غير مضبوط');
  }
  const videoId = toVideoId(urlOrId);
  if (!videoId) throw err('invalid-url', 'رابط يوتيوب غير صالح');

  const url = `${apiBase()}/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}`
    + `&key=${encodeURIComponent(config.YOUTUBE_API_KEY)}`;

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw err('youtube-api-failed', 'تعذّر الاتصال بواجهة يوتيوب: ' + (e && e.message));
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // 403 من هذه الواجهة يعني غالبًا استنفاد الحصة أو مفتاحًا غير صالح/مقيَّدًا.
    // نميّزه لأن علاجه مختلف تمامًا عن عطل عام (انتظار الغد مقابل إصلاح المفتاح).
    if (res.status === 403) {
      throw err('youtube-quota', 'حصة يوتيوب مستنفدة أو المفتاح غير صالح: ' + body.slice(0, 200));
    }
    if (res.status === 400) {
      throw err('invalid-url', 'طلب غير صالح لواجهة يوتيوب: ' + body.slice(0, 200));
    }
    throw err('youtube-api-failed', `YouTube HTTP ${res.status} ${body.slice(0, 200)}`);
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw err('youtube-api-failed', 'استجابة يوتيوب ليست JSON صالحًا');
  }

  const item = data && Array.isArray(data.items) ? data.items[0] : null;
  // مصفوفة فارغة = الفيديو خاص أو محذوف أو المعرّف خاطئ — تمييزه عن عطل الشبكة مهم
  if (!item) throw err('video-not-found', 'الفيديو غير موجود أو غير عام');

  const snippet = item.snippet || {};
  const details = item.contentDetails || {};

  return {
    videoId,
    title: snippet.title || '',
    description: snippet.description || '',
    channel: snippet.channelTitle || '',
    channelId: snippet.channelId || '',
    publishedAt: snippet.publishedAt || null,
    thumbnail: bestThumbnail(snippet.thumbnails),
    durationSec: parseIsoDuration(details.duration),
    defaultLanguage: snippet.defaultAudioLanguage || snippet.defaultLanguage || null,
    // للفيديو ترجمات؟ (من contentDetails.caption — بلا تكلفة إضافية)
    // تنبيه: 'true' هنا لا يعني أن النص متاح لنا — انظر رأس الملف.
    hasCaptions: details.caption === 'true',
  };
}

module.exports = {
  isAvailable,
  getVideoMetadata,
  // مُصدَّرة للاختبار المباشر
  parseIsoDuration,
  bestThumbnail,
  toVideoId,
  apiBase,
};
