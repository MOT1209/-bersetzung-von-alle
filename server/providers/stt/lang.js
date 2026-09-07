// server/providers/stt/lang.js — لغات التفريغ المدعومة صراحةً
// تمرير اللغة يرفع الدقة كثيرًا مقابل 'auto'، خصوصًا العربية والتركية حيث
// يخطئ الكشف التلقائي كثيرًا. مشترك بين محرّكي التفريغ ومنسّق audio.js.
const SUPPORTED_STT_LANGS = ['ar', 'de', 'tr', 'en'];

function normalizeLang(lang) {
  const l = String(lang || '').toLowerCase().slice(0, 2);
  return SUPPORTED_STT_LANGS.includes(l) ? l : 'auto';
}

module.exports = { SUPPORTED_STT_LANGS, normalizeLang };
