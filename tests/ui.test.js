// tests/ui.test.js — فحوصات ثابتة للواجهة (RTL + عناصر الميزات + PWA)
// استبدال عملي لاختبارات Playwright (بدون تثبيت متصفح على هذا الجهاز)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

test('الواجهة عربية RTL (dir="rtl" على html)', () => {
  assert.match(html, /<html[^>]*\bdir="rtl"/i);
});

test('الواجهة تحتوي كل عناصر الميزات الجديدة', () => {
  const ids = [
    'batch-input', 'batch-btn', 'batch-status', 'batch-results', // دفعات
    'compare-btn', // مقارنة
    'glossary-from', 'glossary-to', 'glossary-add-btn', 'glossary-list', // مسرد
    'rule-domain', 'rule-selector', 'rule-add-btn', 'rule-list', // قواعد استخراج
    'cap-panel', 'cap-panel-list', // لوحة يوتيوب
    'smart-btn', // ترجمة ذكية
    'settings-api-key', // مفتاح إدارة الإعدادات (ADMIN_TOKEN)
  ];
  for (const id of ids) {
    assert.ok(html.includes(`id="${id}"`), `عنصر مفقود: #${id}`);
  }
});

test('رابط PWA (manifest + أيقونة) موجود في head', () => {
  assert.match(html, /rel="manifest"/);
  assert.match(html, /apple-touch-icon/);
});

test('manifest.webmanifest JSON صالح و RTL', () => {
  const m = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.dir, 'rtl');
  assert.equal(m.lang, 'ar');
  assert.ok(Array.isArray(m.icons) && m.icons.length >= 1);
});

test('sw.js موجود ويسجل الواجهة في الكاش', () => {
  const sw = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
  assert.match(sw, /style\.css/);
  assert.match(sw, /js\/app\.js/);
  assert.match(sw, /CACHE/);
});

test('style.css يحتوي أنماط الميزات والجوال', () => {
  const css = fs.readFileSync(path.join(publicDir, 'style.css'), 'utf8');
  assert.match(css, /compare-wrap/);
  assert.match(css, /cap-item/);
  assert.match(css, /glossary-item/);
  assert.match(css, /375px/);
});

test('إضافة المتصفح: manifest صالح (MV3) مع popup و background', () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.ok(m.action && m.action.default_popup);
  assert.ok(m.background && m.background.service_worker);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'extension', 'background.js')));
});
