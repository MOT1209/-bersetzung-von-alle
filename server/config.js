// server/config.js — تحميل الإعدادات من .env
require('dotenv').config();
const path = require('path');

// مجلد نماذج التفريغ الصوتي (لا يُدرج في git)
const MODEL_DIR = process.env.MODEL_DIR || path.join(__dirname, '..', 'models');

module.exports = {
  PORT: process.env.PORT || 3000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '', // empty = same-origin only; comma-separated allowlist
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  // ===== مسار الفيديو: Gemini تجلب رابط يوتيوب بنفسها =====
  // يتجاوز حجب يوتيوب لعناوين مراكز البيانات (السبب الوحيد لفشل الروابط على
  // Render). نموذج منفصل لأن 2.0-flash أضعف في فهم الفيديو.
  GEMINI_VIDEO: process.env.GEMINI_VIDEO !== 'false', // مفعّل ما لم يُعطَّل صراحةً
  GEMINI_VIDEO_MODEL: process.env.GEMINI_VIDEO_MODEL || 'gemini-2.5-flash',
  // حد المدة: ~300 رمز لكل ثانية فيديو، والحصة المجانية 8 ساعات يوميًا
  MAX_VIDEO_MINUTES: Number(process.env.MAX_VIDEO_MINUTES) || 20,

  // محركات الترجمة الاحتياطية المجانية (تُستخدم عند حجب Google أو استنفاد حصته)
  LIBRE_URL: process.env.LIBRE_URL || 'https://libretranslate.com', // خادم LibreTranslate (اختياري)
  MYMEMORY_EMAIL: process.env.MYMEMORY_EMAIL || '', // بريد اختياري يرفع حصة MyMemory اليومية

  // ===== مزوّدات ترجمة اختيارية (مجانية) =====
  // DeepL المجاني — مفتاح اختياري من deeple.com/pro-api (مجاني)؛ الخادم الافتراضي api-free
  DEEPL_API_KEY: process.env.DEEPL_API_KEY || '',
  DEEPL_URL: process.env.DEEPL_URL || 'https://api-free.deepl.com',
  // opencode zen — بوابة متوافقة مع OpenAI (/chat/completions بمصادقة Bearer).
  // ZEN_BASE_URL قابل للتغيير فيغطي أيضًا أي خادم متوافق: Ollama المحلي
  // (http://localhost:11434/v1) أو LM Studio (http://localhost:1234/v1).
  ZEN_BASE_URL: process.env.ZEN_BASE_URL || 'https://opencode.ai/zen/v1',
  ZEN_API_KEY: process.env.ZEN_API_KEY || '',
  ZEN_MODEL: process.env.ZEN_MODEL || 'deepseek-v4-flash-free',
  // ترتيب المزوّدين المفضّل (فاصلة) — تُتخطى المزوّدات غير المتوفرة تلقائيًا
  PROVIDER_ORDER: process.env.PROVIDER_ORDER || '', // مثل: 'google,mymemory,libre,gemini'
  // نموذج التفريغ الصوتي. tiny سريع لكنه ضعيف جدًا على العربية والتركية.
  // للغات الأربع المستهدفة (ar/de/tr/en) يُنصح بـ small على الأقل عند توفر
  // الذاكرة: Xenova/whisper-tiny (39MB) < base (74MB) < small (244MB).
  // الإنجليزية والألمانية مقبولتان على base؛ العربية والتركية تحتاج small+.
  WHISPER_MODEL: process.env.WHISPER_MODEL || 'Xenova/whisper-tiny',

  // محرك التفريغ الصوتي: 'sherpa' (أسرع بكثير، sherpa-onnx) أو 'transformers' (الاحتياطي Xenova)
  // إن لم يكن sherpa-onnx مثبتًا أو فشل تحميل نموذجه يعود audio.js تلقائيًا إلى 'transformers'
  STT_ENGINE: process.env.STT_ENGINE || 'sherpa',

  // نموذج sherpa-onnx: whisper-tiny متعدد اللغات (يدعم 100+ لغة، int8 ~75MB) من HuggingFace
  // المسارات قابلة للتعديل عبر المتغيرات؛ يُنزَّل النموذج تلقائيًا عند أول تشغيل ويُخزَّن محليًا
  SHERPA_MODEL_DIR: process.env.SHERPA_MODEL_DIR || path.join(MODEL_DIR, 'sherpa-whisper-tiny'),
  SHERPA_ENCODER: process.env.SHERPA_ENCODER || '', // يُملأ تلقائيًا من SHERPA_MODEL_DIR
  SHERPA_DECODER: process.env.SHERPA_DECODER || '',
  SHERPA_TOKENS: process.env.SHERPA_TOKENS || '',

  // ===== حد الطلبات (rate limit) — حماية من إساءة الاستخدام =====
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX) || 20, // طلبات/دقيقة/IP لمسارات الترجمة
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  RATE_LIMIT_MAX_HEAVY: Number(process.env.RATE_LIMIT_MAX_HEAVY) || 10, // للمسارات الأثقل (TTS والفيديو)
  // الدبلجة تُطلب على دفعات صغيرة متتابعة طوال الفيديو، لا مرة واحدة: حدّ العشرة
  // يُستنفد خلال دقيقة مشاهدة واحدة فتتوقف الدبلجة بـ 429. الطلب نفسه محدود
  // أصلًا بـ 40 مقطعًا، فالسقف الأعلى هنا لا يوسّع سطح الإساءة كثيرًا.
  RATE_LIMIT_MAX_DUB: Number(process.env.RATE_LIMIT_MAX_DUB) || 60,

  // ===== فيديو محلي: أقصى مدة بالدقائق (الافتراضي 5 — STT بطيء ~5.5x المدة على هذا الجهاز) =====
  LOCAL_VIDEO_MAX_MIN: Number(process.env.LOCAL_VIDEO_MAX_MIN) || 5,
};
