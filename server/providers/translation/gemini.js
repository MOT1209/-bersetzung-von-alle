// server/providers/translation/gemini.js — Gemini (مفتاح مجاني اختياري)
const config = require('../../config');

async function translateViaGemini(text, targetLang) {
  if (!config.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY غير مضبوط');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent`;
  const res = await fetch(url + `?key=${encodeURIComponent(config.GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `Translate the following text to ${targetLang}. Return only the translation, no explanations:\n\n${text}` }] }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error('Gemini: استجابة فارغة');
  return out.trim();
}

module.exports = {
  id: 'gemini',
  label: 'Gemini (مفتاح مجاني)',
  requiresKey: true,
  // يُقرأ وقت الاستدعاء: حفظ المفتاح من لوحة الإعدادات يعدّل config مباشرةً
  isAvailable: () => Boolean(config.GEMINI_API_KEY),
  translate: translateViaGemini,
};
