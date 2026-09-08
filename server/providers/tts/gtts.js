// server/providers/tts/gtts.js — نقطة Google للنطق (غير رسمية، بلا مفتاح)
//
// ⚠️ ملاحظة تشغيلية: هذه نقطة نهاية غير موثّقة ولا تحكمها اتفاقية استخدام.
// تعمل اليوم وقد تُحجب دون إشعار — وهذا بالضبط سبب وجود هذه الطبقة: إضافة
// مزوّد بديل (Azure/ElevenLabs/محلي) تصبح ملفًا واحدًا بلا لمس منطق الدبلجة.
const GTTS_URL = 'https://translate.google.com/translate_tts';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT = 20000;

async function synthesize(text, lang) {
  const url = `${GTTS_URL}?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  if (!res.ok) throw new Error(`gTTS HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error('gTTS returned empty audio');
  return buf;
}

module.exports = {
  id: 'gtts',
  label: 'Google TTS (مجاني)',
  requiresKey: false,
  isAvailable: () => true,
  // كل طلب gTTS لا يتحمل أكثر من ~180 حرفًا — حدّ خاص بهذا المزوّد لا بالنظام
  maxChunkChars: 180,
  synthesize,
};
