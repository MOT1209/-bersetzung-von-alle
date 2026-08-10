// tests/extractionRules.test.js — اختبارات قواعد الاستخراج المخصصة
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ملف قواعد مؤقت — لا نلمس cache/extraction-rules.json الحقيقي أبدًا
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-rules-'));
process.env.RULES_FILE = path.join(tmpDir, 'rules.json');

const { getRules, getRuleForUrl, addRule, removeRule, validateRule } = require('../server/extractionRules');
const { extractWithSelectors } = require('../server/fetchContent');

before(async () => {
  await removeRule('*'); // تنظيف (لا يضيف شيئًا إن لم توجد قواعد)
});
after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const SAMPLE_HTML = `
<html><head><title>العنوان الكامل</title></head><body>
  <nav>شريط التنقل — لا يهم</nav>
  <div class="news-item">
    <h1>عنوان الخبر الأول</h1>
    <p>فقرة الخبر الأولى تتحدث عن موضوع مهم جدًا.</p>
    <p>فقرة ثانية لاختبار الاستخراج من محدد مخصص.</p>
  </div>
  <aside>إعلان مزعج يجب تجاهله</aside>
</body></html>`;

test('validateRule: يقبل قاعدة صالحة', () => {
  const r = validateRule({ domain: 'news.example.com', titleSelector: 'h1', contentSelectors: ['.news-item'] });
  assert.ok(r);
  assert.equal(r.domain, 'news.example.com');
});

test('validateRule: يرفض النطاقات غير الصالحة والمحددات الخطرة', () => {
  assert.equal(validateRule({ domain: 'not a domain' }), null);
  assert.equal(validateRule({ domain: 'http://example.com' }), null);
  assert.equal(validateRule({ domain: 'example.com', contentSelectors: ['div[onload=alert(1)]'] }), null);
  assert.equal(validateRule({ domain: 'example.com', titleSelector: 'h1{color:red}' }), null);
  assert.equal(validateRule({}), null);
});

test('addRule + getRules: الإضافة والتحديث والحفظ', async () => {
  const res = await addRule({ domain: 'news.example.com', titleSelector: 'h1', contentSelectors: ['.news-item'] });
  assert.equal(res.ok, true);
  const rules = await getRules();
  assert.ok(rules.some((r) => r.domain === 'news.example.com'));
  // تحديث نفس النطاق لا يضاعف القاعدة
  await addRule({ domain: 'news.example.com', titleSelector: 'h2', contentSelectors: ['article'] });
  const after2 = await getRules();
  assert.equal(after2.filter((r) => r.domain === 'news.example.com').length, 1);
});

test('getRuleForUrl: تطابق النطاق والفرعي (أطول أولاً)', async () => {
  await addRule({ domain: 'example.com', titleSelector: 'h1', contentSelectors: ['article'] });
  await addRule({ domain: 'news.example.com', titleSelector: 'h1', contentSelectors: ['.news-item'] });
  const r1 = await getRuleForUrl('https://news.example.com/story/1');
  assert.equal(r1.domain, 'news.example.com'); // الأطول يفوز
  const r2 = await getRuleForUrl('https://example.com/page');
  assert.equal(r2.domain, 'example.com');
  const r3 = await getRuleForUrl('https://other.org/');
  assert.equal(r3, null);
});

test('extractWithSelectors: يستخرج العنوان والكتل من المحدد المخصص', () => {
  const { title, blocks } = extractWithSelectors(SAMPLE_HTML, {
    titleSelector: 'h1',
    contentSelectors: ['.news-item'],
  });
  assert.equal(title, 'عنوان الخبر الأول');
  assert.ok(blocks.some((b) => b.type === 'heading' && b.content.includes('عنوان الخبر')));
  assert.ok(blocks.some((b) => b.content.includes('فقرة الخبر الأولى')));
  assert.ok(blocks.some((b) => b.content.includes('فقرة ثانية')));
  // لا نستخرج من nav أو aside
  assert.ok(!blocks.some((b) => b.content.includes('شريط التنقل')));
  assert.ok(!blocks.some((b) => b.content.includes('إعلان مزعج')));
});

test('extractWithSelectors: محدد بلا تطابق يرمي content-empty', () => {
  assert.throws(
    () => extractWithSelectors('<html><body><p>x</p></body></html>', { titleSelector: 'h1', contentSelectors: ['.missing'] }),
    (e) => e.code === 'content-empty'
  );
});

test('removeRule: حذف قاعدة بالدومين', async () => {
  const res = await removeRule('news.example.com');
  assert.equal(res.ok, true);
  const rules = await getRules();
  assert.ok(!rules.some((r) => r.domain === 'news.example.com'));
});
