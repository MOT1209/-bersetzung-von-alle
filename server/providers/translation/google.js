// server/providers/translation/google.js — نقطة Google المجانية (بلا مفتاح)
const { GOOGLE_URL } = require('./endpoints');

async function translateViaGoogle(text, targetLang, sourceLang) {
  const sl = sourceLang || 'auto';
  const url = GOOGLE_URL.replace(':tl', targetLang);
  const body = new URLSearchParams({ q: text, sl, tl: targetLang, dt: 't' });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  // فحص سريع لصفحات الحجب (مثل /sorry): قد يعيد Google 200 بنص HTML بدل JSON
  const ct = res.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) throw new Error('Google blocked');
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('Google blocked');
  }
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('Google blocked');
  return data[0].map((seg) => (seg ? seg[0] : '')).join('');
}

module.exports = {
  id: 'google',
  label: 'Google (مجاني)',
  requiresKey: false,
  isAvailable: () => true,
  translate: translateViaGoogle,
};
