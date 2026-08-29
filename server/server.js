// server/server.js — الخادم الرئيسي لأداة الترجمة AraLink
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { createStore, closeAll: closeStore } = require('./store');
const translateRouter = require('./routes-translate');
const ttsRouter = require('./routes-tts');
const videoRouter = require('./routes-video');
const settingsRouter = require('./routes-settings'); // إعدادات المفاتيح (.env) — محمي بـ ADMIN_TOKEN
const statsRouter = require('./routes-stats'); // إحصائيات لوحة التحكم — محمية بـ ADMIN_TOKEN
const { getAllLanguages } = require('./languages');

const app = express();

// trust proxy: في الإنتاج فقط (خلف بروكسي Render) حتى يعكس req.ip عنوان الزائر الحقيقي
// ويبقى حد الطلبات لكل IP فعّالًا. محليًا يبقى معطّلًا فيُستخدم عنوان المقبس الحقيقي.
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

// ===== وسيطات عامة =====
// CORS allowlist (CORS_ORIGIN in .env). Empty = same-origin only:
// no Origin header -> pass through without CORS headers; allowed origin or '*' -> reflected; others rejected.
function corsOrigin(origin, callback) {
  const allowed = (config.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin) return callback(null, false); // no Origin header -> pass through without CORS headers
  callback(null, allowed.includes('*') || allowed.includes(origin));
}
app.use(cors({ origin: corsOrigin }));

// ===== ترويسات الأمان (helmet) =====
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ['\'self\''],
      scriptSrc: ['\'self\'', 'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://cdn.jsdelivr.net'],
      styleSrc: ['\'self\'', '\'unsafe-inline\'', 'https://fonts.googleapis.com'],
      fontSrc: ['\'self\'', 'https://fonts.gstatic.com'],
      imgSrc: ['\'self\'', 'data:', 'blob:'],
      mediaSrc: ['\'self\'', 'blob:', 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
      frameSrc: ['\'self\'', 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
      connectSrc: ['\'self\''],
    },
  },
}));

// ===== مفتاح API اختياري للطلاب (ARALINK_API_KEY في .env) =====
// إن ضُبط: الطلبات التي تحمل المفتاح الصحيح تحصل على حد أعلى (×3)
// إن لم يُضبط: الخدمة مفتوحة بحد عام واحد (الوضع الحالي — مناسب للمضيافات المجانية)
const ARALINK_API_KEY = process.env.ARALINK_API_KEY || '';
let warnedApiKeyInQuery = false; // تحذير لمرة واحدة فقط دون كشف قيمة المفتاح
function isApiKeyValid(req) {
  if (!ARALINK_API_KEY) return false;
  // الأمان: المفتاح يُقبل من ترويسة x-api-key فقط؛ أي api_key في مسار query
  // يُتجاهل ولا يُعتدّ به كمصادقة لأنه يظهر في سجلات الخادم وسجل المتصفح وReferrer.
  if (req.query && req.query.api_key !== undefined && !warnedApiKeyInQuery) {
    warnedApiKeyInQuery = true;
    console.warn('[api-key] request used disallowed ?api_key= query param — header x-api-key only.');
  }
  const k = req.headers['x-api-key'];
  return typeof k === 'string' && k === ARALINK_API_KEY;
}

// ===== حد الطلبات =====
// يمنع استنزاف حصص الترجمة المجانية عبر إساءة استخدام واجهة API.
// العدّادات تمرّ عبر server/store.js: ذاكرة داخل العملية افتراضيًا، أو Redis
// مشترك عند ضبط REDIS_URL (لازم عند تشغيل أكثر من نسخة خادم). فشل المتجر
// = سقوط تلقائي للذاكرة + السماح بالطلب (fail-open) فلا ينهار الخادم.
function createRateLimiter({ windowMs, max, keyedMultiplier = 3 }) {
  const store = createStore();

  return async (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const limit = isApiKeyValid(req) ? max * keyedMultiplier : max;
    try {
      const { count, resetAt } = await store.incr(ip, windowMs);
      if (count > limit) {
        res.setHeader('Retry-After', Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)));
        return res.status(429).json({ error: 'rate-limited' });
      }
    } catch (e) {
      console.error('[rate-limit] store error — allowing request:', e && e.message);
    }
    next();
  };
}

const translateLimiter = createRateLimiter({ windowMs: config.RATE_LIMIT_WINDOW_MS, max: config.RATE_LIMIT_MAX });
const heavyLimiter = createRateLimiter({ windowMs: config.RATE_LIMIT_WINDOW_MS, max: config.RATE_LIMIT_MAX_HEAVY });

// ===== خط الأساس: حد طلبات يغطي /api كاملًا =====
// مهم: Express يطابق app.use على حدود المقاطع، لذا '/api/translate' لا يغطي
// '/api/translate-smart'. هذا الأساس يغطي كل مسار تحت /api بلا استثناء،
// والحدود الأشد أدناه تُركَّب فوقه (كلاهما يُحتسب).
app.use('/api', translateLimiter);

// مسارات الملفات (استيراد/تصدير) — قبل express.json العام لأن لها حد جسم 15mb خاصًا بها،
// وبعد خط الأساس أعلاه حتى لا تفلت من حد الطلبات.
app.use('/api/translate-file', heavyLimiter);
app.use('/api/export', heavyLimiter);
app.use('/api', require('./routes-file'));

// الفيديو المحلي — قبل express.json العام أيضًا: جسمه base64 يصل 60mb، وحدّ الـ2mb
// العام كان يرفضه قبل بلوغ المعالج، فيبقى MAX_BASE64=40MB كودًا ميتًا والميزة
// مقيّدة عمليًا بـ2mb.
app.use('/api/video-local', heavyLimiter);
app.use('/api', require('./routes-local-video'));

app.use(express.json({ limit: '2mb' }));

// ===== بثّ الترجمة عبر SSE — قبل compression عمدًا =====
// الموضع ليس اعتباطيًا: يحتاج req.body (بعد express.json)، ويجب أن يسبق
// compression لأن 'text/event-stream' نوع قابل للضغط، فيخزّن الضاغط الأحداث
// مؤقتًا وتصل الترجمة دفعة واحدة في النهاية — أي يعمل الطلب ويضيع البثّ صامتًا.
// حد الطلبات مغطّى بخط الأساس على '/api' أعلاه (مطابق لـ /api/translate).
app.use('/api', require('./routes-sse'));

// ===== ضغط الاستجابات (يقلل حجم HTML/CSS/JS/JSON 60-80%) =====
app.use(compression());

// ===== الملفات الثابتة (الواجهة فقط — لا يُنشر جذر المشروع) =====
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// ===== فحص الصحة =====
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'aralink', time: new Date().toISOString() });
});

// ===== قائمة اللغات المدعومة =====
app.get('/api/languages', (req, res) => {
  res.json({ languages: getAllLanguages() });
});

// ===== إعدادات المفاتيح (قراءة/حفظ .env) — محمية بـ ADMIN_TOKEN =====
// الافتراضي الآمن: بلا ADMIN_TOKEN ⇒ المسار معطّل بالكامل (503).
// يشمل GET أيضًا لأنه يكشف hasGeminiKey — استطلاع مفيد للمهاجم.
// ملاحظة: ARALINK_API_KEY مفتاح حصص للطلاب ولا يصلح هنا — لا يجوز أن يمنح
// مفتاحُ حصةٍ صلاحيةَ الكتابة في .env.
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return res.status(503).json({ error: 'settings-disabled' });
  const given = req.get('x-admin-token') || '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // مقارنة ثابتة الزمن — timingSafeEqual يرمي عند اختلاف الطول، لذا نفحصه أولًا
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}
app.use('/api/settings', heavyLimiter, requireAdmin, settingsRouter);

// ===== إحصائيات لوحة التحكم (محمية بـ ADMIN_TOKEN + حد أثقل) =====
app.use('/api/stats', heavyLimiter, requireAdmin, statsRouter);

// ===== مسارات الترجمة (حد أساسي مطبّق أعلاه على /api كامل) =====
app.use('/api', translateRouter);

// ===== مسارات تحويل النص إلى صوت (حد أثقل — طلبات مكلفة) =====
app.use('/api/tts', heavyLimiter);
app.use('/api', ttsRouter);

// ===== الدبلجة (حدّ خاص أوسع — دفعات متتابعة طوال الفيديو لا طلب واحد) =====
app.use('/api/dub', createRateLimiter({ windowMs: config.RATE_LIMIT_WINDOW_MS, max: config.RATE_LIMIT_MAX_DUB }));
app.use('/api', require('./routes-dub'));

// ===== مسارات بثّ الفيديو (الترجمات المدمجة) =====
app.use('/api/video', heavyLimiter);
app.use('/api', videoRouter);

// ===== الموجة 2: تشكيل عربي + فيديو محلي + OCR (كلها تحت heavyLimiter — مكلفة) =====
app.use('/api/tashkeel', heavyLimiter);
app.use('/api', require('./routes-tashkeel'));
app.use('/api/ocr', heavyLimiter);
app.use('/api', require('./routes-ocr'));

// ===== معالجة الأخطاء العامة =====
app.use((err, req, res, _next) => {
  // أخطاء المحلل (body-parser) تحمل status/statusCode صحيحًا، وكان ابتلاعها في
  // 500 يخفي السبب الحقيقي: تجاوز الحجم كان يظهر «خطأ خادم» بدل 413.
  const status = err && (err.status || err.statusCode);
  if (status === 413) {
    return res.status(413).json({ error: 'input-too-large' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid-json' });
  }
  console.error('[server] unhandled:', err);
  res.status(500).json({ error: 'server-error' });
});

// ===== تشغيل الخادم =====
if (require.main === module) {
  const server = app.listen(config.PORT, () => {
    console.log(`🚀 AraLink يعمل على http://localhost:${config.PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ المنفذ ${config.PORT} مستخدم من تطبيق آخر.`);
      console.error('   جرّب منفذًا مختلفًا:  PORT=3999 npm run dev');
      process.exit(1);
    }
    throw err;
  });

  // إغلاق اتصال Redis المشترك (إن وُجد) عند الإيقاف — بلا Redis لا شيء يحدث
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { closeStore().catch(() => {}); });
  }
}

module.exports = app;
module.exports.createRateLimiter = createRateLimiter; // للاختبار المباشر (وحدة بلا شبكة)
module.exports.closeStore = closeStore;
