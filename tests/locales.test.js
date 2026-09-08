// tests/locales.test.js — تكامل: القواميس النموذجية + واجهة الاستيراد + RTL
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

process.env.RATE_LIMIT_MAX = '10000';
process.env.RATE_LIMIT_MAX_HEAVY = '10000';
process.env.CACHE_FILE = path.join(require('node:os').tmpdir(), 'aralink-test-locales-' + Date.now() + '.json');

const app = require('../server/server');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
});

const publicDir = path.join(__dirname, '..', 'public');

/* ===== القواميس النموذجية: JSON صالح بمفاتيح lowercase وقيم نصية ===== */
for (const file of ['en.json', 'ar.json']) {
  test(`locales/${file}: JSON صالح بمفاتيح lowercase وقيم نصية`, () => {
    const raw = fs.readFileSync(path.join(publicDir, 'locales', file), 'utf8');
    const dict = JSON.parse(raw);
    assert.equal(typeof dict, 'object');
    const keys = Object.keys(dict);
    assert.ok(keys.length >= 50, `${file} يحتوي ${keys.length} مدخلة فقط — القاموس النموذجي يجب أن يكون مفيدًا`);
    for (const [k, v] of Object.entries(dict)) {
      assert.equal(typeof v, 'string', `قيمة "${k}" ليست نصًا`);
      assert.ok(v.trim(), `قيمة "${k}" فارغة`);
      assert.equal(k, k.toLowerCase(), `المفتاح "${k}" ليس lowercase`);
    }
  });
}

test('locales/en.json: حالة القبول — hello و world موجودان', () => {
  const dict = JSON.parse(fs.readFileSync(path.join(publicDir, 'locales', 'en.json'), 'utf8'));
  assert.equal(dict.hello, 'مرحبا');
  assert.equal(dict.world, 'عالم');
});

/* ===== الخادم يخدم القواميس عبر HTTP ===== */
test('GET /locales/en.json و /locales/ar.json يُخدمان', async () => {
  for (const f of ['en.json', 'ar.json']) {
    const res = await fetch(`${baseUrl}/locales/${f}`);
    assert.equal(res.status, 200, `/locales/${f} لا يُخدَم`);
    assert.match(res.headers.get('content-type') || '', /json/);
    const dict = await res.json();
    assert.ok(Object.keys(dict).length >= 50);
  }
});

/* ===== واجهة الاستيراد: العناصر موجودة في الصفحة ===== */
test('index.html يحتوي عناصر استيراد القاموس', () => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  for (const id of ['glossary-import-btn', 'glossary-import-input', 'glossary-import-status', 'glossary-load-en', 'glossary-load-ar']) {
    assert.ok(html.includes(`id="${id}"`), `عنصر مفقود: #${id}`);
  }
});

/* ===== CSS: قواعد الاتجاه + حالة الاستيراد ===== */
test('style.css يحتوي قواعد RTL/LTR للفقرات وحالة الاستيراد', () => {
  const css = fs.readFileSync(path.join(publicDir, 'style.css'), 'utf8');
  assert.match(css, /\.blk\[dir='rtl'\]/);
  assert.match(css, /\.blk\[dir='ltr'\]/);
  assert.match(css, /unicode-bidi:\s*embed/);
  assert.match(css, /glossary-import-status/);
});

/* ===== المحرك يعمل مع القاموس النموذجي الفعلي (تكامل end-to-end صغير) ===== */
test('المحرك يترجم Hello, world! بالقاموس النموذجي الفعلي', async () => {
  const { translateWithDictionary } = await import('../public/js/localEngine.mjs');
  const dict = JSON.parse(fs.readFileSync(path.join(publicDir, 'locales', 'en.json'), 'utf8'));
  assert.equal(translateWithDictionary('Hello, world!', dict), 'مرحبا, عالم!');
  assert.equal(translateWithDictionary('HELLO', dict), 'مرحبا');
});
