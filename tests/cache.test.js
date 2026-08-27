// tests/cache.test.js — اختبارات كاش الترجمة (بحث في الذاكرة + كتابة مؤجلة على القرص)
// بلا شبكة: نكتب مباشرة في الكاش ثم نقرأ الملف بعد debounce.
// نُحفظ النسخة الأصلية للملف أولًا ونستعيدها في النهاية حتى لا تُلوَّث بالاختبار.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ملف كاش مؤقت خاص بهذا الاختبار — قبل require لـ cache.js.
// لا نلمس cache/translation-cache.json الحقيقي: ملفات الاختبار تعمل في عمليات
// متوازية، ولو تشاركت ملفًا واحدًا لمسح كلٌّ لقطةَ الآخر وفشلت عشوائيًا.
const os = require('os');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-cache-'));
const CACHE_FILE = path.join(tmpDir, 'translation-cache.json');
process.env.CACHE_FILE = CACHE_FILE;

const cache = require('../server/cache');

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // تنظيف فقط
  }
});

// نفس صيغة المفتاح الموجودة في server/cache.js
function cacheKey(text, sourceLang, targetLang) {
  return crypto.createHash('sha1').update(text + '|' + sourceLang + '|' + targetLang).digest('hex');
}

const LANG = { source: 'en', target: 'ar' };

// انتظار ظهور الكتابة على القرص بالاستقصاء لا بمهلة ثابتة.
// المهلة الثابتة (450ms) تتسابق مع debounce + الكتابة تحت الحمل، فتفشل عشوائيًا.
async function waitForDisk(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (predicate(last)) return last;
    } catch {
      // الملف قيد الاستبدال أو غير موجود بعد — أعد المحاولة
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('انتهت المهلة قبل ظهور الكتابة على القرص');
}

// ===== 1) get بعد set — بحث في الذاكرة فورًا =====

test('cache: set ثم get ترجع نفس الترجمة فورًا (بحث في الذاكرة بلا I/O)', () => {
  const text = 'hello-cache-memory-' + Date.now();
  cache.set(text, LANG.source, LANG.target, 'أهلا بالكاش');
  assert.equal(cache.get(text, LANG.source, LANG.target), 'أهلا بالكاش');
});

test('cache: get لنص غير مخزَّن يرجع null', () => {
  assert.equal(cache.get('not-cached-' + Date.now(), LANG.source, LANG.target), null);
});

// ===== 2) استمرار الكتابة على القرص بعد debounce =====

test('cache: بعد debounce تُكتب النسخة إلى الملف وتُقرأ منها', async () => {
  const text = 'persist-after-debounce-' + Date.now();
  const translated = 'النسخة المكتوبة على القرص';
  cache.set(text, LANG.source, LANG.target, translated);

  const k = cacheKey(text, LANG.source, LANG.target);
  const parsed = await waitForDisk((j) => j[k]?.text === translated);
  assert.equal(parsed[k].text, translated);
});

// ===== 3) writes متزامنة لا تفقد بعضها (طابور + debounce) =====

test('cache: كتابات متزامنة كثيرة لا تُضيّع أي إدخال', async () => {
  const N = 50;
  const prefix = 'concurrent-' + Date.now() + '-';
  for (let i = 0; i < N; i++) {
    cache.set(prefix + i, LANG.source, LANG.target, 'ترجمة-' + i);
  }

  const lastKey = cacheKey(prefix + (N - 1), LANG.source, LANG.target);
  const parsed = await waitForDisk((j) => j[lastKey]);

  for (let i = 0; i < N; i++) {
    assert.equal(parsed[cacheKey(prefix + i, LANG.source, LANG.target)]?.text, 'ترجمة-' + i);
  }
});

// ===== 4) معيار القبول في B3: ألف get ⇒ صفر قراءة قرص =====

test('cache: 1000 استدعاء get ⇒ صفر قراءة قرص', () => {
  const text = 'zero-io-' + Date.now();
  cache.set(text, LANG.source, LANG.target, 'مخزَّن');

  // عدّادات على كل دوال القراءة التي قد تلمس القرص
  const realSync = fs.readFileSync;
  const realAsync = fs.promises.readFile;
  let reads = 0;
  fs.readFileSync = (...a) => { reads++; return realSync(...a); };
  fs.promises.readFile = (...a) => { reads++; return realAsync(...a); };

  try {
    for (let i = 0; i < 1000; i++) {
      // إصابات ونقرات معًا — كلاهما يجب أن يبقى في الذاكرة
      assert.equal(cache.get(text, LANG.source, LANG.target), 'مخزَّن');
      assert.equal(cache.get('miss-' + i, LANG.source, LANG.target), null);
    }
  } finally {
    fs.readFileSync = realSync;
    fs.promises.readFile = realAsync;
  }

  assert.equal(reads, 0, `get لمس القرص ${reads} مرة`);
});

// ===== 5) الكتابة ذرّية: لا ملف مؤقت متبقٍ ولا ملف نصفي =====

test('cache: الكتابة ذرّية (لا بقايا .tmp والملف JSON صالح دائمًا)', async () => {
  const prefix = 'atomic-' + Date.now() + '-';
  for (let i = 0; i < 20; i++) {
    cache.set(prefix + i, LANG.source, LANG.target, 'ذ-' + i);
  }
  const k0 = cacheKey(prefix + 0, LANG.source, LANG.target);
  // الملف صالح للتحليل دائمًا (لو كانت الكتابة مباشرة لأمكن التقاطه نصف مكتوب)
  const parsed = await waitForDisk((j) => j[k0]);
  assert.equal(parsed[k0].text, 'ذ-0');

  // لا ملفات مؤقتة متبقية بعد نجاح rename.
  // الكتابة ذرّية لكن الطابور مصفّر، فقد تصادَفُ كتابةً قيد التنفيذ (مؤقّت في
  // منتصف writeFile) لحظة الفحص. ننتظر هدوء الطابور: فترة خالية من .tmp ثابتة.
  const dir = path.dirname(CACHE_FILE);
  const quietMs = 350;
  const deadline = Date.now() + 3000;
  let leftovers;
  for (;;) {
    leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp'));
    if (leftovers.length === 0) {
      await new Promise((r) => setTimeout(r, quietMs));
      leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp'));
      if (leftovers.length === 0) break;
    }
    assert.ok(Date.now() < deadline, 'الطابور لم يهدأ: المؤقتات لم تُنظَّف');
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.deepEqual(leftovers, [], `ملفات مؤقتة متبقية: ${leftovers.join(', ')}`);
});