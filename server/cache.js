// server/cache.js — كاش ملفي بسيط للترجمات
// البنية: { [key]: { text, ts } } — key = sha1(text + '|' + sourceLang + '|' + targetLang)
// أي نص يُترجم بنجاح يُحفظ هنا؛ الطلب التالي لنفس النص+اللغتين يرجع فورًا بدون شبكة
// (يقلل استهلاك حصص Google/Gemini اليومية).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_FILE = path.join(__dirname, '..', 'cache', 'translation-cache.json');
const MAX_ENTRIES = 5000;

function load() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  const keys = Object.keys(data);
  if (keys.length > MAX_ENTRIES) {
    // حذف الأقدم: فرز الإدخالات حسب ts (الأحدث أولًا) وإبقاء MAX_ENTRIES فقط
    const sorted = keys
      .map((k) => [k, data[k].ts || 0])
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_ENTRIES);
    const pruned = {};
    for (const [k] of sorted) pruned[k] = data[k];
    data = pruned;
  }
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
}

function cacheKey(text, sourceLang, targetLang) {
  return crypto
    .createHash('sha1')
    .update(text + '|' + (sourceLang || '') + '|' + targetLang)
    .digest('hex');
}

function get(text, sourceLang, targetLang) {
  const d = load();
  return d[cacheKey(text, sourceLang, targetLang)]?.text || null;
}

function set(text, sourceLang, targetLang, translated) {
  const d = load();
  d[cacheKey(text, sourceLang, targetLang)] = { text: translated, ts: Date.now() };
  save(d);
}

module.exports = { get, set };
