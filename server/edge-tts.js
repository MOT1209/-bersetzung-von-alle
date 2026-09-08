// server/edge-tts.js — توليد الصوت عبر Microsoft Edge TTS (أصوات عصبية ذكر/أنثى)
// مع قاطع دائرة: أول فشل يعطّل Edge مؤقتًا (10 دقائق) فيعود المتصل إلى gTTS
// تلقائيًا بدل إضاعة مهلة على كل مقطع. لا يرمي المتصل أبدًا أخطاء شبكة خام.

let edgeTts = null;
function loadEdge() {
  if (!edgeTts) edgeTts = require('msedge-tts');
  return edgeTts;
}

let disabledUntil = 0;
function isDisabled() { return Date.now() < disabledUntil; }
function tripBreaker(ms = 10 * 60 * 1000) { disabledUntil = Date.now() + ms; }

function err(code, message, cause) {
  const e = new Error(message || code);
  e.code = code;
  if (cause) e.cause = cause;
  return e;
}

// نص → Buffer mp3 بصوت محدد. rate: 1 طبيعي، >1 أسرع (يُستخدم لتضييق الفجوة الزمنية)
async function synthesize(text, { voice, rate = 1 } = {}) {
  const clean = String(text || '').trim();
  if (!clean) throw err('invalid-text', 'invalid-text');
  if (!voice) throw err('invalid-voice', 'invalid-voice');
  if (isDisabled()) throw err('edge-cooling', 'edge-cooling');
  if (clean.length > 5000) throw err('text-too-long', 'text-too-long');

  let tts;
  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = loadEdge();
    tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  } catch (e) {
    tripBreaker();
    throw err('tts-failed', `edge-setup: ${e.message}`, e);
  }
  try {
    // toStream يعيد كائنًا فيه Readable — نجمع القطع في Buffer واحد
    const { audioStream } = await tts.toStream(clean, rate !== 1 ? { rate: Number(rate) } : undefined);
    const chunks = [];
    for await (const chunk of audioStream) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    if (!buf.length) throw new Error('edge returned empty audio');
    return buf;
  } catch (e) {
    if (e && (e.code === 'invalid-text' || e.code === 'text-too-long')) throw e;
    tripBreaker();
    throw err('tts-failed', `edge-synthesize: ${e.message}`, e);
  } finally {
    try { tts.close(); } catch { /* تجاهل */ }
  }
}

module.exports = { synthesize, isDisabled, tripBreaker };
