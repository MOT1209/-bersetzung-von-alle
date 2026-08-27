// tests/provider.test.js — اختبارات سجل المزوّدين الموحّد (task-01)
// بلا شبكة نهائيًا: خوادم stub محلية (http.createServer على 127.0.0.1:0)
// تُنشأ أولاً ثم نضبط env ثم نستورد config/translate (config يقرأ env وقت الاستيراد).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { once } = require('node:events');

// ===== خوادم stub محلية =====
// تسجّل كل طلب وارد للتحقق لاحقًا من الرؤوس والجسم
const deeplRequests = [];
const zenRequests = [];
let deeplServer;
let zenServer;
let translate; // يُملأ في before بعد ضبط env (يُستورد config/translate بعدها)

before(async () => {
  // 1) أنشئ الخوادم أولاً (المنفذ معروف بعد listen فقط)
  deeplServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      deeplRequests.push({ url: req.url, headers: req.headers, body: body ? JSON.parse(body) : {} });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ translations: [{ text: 'translated' }] }));
    });
  });
  zenServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      zenRequests.push({ url: req.url, headers: req.headers, body: body ? JSON.parse(body) : {} });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: 'الترجمة' } }] }));
    });
  });
  await new Promise((r) => deeplServer.listen(0, '127.0.0.1', r));
  await new Promise((r) => zenServer.listen(0, '127.0.0.1', r));

  // 2) ضبط env قبل أي استيراد — config.js يقرأ env وقت الاستيراد
  process.env.DEEPL_API_KEY = 'test-key';
  process.env.DEEPL_URL = `http://127.0.0.1:${deeplServer.address().port}`;
  process.env.ZEN_BASE_URL = `http://127.0.0.1:${zenServer.address().port}`;
  process.env.ZEN_API_KEY = 'test-zen-key'; // zen يتطلب مفتاحًا للتوفر
  process.env.ZEN_MODEL = 'test-model';
  process.env.PROVIDER_ORDER = ''; // نبدأ بترتيب افتراضي نظيف
  process.env.GEMINI_API_KEY = ''; // لا نفعّل gemini في الاختبارات (يحتاج شبكة)

  // 3) استيراد بعد ضبط env (dotenv لا يلغي القيم الموجودة مسبقًا)
  translate = require('../server/translate');
});

after(async () => {
  for (const s of [deeplServer, zenServer]) {
    if (s) await new Promise((r) => s.close(r));
  }
});

// ===== 1) السجل الأساسي =====
test('سجل المزوّدين: يعيد 6 مزوّدات و getProvider يعمل', () => {
  const ids = translate.getProviders().map((p) => p.id);
  assert.deepEqual(ids, ['google', 'mymemory', 'libre', 'gemini', 'deepl', 'zen']);
  assert.ok(translate.getProvider('google'), 'يجب أن يوجد google');
  assert.equal(translate.getProvider('unknown'), undefined);
  // getProviders يعيد نسخة — التعديل عليها لا يؤثر على السجل
  const copy = translate.getProviders();
  copy.length = 0;
  assert.equal(translate.getProviders().length, 6);
});

// ===== 2) التوافر =====
test('isAvailable: الأساسيون متاحون دائمًا والاختياريون حسب الإعدادات', () => {
  const avail = translate.getAvailableProviders().map((p) => p.id);
  assert.ok(avail.includes('google'));
  assert.ok(avail.includes('mymemory'));
  assert.ok(avail.includes('libre'));
  // deepl/zen مفعّلان في هذه العملية (env مضبوط قبل الاستيراد)
  assert.equal(translate.getProvider('deepl').isAvailable(), true);
  assert.equal(translate.getProvider('zen').isAvailable(), true);
  // gemini غير متاح (المفتاح فارغ) — يحتاج شبكة حقيقية
  assert.equal(translate.getProvider('gemini').isAvailable(), false);
  assert.equal(translate.getProvider('gemini').requiresKey, true);
});

// ===== 3) الترتيب الافتراضي =====
test('resolveProviders: الترتيب الافتراضي يبدأ بـ google ويتخطى غير المتوفر', () => {
  const order = translate.resolveProviders();
  assert.equal(order[0].id, 'google');
  assert.ok(order.every((p) => p.isAvailable()), 'كل المزوّدين في السلسلة متاحون');
  assert.ok(order.some((p) => p.id === 'deepl'));
  assert.ok(order.some((p) => p.id === 'zen'));
});

// ===== 4) فرض مزوّد واحد =====
test('resolveProviders: فرض مزوّد واحد عبر opts.provider', () => {
  const order = translate.resolveProviders({ provider: 'deepl' });
  assert.deepEqual(order.map((p) => p.id), ['deepl']);
});

// ===== 5) ترجمة فعلية عبر DeepL (stub) =====
test('مزوّد DeepL: ترجمة عبر stub مع رأس DeepL-Auth-Key و target_lang=AR', async () => {
  // نص فريد لتفادي اصطدام الكاش الملّفي (الترجمة تصل للشبكة حتمًا)
  const start = deeplRequests.length;
  const text = 'deepl stub check ' + Date.now();
  const out = await translate.translateText(text, 'ar', 'en', { provider: 'deepl' });
  assert.equal(out, 'translated');
  assert.equal(deeplRequests.length - start, 1, 'يجب أن يصل طلب واحد بالضبط للـ stub');
  const req = deeplRequests[deeplRequests.length - 1];
  assert.equal(req.url, '/v2/translate');
  assert.equal(req.headers.authorization, 'DeepL-Auth-Key test-key');
  assert.equal(req.body.target_lang, 'AR');
  assert.equal(req.body.source_lang, 'EN'); // مصدر محدد → يُحوَّل لأحرف كبيرة
  assert.equal(req.body.text[0], text);
});

// ===== 6) ترجمة فعلية عبر zen (متوافق OpenAI) — stub =====
test('مزوّد zen: ترجمة عبر stub مع model=test-model', async () => {
  const start = zenRequests.length;
  const text = 'zen stub check ' + Date.now();
  const out = await translate.translateText(text, 'ar', 'en', { provider: 'zen' });
  assert.equal(out, 'الترجمة');
  assert.equal(zenRequests.length - start, 1, 'يجب أن يصل طلب واحد بالضبط للـ stub');
  const req = zenRequests[zenRequests.length - 1];
  assert.equal(req.url, '/chat/completions');
  assert.equal(req.body.model, 'test-model');
  assert.equal(req.body.messages[0].role, 'user');
  assert.ok(String(req.body.messages[0].content).includes('Translate the following text to ar'));
});

// ===== 7) ترتيب مخصص عبر opts.providers =====
test('resolveProviders: ترتيب مخصص عبر opts.providers يبدأ من zen', async () => {
  const start = zenRequests.length;
  const text = 'order check ' + Date.now();
  const out = await translate.translateText(text, 'ar', 'en', { providers: ['zen', 'google'] });
  // zen (الـ stub) ينجح فلا نصل أبدًا إلى google
  assert.equal(out, 'الترجمة');
  assert.equal(zenRequests.length - start, 1, 'يجب أن يصل طلب واحد فقط للـ stub');
});

// ===== 8) نقطة API /api/providers =====
test('GET /api/providers: يعيد المزوّدات مع available', async () => {
  const app = require('../server/server');
  const server = app.listen(0);
  await once(server, 'listening');
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const res = await fetch(`${baseUrl}/api/providers`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.providers));
    const ids = body.providers.map((p) => p.id);
    assert.ok(ids.includes('google'));
    assert.ok(ids.includes('deepl'));
    assert.ok(ids.includes('zen'));
    const google = body.providers.find((p) => p.id === 'google');
    assert.equal(google.available, true);
    assert.equal(google.requiresKey, false);
    assert.ok(Array.isArray(body.defaultOrder));
  } finally {
    await new Promise((r) => server.close(r));
  }
});
