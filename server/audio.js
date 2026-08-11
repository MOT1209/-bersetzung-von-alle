// server/audio.js — تفريغ صوت يوتيوب محليًا (yt-dlp + ffmpeg + STT)
// مسار احتياطي للفيديوهات التي لا تحتوي على ترجمات نصية: ننزّل الصوت كـ m4a فقط،
// نحوله مباشرة إلى PCM خام float32 16 كيلوهرتز (بدون ملف wav وسيط)،
// ثم نمرره إلى محرك التفريغ:
//   - sherpa-onnx (whisper-tiny متعدد اللغات) — الأسرع بكثير (افتراضي إن كان مثبتًا)
//   - @xenova/transformers (whisper-tiny) — الاحتياطي
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { downloadAudio } = require('./downloader');
const config = require('./config');

const execFileAsync = promisify(execFile);

// مجلد مؤقت بمسار Windows مطلق (لا نعتمد على /tmp)
const TMP_DIR = path.join(os.tmpdir(), 'aralink');

// ===== اختيار محرك التفريغ =====
// sherpa-onnx قد لا يكون مثبتًا (فشل npm) → نرجع تلقائيًا إلى transformers
let sherpa = null;
try {
  sherpa = require('sherpa-onnx');
} catch (e) {
  /* sherpa-onnx غير مثبت — الاحتياطي transformers */
}

function activeEngine() {
  return config.STT_ENGINE === 'sherpa' && sherpa ? 'sherpa' : 'transformers';
}

// ===== transformers: استيراد كسول (لا يُحمَّل عند إقلاع الخادم) =====
// كان `require('@xenova/transformers')` عند القمة، فيعتمد إقلاع الخادم كله على
// اعتمادية أصلية ثقيلة. ثبت هذا عمليًا داخل حاوية Docker: غياب onnxruntime-node
// (اعتمادية اختيارية) منع الخادم من الإقلاع أصلًا بدل أن يعطّل التفريغ وحده.
// النمط نفسه المستخدم مع sherpa-onnx أدناه: الفشل يعطّل الميزة لا التطبيق.
let transformers = null;
function loadTransformers() {
  if (!transformers) {
    transformers = require('@xenova/transformers');
    const { env } = transformers;
    if (env && env.backends && env.backends.onnx) {
      env.backends.onnx.numThreads = 4; // onnxruntime-node الأحدث يستفيد من الخيوط المتعددة
    }
  }
  return transformers;
}

// ===== مفرد: أنبوب Whisper (transformers) يُحمَّل مرة واحدة فقط =====
let sttPromise = null;
function getPipeline() {
  if (!sttPromise) {
    const { pipeline, env } = loadTransformers();
    env.allowLocalModels = false; // نحمّل النموذج من Hugging Face وليس محليًا
    sttPromise = pipeline('automatic-speech-recognition', config.WHISPER_MODEL).catch((e) => {
      sttPromise = null; // نسمح بإعادة المحاولة في المرة القادمة
      throw e;
    });
  }
  return sttPromise;
}

// ===== نموذج sherpa-onnx: تنزيل من HuggingFace مرة واحدة وتخزينه محليًا =====
// ملفات csukuangfj/sherpa-onnx-whisper-tiny (متعدد اللغات — يدعم 100+ لغة، int8 ~75MB)
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
    console.log('[audio] downloading sherpa model file: ' + name);
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error('model download failed: ' + name + ' (HTTP ' + res.status + ')');
    const buf = Buffer.from(await res.arrayBuffer());
    // نكتب لملف مؤقت ثم نعيد التسمية حتى لا نستخدم ملفًا ناقصًا
    const tmp = path.join(dir, name + '.part');
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, path.join(dir, name));
  }
}

// خيارات transformers: نمرّر اللغة صراحةً متى عُرفت
function sttOptions(lang) {
  // chunk_length_s ضروري: بدونه يحذّر transformers من الصوت الأطول من 30 ثانية
  // ثم يُخرج قمامة (سلاسل شرطات وتكرارًا) بدل نص. stride للتداخل بين القطع
  // حتى لا تُبتر الكلمات عند الحدود.
  const o = { task: 'transcribe', return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 };
  const l = normalizeLang(lang);
  if (l !== 'auto') o.language = l;
  return o;
}

// مفرد: مُعرِّف sherpa-onnx يُنشأ مرة واحدة ويعاد استخدامه
// اللغات المدعومة صراحةً — تمرير اللغة يرفع الدقة كثيرًا مقابل 'auto'،
// خصوصًا العربية والتركية حيث يخطئ الكشف التلقائي كثيرًا.
const SUPPORTED_STT_LANGS = ['ar', 'de', 'tr', 'en'];
function normalizeLang(lang) {
  const l = String(lang || '').toLowerCase().slice(0, 2);
  return SUPPORTED_STT_LANGS.includes(l) ? l : 'auto';
}

// مُعرِّف لكل لغة: sherpa يثبّت اللغة وقت الإنشاء، فلا يكفي مُعرِّف واحد
const sherpaRecognizers = new Map(); // lang → Promise<recognizer>
function getSherpaRecognizer(lang) {
  const language = normalizeLang(lang);
  let sherpaRecognizerPromise = sherpaRecognizers.get(language) || null;
  if (!sherpaRecognizerPromise) {
    sherpaRecognizerPromise = ensureSherpaModel()
      .then(() => {
        const encoder = config.SHERPA_ENCODER || path.join(config.SHERPA_MODEL_DIR, SHERPA_FILES.encoder);
        const decoder = config.SHERPA_DECODER || path.join(config.SHERPA_MODEL_DIR, SHERPA_FILES.decoder);
        const tokens = config.SHERPA_TOKENS || path.join(config.SHERPA_MODEL_DIR, SHERPA_FILES.tokens);
        console.log('[audio] sherpa-onnx ready lang=' + language + ' (' + sherpa.version + ')');
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
    sherpaRecognizers.set(language, sherpaRecognizerPromise);
  }
  return sherpaRecognizerPromise;
}

// استخراج مقاطع { start, end, text } من نتيجة المحرك بأي شكل تُرجعه المكتبة
function segmentsFromResult(res, engine) {
  if (engine === 'sherpa') {
    // sherpa-onnx: إما segments أو مصفوفات متوازية segment_timestamps/segment_durations/segment_texts
    if (Array.isArray(res.segments) && res.segments.length) {
      return res.segments.map((s) => ({ start: s.start || 0, end: (s.start || 0) + (s.duration || 2), text: s.text || '' }));
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
  // transformers: res.chunks بتنسيق { timestamp:[start,end], text }
  return (res.chunks || []).map((c) => {
    const ts = c.timestamp || [];
    return { start: ts[0] || 0, end: ts[1] || (ts[0] || 0) + 2, text: String(c.text || '') };
  });
}

// تفريغ عبر sherpa-onnx: يعيد { text, segments:[{start,duration,text}] }
async function transcribeWithSherpa(audio, lang) {
  const recognizer = await getSherpaRecognizer(lang);
  const stream = recognizer.createStream();
  try {
    stream.acceptWaveform(16000, audio); // Float32Array في المدى [-1,1]
    recognizer.decode(stream);
    return recognizer.getResult(stream);
  } finally {
    stream.free();
  }
}

// حذف ملفات مؤقتة بأمان (لا تفشل إذا لم تكن موجودة)
async function removeFiles(...files) {
  await Promise.all(files.map((f) => fs.rm(f, { force: true }).catch(() => {})));
}

// نص فارغ أو رموز ترقيم/رموز فقط؟
function isEmptyText(t) {
  if (!t || !t.trim()) return true;
  return /^[\s\p{P}\p{S}\p{M}]+$/u.test(t.trim());
}

// توحيد مقاطع المحرك إلى شكل chunks مع دمج الأجزاء الفارغة في الجزء السابق
function normalizeChunks(segments, fullText) {
  const chunks = [];
  for (const c of segments || []) {
    const start = typeof c.start === 'number' ? c.start : 0;
    const end = typeof c.end === 'number' ? c.end : start + (c.duration || 2);
    const text = String(c.text || '').trim();
    if (isEmptyText(text)) {
      // نمدد الجزء السابق ليشمل فجوة الصمت بدلًا من إنشاء جزء فارغ
      if (chunks.length) {
        const last = chunks[chunks.length - 1];
        last.duration = Math.min(10, Math.max(2, end - last.start));
      }
      continue;
    }
    chunks.push({
      start,
      duration: Math.min(10, Math.max(2, end - start)),
      text,
    });
  }

  // احتياط: نص كامل بدون أجزاء زمنية → جزء واحد
  if (!chunks.length && fullText && fullText.trim()) {
    const lastEnd = segments && segments.length ? segments[segments.length - 1].end : 0;
    chunks.push({ start: 0, duration: Math.min(10, Math.max(2, lastEnd || 10)), text: fullText.trim() });
  }
  return chunks;
}

// ===== تفريغ ملف وسائط محلي (فيديو/صوت مرتفع) =====
// يحوّل الملف إلى PCM خام (16 كيلوهرتز، قناة واحدة، float32) ثم يفرّغه عبر المحرك النشط
// (sherpa-onnx الافتراضي مع احتياطي تلقائي إلى transformers عند فشل sherpa وقت التشغيل)
// الإرجاع: { chunks: [{ start, duration, text }] } — نفس شكل مخرجات transcribeVideoAudio
async function transcribeMediaFile(mediaPath, label, lang) {
  await fs.mkdir(TMP_DIR, { recursive: true });
  // اسم ملف PCM مؤقت فريد (يُنظَّف في finally داخل هذه الدالة — لا يُلمس من الخارج)
  const tag = String(label || path.basename(mediaPath || 'media')).replace(/[^a-zA-Z0-9_-]/g, '_');
  const pcmPath = path.join(TMP_DIR, `pcm-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.f32`);

  try {
    // 1) تحويل الملف → PCM خام مباشرة: 16 كيلوهرتز، قناة واحدة، float32 (بدون wav وسيط)
    await execFileAsync('ffmpeg', ['-y', '-i', mediaPath, '-ar', '16000', '-ac', '1', '-f', 'f32le', pcmPath]);

    // 2) قراءة العينات مباشرة في Float32Array (لا يوجد AudioContext في Node)
    const buf = await fs.readFile(pcmPath);
    const audio = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);

    // 3) التفريغ عبر المحرك النشط (sherpa أسرع بكثير؛ transformers احتياطي)
    const engine = activeEngine();
    console.log('[audio] STT engine: ' + engine + (engine === 'sherpa' ? ' (sherpa-onnx)' : ' (transformers fallback)'));
    let res;
    if (engine === 'sherpa') {
      res = await transcribeWithSherpa(audio, lang);
    } else {
      const stt = await getPipeline();
      res = await stt(audio, sttOptions(lang));
    }

    // 4) توحيد المقاطع إلى شكل chunks موحد
    const segments = segmentsFromResult(res, engine);
    const chunks = normalizeChunks(segments, res.text || '');

    // لا يوجد كلام واضح في الصوت (موسيقى/مؤثرات فقط) → خطأ عربي واضح بدل نتيجة فارغة
    if (!chunks.length) {
      const err = new Error('no speech detected in audio');
      err.code = 'audio-empty';
      throw err;
    }

    return { chunks };
  } catch (e) {
    console.error('[audio] transcription failed:', e && e.message);
    // محرك sherpa فشل في وقت التشغيل (نموذج/تنزيل) → نعود تلقائيًا إلى transformers
    if (activeEngine() === 'sherpa' && e && !e.code) {
      try {
        console.error('[audio] sherpa failed at runtime, falling back to transformers for this call');
        const stt = await getPipeline();
        const buf = await fs.readFile(pcmPath);
        const audio = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
        const res = await stt(audio, sttOptions(lang));
        const segments = segmentsFromResult(res, 'transformers');
        const chunks = normalizeChunks(segments, res.text || '');
        if (!chunks.length) {
          const err = new Error('no speech detected in audio');
          err.code = 'audio-empty';
          throw err;
        }
        return { chunks };
      } catch (e2) {
        // إن فشل الاحتياطي أيضًا نستخدم الخطأ الأصلي (مع رمز معروف أو fetch-failed)
        if (e2 && e2.code) throw e2;
        e = e2 || e;
      }
    }
    // نحافظ على رمز الخطأ المعروف (audio-empty) ونحوّل الباقي إلى fetch-failed
    if (e && e.code) throw e;
    const err = new Error('audio transcription failed' + (e && e.message ? ': ' + e.message : ''));
    err.code = 'fetch-failed';
    throw err;
  } finally {
    // 5) تنظيف ملف PCM المؤقت دائمًا
    await removeFiles(pcmPath);
  }
}

// ===== تنزيل صوت الفيديو + تفريغه (يوتيوب) =====
// الإرجاع: { chunks: [{ start, duration, text }] } (التوقيع لا يتغير أبدًا)
async function transcribeVideoAudio(videoId, lang) {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const m4aPath = path.join(TMP_DIR, `audio-${videoId}.m4a`); // تحميل m4a فقط (لا wav)

  try {
    // 1) تنزيل الصوت كـ m4a مباشرة عبر yt-dlp.exe (الثنائي المباشر — موثوق)
    await downloadAudio('https://www.youtube.com/watch?v=' + videoId, m4aPath);

    // 2) إعادة استخدام خط الأنابيب المشترك (ffmpeg → PCM → STT → chunks)
    return await transcribeMediaFile(m4aPath, 'yt-' + videoId, lang);
  } catch (e) {
    console.error('[audio] transcription failed:', e && e.message);
    // نحافظ على رمز الخطأ المعروف ونحوّل الباقي إلى fetch-failed
    if (e && e.code) throw e;
    const err = new Error('audio transcription failed' + (e && e.message ? ': ' + e.message : ''));
    err.code = 'fetch-failed';
    throw err;
  } finally {
    // 3) تنظيف ملف الصوت المؤقت دائمًا (لا wav بعد الآن — m4a فقط)
    await removeFiles(m4aPath);
  }
}

module.exports = { transcribeVideoAudio, transcribeMediaFile, SUPPORTED_STT_LANGS, normalizeLang };
