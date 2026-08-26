// tests/cacheTtl.test.js — انتهاء صلاحية كاش الترجمة (CACHE_TTL_MS)
// يركض في عملية منفصلة (node --test) فيُضبط CACHE_TTL_MS قبل require cache.js.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-cache-ttl-'));
const CACHE_FILE = path.join(tmpDir, 'translation-cache.json');
process.env.CACHE_FILE = CACHE_FILE;
// TTL واسع بما يكفي (2000ms): ملف كاش مكتوب قبل لحظات قد يتأخر قراءته عند الإقلاع
// (قرص/فحص AV)، فلا تُعدّ المدخلات الطازجة «منتهية» أثناء التحميل. ولاختبار الانتهاء
// الفعلي ننتظر > TTL بعد التأكد من الكتابة (انظر اختبار 4).
process.env.CACHE_TTL_MS = '2000';

const LANG = { source: 'en', target: 'ar' };

function cacheKey(text, sourceLang, targetLang) {
  return crypto.createHash('sha1').update(text + '|' + sourceLang + '|' + targetLang).digest('hex');
}

const STALE = 'stale-at-boot-' + Date.now();
const STALE_KEY = cacheKey(STALE, LANG.source, LANG.target);
const BOOT_STALE_COUNT = 5000; // يتجاوز MAX_ENTRIES لو لم يُسقطه الانتهاء
const PRUNE_FRESH = ['prune-fresh-a-' + Date.now(), 'prune-fresh-b-' + Date.now()];

const bootStore = { [STALE_KEY]: { text: 'قديم', ts: Date.now() - 100000 } };
for (let i = 0; i < BOOT_STALE_COUNT; i++) {
  const t = 'boot-stale-' + i;
  bootStore[cacheKey(t, LANG.source, LANG.target)] = { text: 'منتهي', ts: Date.now() - 100000 - i };
}
for (const t of PRUNE_FRESH) {
  bootStore[cacheKey(t, LANG.source, LANG.target)] = { text: 'طازج-يبقى', ts: Date.now() };
}
fs.writeFileSync(CACHE_FILE, JSON.stringify(bootStore));

const cache = require('../server/cache');

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // تجاهل
  }
});

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ===== 1) مدخل منتهٍ في ملف الكاش يُسقط عند الإقلاع =====
test('cache TTL: مدخل منتهٍ مكتوب مسبقًا → get null (أسقطه loadInitial)', () => {
  assert.equal(cache.get(STALE, LANG.source, LANG.target), null);
  assert.equal(cache.get('boot-stale-0', LANG.source, LANG.target), null, 'المدخلات المنتهية يجب ألا تُبقى في الذاكرة');
});

// ===== 2) إسقاط المنتهي قبل تقليم العدد: يبقى الطازج فقط =====
test('cache TTL: يُسقط المنتهي قبل تقليم العدد فيبقى الطازج', async () => {
  // loadInitial يقرأ الملف لاأجل — ننتظر وصول المدخلات الطازجة قبل الفحص (لا سباق إقلاع)
  const deadline = Date.now() + 5000;
  const first = PRUNE_FRESH[0];
  while (Date.now() < deadline && cache.get(first, LANG.source, LANG.target) !== 'طازج-يبقى') {
    await new Promise((r) => setTimeout(r, 25));
  }
  for (const t of PRUNE_FRESH) {
    assert.equal(cache.get(t, LANG.source, LANG.target), 'طازج-يبقى');
  }
});

// ===== 3) مدخل طازج جديد → set/get يعملان =====
test('cache TTL: set ثم get ترجع القيمة فورًا', () => {
  const text = 'fresh-live-' + Date.now();
  cache.set(text, LANG.source, LANG.target, 'طازج');
  assert.equal(cache.get(text, LANG.source, LANG.target), 'طازج');
});

// ===== 4) انتهاء أثناء التشغيل: get null + يُطهر القرص =====
test('cache TTL: بعد تجاوز المدة يُحذف المدخل من الذاكرة والقرص', async () => {
  const text = 'expire-live-' + Date.now();
  cache.set(text, LANG.source, LANG.target, 'قيمة ستنتهي');
  const k = cacheKey(text, LANG.source, LANG.target);
  await waitForDisk((j) => j[k]?.text === 'قيمة ستنتهي');

  await sleep(2200); // > CACHE_TTL_MS=2000
  assert.equal(cache.get(text, LANG.source, LANG.target), null, 'بعد الانتهاء يرجع get null');

  // الحذف طُبّق على القرص بعد الفلاش، والمدخلات المنتهية لم تعد موجودة
  await waitForDisk((j) => !(k in j));
  const onDisk = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  assert.ok(!(STALE_KEY in onDisk), 'القديم لا يجب أن يعود إلى القرص');
});
