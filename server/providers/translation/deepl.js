// server/providers/translation/deepl.js — DeepL Free API (مفتاح مجاني اختياري)
// الخادم الافتراضي api-free.deepl.com، قابل للتغيير عبر DEEPL_URL.
const config = require('../../config');

async function translateViaDeepL(text, targetLang, sourceLang) {
  const url = config.DEEPL_URL + '/v2/translate';
  const body = { text: [text], target_lang: targetLang.toUpperCase() };
  if (sourceLang && sourceLang !== 'auto') body.source_lang = sourceLang.toUpperCase();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `DeepL-Auth-Key ${config.DEEPL_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`DeepL HTTP ${res.status}`);
  const data = await res.json();
  const out = data?.translations?.[0]?.text;
  if (!out) throw new Error('DeepL: استجابة فارغة');
  return out;
}

module.exports = {
  id: 'deepl',
  label: 'DeepL (مجاني)',
  requiresKey: true,
  isAvailable: () => Boolean(config.DEEPL_API_KEY),
  translate: translateViaDeepL,
};
