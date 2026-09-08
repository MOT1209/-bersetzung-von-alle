// server/providers/stt/sherpa.js — محرك التفريغ sherpa-onnx (الافتراضي، الأسرع)
// whisper-tiny متعدد اللغات (int8 ~75MB) يُنزَّل مرة واحدة ويُخزَّن محليًا.
const fs = require('fs/promises');
const path = require('path');
const config = require('../../config');
const { normalizeLang } = require('./lang');

const SHERPA_TIMEOUT = 120000;

// الحزمة أصلية (native) وقد يفشل تثبيتها — الغياب يعطّل هذا المزوّد وحده
// لا التطبيق كله، وهو سبب وجود try/catch هنا بدل require مباشر.
let sherpa = null;
try {
  sherpa = require('sherpa-onnx');
} catch (e) {
  /* غير مثبت — isAvailable() ستعيد false */
}

// ملفات csukuangfj/sherpa-onnx-whisper-tiny (متعدد اللغات — يدعم 100+ لغة)
// ملاحظة: لا نستخدم tiny.en لأنها إنجليزية فقط ونحن نستهدف أي لغة مصدر.
const SHERPA_FILES = {
  encoder: 'tiny-encoder.int8.onnx',
  decoder: 'tiny-decoder.int8.onnx',
  tokens: 'tiny-tokens.txt',
};
const SHERPA_BASE = 'https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main/';

async function ensureSherpaModel() {
  const dir = config.SHERPA_MODEL_DIR;
  await fs.mkdir(dir, { recursive: true });
  const missing = [];
  for (const name of Object.values(SHERPA_FILES)) {
    const p = path.join(dir, name);
    try {
      const st = await fs.stat(p);
      if (!st.size) missing.push(name);
    } catch (e) {
      missing.push(name);
    }
  }
  for (const name of missing) {
    const url = SHERPA_BASE + name;
    console.log('[stt:sherpa] downloading model file: ' + name);
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error('model download failed: ' + name + ' (HTTP ' + res.status + ')');
    const buf = Buffer.from(await res.arrayBuffer());
    // نكتب لملف مؤقت ثم نعيد التسمية حتى لا نستخدم ملفًا ناقصًا
    const tmp = path.join(dir, name + '.part');
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, path.join(dir, name));
  }
}

// مُعرِّف لكل لغة: sherpa يثبّت اللغة وقت الإنشاء، فلا يكفي مُعرِّف واحد
const sherpaRecognizers = new Map(); // lang → Promise<recognizer>

function getSherpaRecognizer(lang) {
  const language = normalizeLang(lang);
  let recognizerPromise = sherpaRecognizers.get(language) || null;
  if (!recognizerPromise) {
    recognizerPromise = ensureSherpaModel()
      .then(() => {
        const encoder = config.SHERPA_ENCODER || path.join(config.SHERPA_MODEL_DIR, SHERPA_FILES.encoder);
        const decoder = config.SHERPA_DECODER || path.join(config.SHERPA_MODEL_DIR, SHERPA_FILES.decoder);
        const tokens = config.SHERPA_TOKENS || path.join(config.SHERPA_MODEL_DIR, SHERPA_FILES.tokens);
        console.log('[stt:sherpa] ready lang=' + language + ' (' + sherpa.version + ')');
        return sherpa.createOfflineRecognizer({
          featConfig: { sampleRate: 16000, featureDim: 80 },
          modelConfig: {
            whisper: {
              encoder,
              decoder,
              language,
              task: 'transcribe',
              tailPaddings: -1,
              enableSegmentTimestamps: 1,
            },
            tokens,
            numThreads: 4,
            provider: 'cpu',
          },
        });
      })
      .catch((e) => {
        sherpaRecognizers.delete(language); // نسمح بإعادة المحاولة في المرة القادمة
        throw e;
      });
    sherpaRecognizers.set(language, recognizerPromise);
  }
  return recognizerPromise;
}

// sherpa-onnx يعيد إما segments أو مصفوفات متوازية — نوحّدها هنا
function toSegments(res) {
  if (Array.isArray(res.segments) && res.segments.length) {
    return res.segments.map((s) => ({
      start: s.start || 0,
      end: (s.start || 0) + (s.duration || 2),
      text: s.text || '',
    }));
  }
  const st = res.segment_timestamps || [];
  const sd = res.segment_durations || [];
  const stx = res.segment_texts || [];
  const out = [];
  for (let i = 0; i < st.length; i++) {
    const start = st[i] || 0;
    out.push({ start, end: start + (sd[i] || 2), text: stx[i] || '' });
  }
  return out;
}

// watchdog: مهلة موحّدة 120s عبر Promise.race — بدونها قد يعلّق فكّ الترميز الطلب
async function transcribe(audio, lang) {
  const recognizer = await getSherpaRecognizer(lang);
  const stream = recognizer.createStream();
  let timeoutId = null;
  try {
    stream.acceptWaveform(16000, audio); // Float32Array في المدى [-1,1]
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const err = new Error('sherpa recognize timeout');
        err.code = 'fetch-failed';
        reject(err);
      }, SHERPA_TIMEOUT);
    });
    const workPromise = (async () => {
      recognizer.decode(stream);
      return recognizer.getResult(stream);
    })();
    workPromise.catch(() => {});
    const res = await Promise.race([workPromise, timeoutPromise]);
    return { text: res.text || '', segments: toSegments(res) };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    try { stream.free(); } catch { /* تجاهل */ }
  }
}

module.exports = {
  id: 'sherpa',
  label: 'sherpa-onnx (whisper-tiny)',
  isAvailable: () => Boolean(sherpa),
  transcribe,
};
module.exports.toSegments = toSegments; // للاختبار المباشر
