// server/providers/translation/zen.js — بوابة متوافقة مع OpenAI (/chat/completions)
//
// ZEN_BASE_URL قابل للتغيير فيغطي أيضًا أي خادم متوافق: Ollama المحلي
// (http://localhost:11434/v1) أو LM Studio (http://localhost:1234/v1).
//
// شرط التوفر هو المفتاح لا الرابط: ZEN_BASE_URL له قيمة افتراضية دائمًا، فلو
// اعتمدنا عليه لظهر المزوّد متاحًا وفشل كل طلب بـ401.
const config = require('../../config');

async function translateViaZen(text, targetLang, _sourceLang) {
  const url = config.ZEN_BASE_URL.replace(/\/+$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (config.ZEN_API_KEY) headers.Authorization = `Bearer ${config.ZEN_API_KEY}`;
  const prompt = `Translate the following text to ${targetLang}. Return only the translation, no explanations:\n\n${text}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      model: config.ZEN_MODEL || 'deepseek-v4-flash-free',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`zen HTTP ${res.status}`);
  const data = await res.json();
  const out = data?.choices?.[0]?.message?.content;
  if (!out) throw new Error('zen: استجابة فارغة');
  return out.trim();
}

module.exports = {
  id: 'zen',
  label: 'opencode zen (متوافق OpenAI)',
  requiresKey: true,
  isAvailable: () => Boolean(config.ZEN_API_KEY && config.ZEN_BASE_URL),
  translate: translateViaZen,
};
