// agents/core/llm.js — محرك LLM الاختياري (هجين)
//
// النظام هجين: كل الوكلاء يعملون محليًا بلا شبكة افتراضيًا. أما الأوكلاء
// الذين يحملون المهارة 'llm' فيمكنهم استدعاء Gemini مجانًا عند توفر
// GEMINI_API_KEY في .env — بنفس نمط server/tashkeel.js (ترويسة x-goog-api-key
// لا query string، ومهلة 30 ثانية، وsystemInstruction فارغ لأن Gemini
// يرفض التلقائيات المعقدة أحيانًا — درس موثّق في هذا المشروع).
const config = require('../../server/config');

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = () => config.GEMINI_MODEL || 'gemini-2.0-flash';

function available() {
  return Boolean(config.GEMINI_API_KEY);
}

async function call(prompt, system) {
  if (!available()) throw new Error('GEMINI_API_KEY غير مضبوط');
  const res = await fetch(`${ENDPOINT}/${MODEL()}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: String(prompt || '') }] }],
      ...(system ? { systemInstruction: { parts: [{ text: String(system) }] } } : {}),
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error('Gemini أرجع استجابة فارغة');
  return text;
}

module.exports = { available, call };
