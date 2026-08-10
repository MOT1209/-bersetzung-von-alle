// server/server.js — الخادم الرئيسي لأداة الترجمة AraLink
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const translateRouter = require('./routes-translate');
const ttsRouter = require('./routes-tts');
const videoRouter = require('./routes-video');
const { getAllLanguages } = require('./languages');

const app = express();

// ===== وسيطات عامة =====
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ===== حد الطلبات البسيط (في الذاكرة — بدون مكتبات خارجية) =====
// يمنع استنزاف حصص الترجمة المجانية عبر إساءة استخدام واجهة API
function createRateLimiter({ windowMs, max }) {
  const hits = new Map(); // ip → { count, resetAt }
  // تنظيف دوري للإدخالات المنتهية (unref حتى لا يمنع إغلاق العملية)
  setInterval(() => {
    const now = Date.now();
    for (const [ip, h] of hits) {
      if (h.resetAt < now) hits.delete(ip);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let h = hits.get(ip);
    if (!h || h.resetAt < now) {
      h = { count: 0, resetAt: now + windowMs };
      hits.set(ip, h);
    }
    h.count++;
    if (h.count > max) {
      res.setHeader('Retry-After', Math.ceil((h.resetAt - now) / 1000));
      return res.status(429).json({ error: 'rate-limited' });
    }
    next();
  };
}

const translateLimiter = createRateLimiter({ windowMs: config.RATE_LIMIT_WINDOW_MS, max: config.RATE_LIMIT_MAX });
const heavyLimiter = createRateLimiter({ windowMs: config.RATE_LIMIT_WINDOW_MS, max: config.RATE_LIMIT_MAX_HEAVY });

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

// ===== مسارات الترجمة (مع حد طلبات) =====
app.use('/api/translate', translateLimiter);
app.use('/api/translate-text', translateLimiter);
app.use('/api', translateRouter);

// ===== مسارات تحويل النص إلى صوت (حد أثقل — طلبات مكلفة) =====
app.use('/api/tts', heavyLimiter);
app.use('/api', ttsRouter);

// ===== مسارات بثّ الفيديو (الترجمات المدمجة) =====
app.use('/api/video', heavyLimiter);
app.use('/api', videoRouter);

// ===== معالجة الأخطاء العامة =====
app.use((err, req, res, next) => {
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
      console.error(`   جرّب منفذًا مختلفًا:  PORT=3999 npm run dev`);
      process.exit(1);
    }
    throw err;
  });
}

module.exports = app;
