// tests/middlewareOrder.test.js — ترتيب الوسائط محروس ببنية لا بتعليق (دين §8.5)
//
// ترتيب app.use في server.js يحمل ثلاثة شروط صامتة، كسرُ أيٍّ منها لا يُسقط أي
// اختبار بل يعطّل ميزة بهدوء:
//   1) مسارات SSE قبل compression — وإلا خزّن الضاغط الأحداث ووصلت دفعة واحدة
//      في النهاية: الطلب «ينجح» والبثّ يضيع.
//   2) مسارات الملفات/الفيديو قبل express.json العام — وإلا رفض حدّ 2mb أجسامها
//      base64 الكبيرة قبل بلوغ المعالج.
//   3) express.static بعد compression — وإلا خرجت الأصول الثابتة بلا ضغط.
// كانت هذه الشروط محروسة بتعليقات فقط. هنا تصير تأكيدًا يفشل عند أي إعادة ترتيب.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const SERVER = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');

// موضع أول ظهور لسطر تركيب الوسيط في الملف المصدر
function at(pattern) {
  const i = SERVER.search(pattern);
  assert.notEqual(i, -1, `لم يُعثر على الوسيط: ${pattern}`);
  return i;
}

const posJson = () => at(/app\.use\(express\.json\(\{ limit: '2mb' \}\)\)/);
const posCompression = () => at(/app\.use\(compression\(\)\)/);
const posStatic = () => at(/app\.use\(express\.static\(publicDir\)\)/);
const posSse = () => at(/require\('\.\/routes-sse'\)/);
const posJobs = () => at(/require\('\.\/routes-jobs'\)/);
const posYoutubeDub = () => at(/require\('\.\/routes-youtube-dub'\)/);
const posFile = () => at(/require\('\.\/routes-file'\)/);
const posLocalVideo = () => at(/require\('\.\/routes-local-video'\)/);

test('بثّ SSE (الترجمة والوظائف) مركَّب قبل compression', () => {
  assert.ok(posSse() < posCompression(), 'routes-sse بعد compression — سيُخزَّن البثّ ويصل دفعة واحدة');
  assert.ok(posJobs() < posCompression(), 'routes-jobs بعد compression — بثّ تقدّم الوظائف سيتعطّل صامتًا');
  // دبلجة يوتيوب (أُضيفت على main بالتوازي) تبثّ التقدّم بـSSE أيضًا — نفس الشرط
  assert.ok(posYoutubeDub() < posCompression(), 'routes-youtube-dub بعد compression — بثّ تقدّم الدبلجة سيتعطّل صامتًا');
});

test('بثّ SSE مركَّب بعد express.json (يحتاج req.body)', () => {
  assert.ok(posJson() < posSse(), 'routes-sse قبل express.json — req.body سيكون فارغًا');
});

test('مسارات الملفات والفيديو المحلي قبل express.json العام (أجسام base64 كبيرة)', () => {
  assert.ok(posFile() < posJson(), 'routes-file بعد json العام — حدّ 2mb سيرفض الملفات');
  assert.ok(posLocalVideo() < posJson(), 'routes-local-video بعد json العام — حدّ 2mb سيرفض الفيديو');
});

test('الملفات الثابتة بعد compression (وإلا خرجت بلا ضغط)', () => {
  assert.ok(posCompression() < posStatic(), 'express.static قبل compression — الأصول ستخرج بلا ضغط');
});

test('حدّ الطلبات الأساسي على /api مركَّب قبل كل الموجّهات', () => {
  const limiter = at(/app\.use\('\/api', translateLimiter\)/);
  assert.ok(limiter < posFile(), 'موجّه ملفات قبل حدّ الطلبات — يفلت من الحد');
  assert.ok(limiter < posSse(), 'موجّه SSE قبل حدّ الطلبات — يفلت من الحد');
});
