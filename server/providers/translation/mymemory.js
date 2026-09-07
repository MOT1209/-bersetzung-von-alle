// server/providers/translation/mymemory.js — MyMemory (احتياطي مجاني)
// يدعم ~500 حرف لكل طلب، فنقسّم النص داخليًا: فقرات ← جمل ← كلمات.
const config = require('../../config');

const MYMEMORY_MAX = 500;
const MYMEMORY_DELAY_MS = 200; // فاصل خفيف بين القطع لتجنّب الحجب

// تقسيم داخلي يضمن دائمًا قطعة ≤ MYMEMORY_MAX
function splitForMyMemory(text) {
  const clean = text.replace(/\r\n/g, '\n');
  const paragraphs = clean.split(/\n{2,}/);
  const chunks = [];
  let current = '';

  const push = (t) => { if (t.trim()) chunks.push(t.trim()); };

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length <= MYMEMORY_MAX) {
      current = current ? current + '\n\n' + para : para;
    } else {
      if (current) push(current);
      current = '';
      if (para.length > MYMEMORY_MAX) {
        // تقسيم الفقرة الطويلة على حدود الجمل أولاً
        const sentences = para.split(/(?<=[.!?؟])\s+/);
        let part = '';
        for (const s of sentences) {
          if ((part + ' ' + s).length > MYMEMORY_MAX && part) {
            push(part);
            part = s;
          } else {
            part = part ? part + ' ' + s : s;
          }
        }
        if (part) {
          if (part.length > MYMEMORY_MAX) {
            // جملة واحدة أطول من الحد — نقسم على حدود الكلمات
            const words = part.split(/\s+/);
            let wp = '';
            for (const w of words) {
              if ((wp + ' ' + w).trim().length > MYMEMORY_MAX && wp) {
                push(wp);
                wp = w;
              } else {
                wp = wp ? wp + ' ' + w : w;
              }
            }
            if (wp) push(wp);
          } else {
            push(part);
          }
        }
      } else {
        current = para;
      }
    }
  }
  if (current) push(current);
  return chunks.length ? chunks : [text];
}

async function translateViaMyMemory(text, targetLang, sourceLang) {
  // MyMemory لا يقبل 'auto' — نستخدم الإنجليزية كافتراض عند عدم المعرفة
  const src = (sourceLang || 'auto') === 'auto' ? 'en' : sourceLang;
  // ترميز كل لغة على حدة لمنع حقن الاستعلام
  const langpair = encodeURIComponent(src) + '|' + encodeURIComponent(targetLang);
  const chunks = splitForMyMemory(text);
  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${langpair}`;
    // بريد اختياري يرفع الحصة اليومية المجانية
    if (config.MYMEMORY_EMAIL) url += `&Email=${encodeURIComponent(config.MYMEMORY_EMAIL)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
    const data = await res.json();
    if (!data || data.responseStatus !== 200) {
      throw new Error(`MyMemory status ${data ? data.responseStatus : 'unknown'}`);
    }
    const out = data.responseData && data.responseData.translatedText;
    // رسالة 'MYMEMORY WARNING' تعني تجاوز الحصة اليومية
    if (!out || /MYMEMORY WARNING/i.test(out)) {
      throw new Error('MyMemory: تجاوز الحصة أو استجابة فارغة');
    }
    results.push(out);
    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, MYMEMORY_DELAY_MS));
    }
  }
  return results.join('\n\n');
}

module.exports = {
  id: 'mymemory',
  label: 'MyMemory (مجاني)',
  requiresKey: false,
  isAvailable: () => true,
  translate: translateViaMyMemory,
};
module.exports.splitForMyMemory = splitForMyMemory; // للاختبار المباشر
