// server/providers/translation/libre.js — LibreTranslate (احتياطي مجاني)
// الخادم قابل للتغيير عبر LIBRE_URL (يشمل خادمًا ذاتي الاستضافة).
const config = require('../../config');

async function translateViaLibre(text, targetLang, sourceLang) {
  const base = config.LIBRE_URL || 'https://libretranslate.com';
  const res = await fetch(base + '/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: sourceLang || 'auto', target: targetLang, format: 'text' }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Libre HTTP ${res.status}`);
  // بعض الخوادم (أو وسيط) تعيد صفحة HTML بدل JSON — لا نتعامل معها
  const ct = res.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) throw new Error('Libre: استجابة غير JSON');
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('Libre: استجابة غير JSON');
  }
  const out = data && data.translatedText;
  if (!out) throw new Error('Libre: استجابة فارغة');
  return out;
}

module.exports = {
  id: 'libre',
  label: 'LibreTranslate (مجاني)',
  requiresKey: false,
  isAvailable: () => true,
  translate: translateViaLibre,
};
