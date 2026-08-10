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

// ===== مسارات الترجمة =====
app.use('/api', translateRouter);

// ===== مسارات تحويل النص إلى صوت =====
app.use('/api', ttsRouter);

// ===== مسارات بثّ الفيديو (الترجمات المدمجة) =====
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
