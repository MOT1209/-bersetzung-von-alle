#!/usr/bin/env node
// scripts/demo-studio.js — تشغيل الاستوديو للعرض بلا ffmpeg وبلا شبكة
//
// لماذا: المسار الحقيقي يحتاج ffmpeg (لاستخراج الصوت) ونماذج تفريغ ثم شبكة
// للترجمة. على جهاز بلا ffmpeg أو بلا إنترنت لا يمكن رؤية الواجهة تعمل إطلاقًا،
// فيبدو المشروع معطّلًا وهو سليم.
//
// ⚠️ ما يُزيَّف هنا **خطوتان فقط**:
//     1) التفريغ الصوتي (يحتاج ffmpeg + نموذجًا)
//     2) الترجمة (تحتاج شبكة)
// وكل ما عداهما حقيقي تمامًا: الرفع، والتخزين على القرص، وقاعدة البيانات،
// وطابور الوظائف، وبثّ التقدّم، وبناء ملفي SRT وVTT، والتنزيل، وحذف المشروع.
//
// الاستخدام:  npm run demo:studio   ثم افتح العنوان المطبوع.
const os = require('os');
const path = require('path');
const fs = require('fs');

// عزل كامل عن بيانات المشروع الحقيقية — مجلد مؤقت لكل تشغيل
const demoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-demo-'));
process.env.DB_FILE = path.join(demoDir, 'demo.db');
process.env.STORAGE_DIR = path.join(demoDir, 'storage');
process.env.CACHE_FILE = path.join(demoDir, 'cache.json');
process.env.PORT = process.env.PORT || '3900';

const audio = require('../server/audio');
const translateRoutes = require('../server/routes-translate');

// 1) تفريغ مزيّف: مقاطع موقّتة تشبه مخرَج whisper الحقيقي
audio.transcribeMediaFile = async () => {
  await new Promise((r) => setTimeout(r, 1200)); // إبطاء متعمّد ليُرى شريط التقدّم
  return {
    chunks: [
      { start: 0, duration: 3.5, text: 'Welcome to this lesson about clean architecture.' },
      { start: 3.5, duration: 4, text: 'We will start with the provider layer.' },
      { start: 7.5, duration: 3.5, text: 'Then we will add a job queue.' },
      { start: 11, duration: 4, text: 'Finally we will store everything in a database.' },
    ],
  };
};

// 2) ترجمة مزيّفة: قاموس صغير ثابت (لا شبكة)
const DEMO = {
  'Welcome to this lesson about clean architecture.': 'أهلًا بك في هذا الدرس عن المعمارية النظيفة.',
  'We will start with the provider layer.': 'سنبدأ بطبقة المزوّدين.',
  'Then we will add a job queue.': 'ثم نضيف طابور وظائف.',
  'Finally we will store everything in a database.': 'وأخيرًا نحفظ كل شيء في قاعدة بيانات.',
};
translateRoutes.translateLines = async (lines, targetLang) => {
  await new Promise((r) => setTimeout(r, 900));
  return {
    sourceLang: 'en',
    captions: lines.map((l) => ({ ...l, translated: DEMO[l.original] || `[${targetLang}] ${l.original}` })),
    cached: false,
  };
};

const app = require('../server/server');
const server = app.listen(Number(process.env.PORT), () => {
  const { port } = server.address();
  console.log('');
  console.log('  🎬 عرض الاستوديو جاهز:  http://localhost:' + port + '/studio.html');
  console.log('');
  console.log('  ارفع أي ملف (أي ملف يعمل — التفريغ مزيّف في هذا العرض)');
  console.log('  التفريغ والترجمة مزيّفان؛ الرفع والتخزين والقاعدة والطابور');
  console.log('  والتقدّم وملفا SRT/VTT والتنزيل كلها حقيقية.');
  console.log('');
  console.log('  بيانات العرض المؤقتة: ' + demoDir);
  console.log('');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    try { fs.rmSync(demoDir, { recursive: true, force: true }); } catch { /* تنظيف */ }
    process.exit(0);
  });
}
