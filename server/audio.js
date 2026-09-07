// server/audio.js — تنسيق التفريغ الصوتي: تنزيل → ffmpeg → PCM → محرك التفريغ
//
// مسار احتياطي للفيديوهات التي لا تحتوي على ترجمات نصية: ننزّل الصوت كـ m4a فقط،
// نحوّله مباشرة إلى PCM خام float32 16 كيلوهرتز (بدون ملف wav وسيط)، ثم نمرّره
// إلى المحرك النشط.
//
// المنطق هنا **لا يعرف أي محرك بالاسم**: التعريفات في providers/stt/*.js خلف
// واجهة TranscriptionProvider (انظر providers/README.md). هذا الملف يتولّى ما هو
// مشترك: الملفات المؤقتة، وتحويل ffmpeg، واختيار السلسلة، وتوحيد المقاطع.
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { downloadAudio } = require('./downloader');
const config = require('./config');
const { randomUUID } = require('crypto');
const builtinProviders = require('./providers/stt');
const { SUPPORTED_STT_LANGS, normalizeLang } = require('./providers/stt/lang');

const execFileAsync = promisify(execFile);

// مجلد مؤقت بمسار مطلق (لا نعتمد على /tmp — ويندوز)
const TMP_DIR = path.join(os.tmpdir(), 'aralink');

// ===== سجل محرّكات التفريغ =====
const providers = [];
const providerById = {};

function registerProvider(p) {
  providers.push(p);
  providerById[p.id] = p;
}
function getProviders() { return providers.slice(); }
function getProvider(id) { return providerById[id]; }
function getAvailableProviders() { return providers.filter((p) => p.isAvailable()); }

for (const p of builtinProviders) registerProvider(p);

// سلسلة المحرّكات: المفضّل في STT_ENGINE أولًا إن كان متاحًا، ثم الباقي كاحتياطي.
// المحرك غير المثبَّت (sherpa الأصلي مثلًا) يسقط من السلسلة تلقائيًا.
function resolveSttChain() {
  const avail = getAvailableProviders();
  const preferred = avail.find((p) => p.id === config.STT_ENGINE);
  return preferred ? [preferred, ...avail.filter((p) => p !== preferred)] : avail;
}

// ===== أدوات مساعدة =====

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

function audioEmptyError() {
  const err = new Error('no speech detected in audio');
  err.code = 'audio-empty';
  return err;
}

// ===== تفريغ ملف وسائط محلي (فيديو/صوت) =====
// الإرجاع: { chunks: [{ start, duration, text }] } — التوقيع لا يتغير أبدًا
async function transcribeMediaFile(mediaPath, label, lang) {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const tag = String(label || path.basename(mediaPath || 'media')).replace(/[^a-zA-Z0-9_-]/g, '_');
  const pcmPath = path.join(TMP_DIR, `pcm-${tag}-${randomUUID()}.f32`);

  try {
    // 1) الملف → PCM خام: 16 كيلوهرتز، قناة واحدة، float32 (بدون wav وسيط)
    await execFileAsync('ffmpeg', ['-y', '-i', mediaPath, '-ar', '16000', '-ac', '1', '-f', 'f32le', pcmPath], { timeout: 180000 });

    // 2) قراءة العينات مباشرة في Float32Array (لا يوجد AudioContext في Node)
    const buf = await fs.readFile(pcmPath);
    const audio = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);

    // 3) التفريغ عبر السلسلة: خطأ مُصنَّف (audio-empty مثلًا) يتوقف فورًا،
    //    والفشل غير المُصنَّف (نموذج/تحميل) ينتقل للمحرك التالي.
    const chain = resolveSttChain();
    if (!chain.length) {
      const err = new Error('no transcription engine available');
      err.code = 'fetch-failed';
      throw err;
    }

    let lastErr = null;
    for (const provider of chain) {
      try {
        console.log('[audio] STT engine: ' + provider.id);
        const { text, segments } = await provider.transcribe(audio, lang);
        const chunks = normalizeChunks(segments, text);
        // لا كلام واضح (موسيقى/مؤثرات فقط) → خطأ عربي واضح بدل نتيجة فارغة
        if (!chunks.length) throw audioEmptyError();
        return { chunks };
      } catch (e) {
        lastErr = e;
        if (e && e.code) throw e; // رمز معروف — لا فائدة من محرك آخر
        console.error('[audio] engine ' + provider.id + ' failed, trying next:', e && e.message);
      }
    }
    throw lastErr || new Error('transcription failed');
  } catch (e) {
    console.error('[audio] transcription failed:', e && e.message);
    if (e && e.code) throw e;
    const err = new Error('audio transcription failed' + (e && e.message ? ': ' + e.message : ''));
    err.code = 'fetch-failed';
    throw err;
  } finally {
    // تنظيف ملف PCM المؤقت دائمًا
    await removeFiles(pcmPath);
  }
}

// ===== تنزيل صوت الفيديو + تفريغه (يوتيوب) =====
// الإرجاع: { chunks: [{ start, duration, text }] } (التوقيع لا يتغير أبدًا)
async function transcribeVideoAudio(videoId, lang) {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const m4aPath = path.join(TMP_DIR, `audio-${videoId}-${randomUUID()}.m4a`);

  try {
    // 1) تنزيل الصوت كـ m4a مباشرة عبر yt-dlp
    await downloadAudio('https://www.youtube.com/watch?v=' + videoId, m4aPath);
    // 2) إعادة استخدام خط الأنابيب المشترك (ffmpeg → PCM → STT → chunks)
    return await transcribeMediaFile(m4aPath, 'yt-' + videoId, lang);
  } catch (e) {
    console.error('[audio] transcription failed:', e && e.message);
    if (e && e.code) throw e;
    const err = new Error('audio transcription failed' + (e && e.message ? ': ' + e.message : ''));
    err.code = 'fetch-failed';
    throw err;
  } finally {
    await removeFiles(m4aPath);
  }
}

module.exports = {
  transcribeVideoAudio,
  transcribeMediaFile,
  SUPPORTED_STT_LANGS,
  normalizeLang,
  // ===== سجل المحرّكات + منطق قابل للاختبار =====
  registerProvider,
  getProviders,
  getProvider,
  getAvailableProviders,
  resolveSttChain,
  normalizeChunks,
};
