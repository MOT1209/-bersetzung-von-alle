// tests/cacheTtlZero.test.js — CACHE_TTL_MS=0 = بلا انتهاء صلاحية أبدًا
// عملية منفصلة (node --test): تُضبط القيمة قبل require، وتُكتب مدخلات قديمة جدًا.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-cache-ttl-zero-'));
const CACHE_FILE = path.join(tmpDir, 'translation-cache.json');
process.env.CACHE_FILE = CACHE_FILE;
process.env.CACHE_TTL_MS = '0';

const LANG = { source: 'en', target: 'ar' };

function cacheKey(text, sourceLang, targetLang) {
  return crypto.createHash('sha1').update(text + '|' + sourceLang + '|' + targetLang).digest('hex');
}

// مدخل أقدم من أي مدة منطقية — مع CACHE_TTL_MS=0 يجب أن يبقى دائمًا
const OLD = 'never-expire-' + Date.now();
const OLD_KEY = cacheKey(OLD, LANG.source, LANG.target);
fs.writeFileSync(CACHE_FILE, JSON.stringify({ [OLD_KEY]: { text: 'أبدي', ts: 1 } }));

const cache = require('../server/cache');

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // تجاهل
  }
});

test('cache TTL=0: مدخل بزمن قديم جدًا يبقى ويعمل إلى الأبد', async () => {
  // loadInitial يقرأ الملف لاأجل — ننتظر حتى يظهر المدخل في الذاكرة (لا سباق إقلاع)
  const deadline = Date.now() + 5000;
  let v = null;
  while (Date.now() < deadline && v !== 'أبدي') {
    v = cache.get(OLD, LANG.source, LANG.target);
    if (v !== 'أبدي') await new Promise((r) => setTimeout(r, 25));
  }
  assert.equal(v, 'أبدي');
});

test('cache TTL=0: set/get عادي يعمل والكتابة على القرص تستمر', async () => {
  const text = 'zero-live-' + Date.now();
  cache.set(text, LANG.source, LANG.target, 'يعيش');
  assert.equal(cache.get(text, LANG.source, LANG.target), 'يعيش');

  const k = cacheKey(text, LANG.source, LANG.target);
  const deadline = Date.now() + 5000;
  let last;
  while (Date.now() < deadline) {
    try {
      last = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (last[k]?.text === 'يعيش') break;
    } catch {
      // لا شيء
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.equal(last?.[k]?.text, 'يعيش');
});
