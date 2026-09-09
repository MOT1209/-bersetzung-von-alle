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

  // ===== YouTube Data API v3 الرسمي (المسار المتوافق) =====
  // مفتاح API وحده يكفي لبيانات الفيديوهات العامة (videos.list = وحدة واحدة من
  // حصة 10,000/يوم). لا يمنح نص الترجمات: captions.download يتطلب OAuth بحساب
  // مالك الفيديو ويعيد 403 لأي طرف ثالث — انظر server/youtubeApi.js.
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '',
  // قابل للتغيير كي توجّهه الاختبارات إلى خادم محلي (لا شبكة في الاختبارات)
  YOUTUBE_API_BASE: process.env.YOUTUBE_API_BASE || 'https://www.googleapis.com/youtube/v3',

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
  // نموذج التفريغ الصوتي. small هو الافتراضي — أدق بكثير من tiny على العربية والتركية.
  // للغات الأربع المستهدفة (ar/de/tr/en) يُنصح بـ small على الأقل عند توفر
  // الذاكرة: Xenova/whisper-tiny (39MB) < base (74MB) < small (244MB).
  // الإنجليزية والألمانية مقبولتان على base؛ العربية والتركية تحتاج small+.
  // الحجم الأكبر يحتاج ذاكرة/معالجة أكثر — عدّل عبر .env إن كان الجهاز ضعيفًا.
  WHISPER_MODEL: process.env.WHISPER_MODEL || 'Xenova/whisper-small',

  // محرك التفريغ الصوتي: 'sherpa' (أسرع بكثير، sherpa-onnx) أو 'transformers' (الاحتياطي Xenova)
  // إن لم يكن sherpa-onnx مثبتًا أو فشل تحميل نموذجه يعود audio.js تلقائيًا إلى 'transformers'
  STT_ENGINE: process.env.STT_ENGINE || 'sherpa',

  // حجم نموذج sherpa-onnx: tiny|base|small (الافتراضي tiny).
  // tiny (~75MB int8) سريع لكنه ضعيف على العربية/التركية؛ small (~244MB int8) أدق بكثير.
  // على أجهزة ذات ذاكرة محدودة، tiny أو base قد يكونان أفضل خيار.
  SHERPA_WHISPER_VARIANT: process.env.SHERPA_WHISPER_VARIANT || 'tiny',

  // نموذج sherpa-onnx: متعدد اللغات (يدعم 100+ لغة) من HuggingFace
  // المسارات قابلة للتعديل عبر المتغيرات؛ يُنزَّل النموذج تلقائيًا عند أول تشغيل ويُخزَّن محليًا
  // مجلد افتراضي يشمل حجم النموذج لتجنب تصادم ملفات tiny/base/small
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

  // ===== التخزين والمشاريع (P3) =====
  // مفاتيح لا مسارات: تغيير السائق إلى S3/R2 لا يمسّ أي مستدعٍ.
  // STORAGE_DRIVER: 'local' (الافتراضي) أو 's3' — سائق S3 يُنشئ عند الطلب
  // وب.vector env مفقود يسقط تلقائيًا للمحلي مع تحذير في السجل.
  STORAGE_DRIVER: process.env.STORAGE_DRIVER || 'local',
  STORAGE_DIR: process.env.STORAGE_DIR || path.join(__dirname, '..', 'cache', 'storage'),

  // ===== S3 / R2 / MinIO (سائق تخزين اختياري) =====
  // يُفعّل فقط عند STORAGE_DRIVER=s3. جميع المفاتيح اختيارية ما لم يكن
  // السائق s3 — في ذلك الحالة، يسقط تلقائيًا للتخزين المحلي مع تحذير.
  // S3_ENDPOINT: https://<acct>.r2.cloudflarestorage.com (R2)
  //              أو https://s3.amazonaws.com (AWS) أو http://localhost:9000 (MinIO)
  S3_ENDPOINT: process.env.S3_ENDPOINT || '',
  S3_REGION: process.env.S3_REGION || 'auto',   // R2/MinIO: 'auto' — AWS: 'us-east-1' مثلاً
  S3_BUCKET: process.env.S3_BUCKET || '',
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || '',
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || '',
  // S3_FORCE_PATH_STYLE: true لـ MinIO الذي لا يدعم virtual-hosted style
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE || 'false',
  // S3_PREFIX: بادئة اختيارية لكل مفتاح في السطل (مثل 'aralink/prod')
  S3_PREFIX: process.env.S3_PREFIX || '',
  // S3_PUBLIC_URL: رابط عام اختياري للوصول المباشر (CDN أو R2 public bucket)
  S3_PUBLIC_URL: process.env.S3_PUBLIC_URL || '',
  // قاعدة بيانات SQLite عبر node:sqlite المدمج (بلا تبعية ولا بناء أصلي —
  // وهو ما يهمّ هنا تحديدًا: الوحدات الأصلية سبق أن كسرت إقلاع صورة Docker).
  DB_FILE: process.env.DB_FILE || path.join(__dirname, '..', 'cache', 'aralink.db'),

  // ===== تخزين الإحصائيات: 'sqlite' (الافتراضي) أو 'json' =====
  // sqlite: جداول stats_entries و usage_counters في قاعدة البيانات العليا
  // (node:sqlite). json: الملفات القديمة stats-log.json و usage.json للتوافق.
  STATS_DRIVER: process.env.STATS_DRIVER || 'sqlite',

  // ===== محرك الوظائف (server/jobs) =====
  // سقف التزامن هو الحماية الحقيقية: العمل الثقيل مقيّد بالمعالج، وعشرة طلبات
  // متزامنة بلا سقف تستهلك الجهاز بالكامل. 2 افتراض محافظ يناسب نسخة واحدة.
  JOB_CONCURRENCY: Number(process.env.JOB_CONCURRENCY) || 2,
  JOB_MAX_QUEUED: Number(process.env.JOB_MAX_QUEUED) || 50, // رفض صريح بدل نموّ ذاكرة
  JOB_TTL_MS: Number(process.env.JOB_TTL_MS) || 3600000, // بقاء نتيجة الوظيفة ساعة
  // سائق الطابور: 'memory' (افتراضي) أو 'redis' مستقبلاً — مهما كان غير معروف
  // يُواصل التشغيل على الذاكرة مع تحذير في السجل (لا إقلاع Crashes).
  QUEUE_DRIVER: process.env.QUEUE_DRIVER || 'memory',

  // ===== فيديو محلي: أقصى مدة بالدقائق (الافتراضي 5 — STT بطيء ~5.5x المدة على هذا الجهاز) =====
  LOCAL_VIDEO_MAX_MIN: Number(process.env.LOCAL_VIDEO_MAX_MIN) || 5,

  // ===== فيديو يوتيوب (بثّ): أقصى حجم للملف المُنزَّل (بايت — الافتراضي 1GB) =====
  // يمنع استنزاف القرص والنطاق عبر معرفات فيديو طويلة (أفلام مُعاينة 720p تتجاوز 1GB).
  // `--max-filesize` في yt-dlp يقطع التنزيل مبكرًا، والفحص بعد التنزيل يشمل أيضًا
  // الملفات التي وصلت قبل ضبط هذا الحد أو من مسارات أخرى.
  MAX_VIDEO_BYTES: Number(process.env.MAX_VIDEO_BYTES) || 1073741824,

  // ===== محرك النطق: 'edge' (أصوات عصبية ذكر/أنثى) أو 'gtts' (احتياطي مجاني) =====
  // Edge هو الافتراضي؛ أي فشل فيه يعود تلقائيًا إلى gTTS للمقطع نفسه
  // (قاطع دائرة 10 دقائق يمنع إضاعة المهلات عند تعطّل الخدمة).
  TTS_ENGINE: process.env.TTS_ENGINE || 'edge',

  // ===== مشاريع الدبلجة: مدة الاحتفاظ بالأيام (الافتراضي 7) وحجم أقصى للقرص =====
  // 3GB لا 5GB (§20): قرص Render في render.yaml خمسة غيغابايت **يتقاسمه**
  // projects/ مع cache/ (قاعدة SQLite وملفات التخزين). سقفٌ مساوٍ لحجم القرص
  // كله يعني أن التنظيف لا يبدأ إلا والقرص ممتلئ فعلًا — أي بعد فوات الأوان.
  PROJECTS_RETENTION_DAYS: Number(process.env.PROJECTS_RETENTION_DAYS) || 7,
  PROJECTS_MAX_BYTES: Number(process.env.PROJECTS_MAX_BYTES) || 3221225472,

  // ===== سجل التكاليف: عدد مقاطع TTS، حروف الترجمة، ثوانٍ ffmpeg =====
  COST_FILE: process.env.COST_FILE || path.join(__dirname, '..', 'cache', 'cost.json'),
};
