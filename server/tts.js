// server/tts.js — تنسيق تحويل النص إلى صوت: اختيار المزوّد + التقسيم + الدمج
//
// المنطق هنا **لا يعرف أي مزوّد بالاسم**. التعريفات في providers/tts/*.js خلف
// واجهة TTSProvider (انظر providers/README.md)، وهذا الملف يتولّى ما هو مشترك:
//   1) حدود المدخلات   2) التقسيم على حدود الجمل بحسب سقف المزوّد
//   3) نداء المزوّد لكل قطعة   4) دمج المقاطع في mp3 واحد عبر ffmpeg
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { randomUUID } = require('crypto');
const builtinProviders = require('./providers/tts');

const execFileAsync = promisify(execFile);

const MAX_TEXT_LEN = 5000; // حد أقصى لإجمالي النص المطلوب نطقه
const DEFAULT_CHUNK_LEN = 180; // احتياطي لو لم يعلن المزوّد سقفًا
const SENTENCE_BOUNDS = ['.', '!', '?', '؟', '…', '\n'];

// ===== سجل مزوّدي النطق =====
const providers = [];
const providerById = {};

function registerProvider(p) {
  providers.push(p);
  providerById[p.id] = p;
}
function getProviders() { return providers.slice(); }
function getProvider(id) { return providerById[id]; }
function getAvailableProviders() { return providers.filter((p) => p.isAvailable()); }

// المزوّد الفعّال: المفروض في الطلب إن كان متاحًا، وإلا أول متاح بالترتيب
function resolveProvider(id) {
  if (id) {
    const p = getProvider(id);
    if (p && p.isAvailable()) return p;
  }
  const first = getAvailableProviders()[0];
  if (!first) {
    const err = new Error('tts-failed');
    err.code = 'tts-failed';
    throw err;
  }
  return first;
}

for (const p of builtinProviders) registerProvider(p);

// ===== تقسيم النص إلى مقاطع على حدود الجمل =====
// السقف الافتراضي من المزوّد الفعّال: سقف الطلب الواحد يخصّ المزوّد لا النظام.
function splitIntoChunks(text, maxLen) {
  let limit = maxLen;
  if (!limit) {
    const active = getAvailableProviders()[0];
    limit = (active && active.maxChunkChars) || DEFAULT_CHUNK_LEN;
  }
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }
    const slice = remaining.slice(0, limit);
    let cut = -1;
    for (let i = slice.length - 1; i >= 0; i--) {
      if (SENTENCE_BOUNDS.includes(slice[i])) {
        cut = i + 1;
        break;
      }
    }
    if (cut <= 0) cut = limit; // لا توجد حدود جمل → قص إجباري
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  return chunks;
}

// ===== دمج مقاطع mp3 في ملف واحد عبر ffmpeg concat =====
async function concatMp3s(chunkBuffers) {
  if (chunkBuffers.length === 1) return chunkBuffers[0];

  const tmpDir = path.join(os.tmpdir(), 'aralink');
  const stamp = randomUUID().slice(0, 8);
  const listPath = path.join(tmpDir, `list-${stamp}.txt`);
  const outPath = path.join(tmpDir, `out-${stamp}.mp3`);
  const chunkFiles = [];

  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    for (let i = 0; i < chunkBuffers.length; i++) {
      const fname = `chunk-${stamp}-${i}.mp3`;
      fs.writeFileSync(path.join(tmpDir, fname), chunkBuffers[i]);
      chunkFiles.push(fname);
    }
    // أسماء ملفات نسبية لأن list.txt و chunk-*.mp3 في نفس المجلد (يتجنب مشاكل المسافات في Windows)
    fs.writeFileSync(listPath, chunkFiles.map((f) => `file '${f}'`).join('\n'));

    const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outPath];
    try {
      await execFileAsync('ffmpeg', args, { timeout: 60000 });
    } catch (err) {
      // احتياط: إعادة ترميز إذا فشل النسخ المباشر (عدم تطابق باراميترات الصوت)
      await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-b:a', '64k', outPath], { timeout: 60000 });
    }

    return fs.readFileSync(outPath);
  } finally {
    // تنظيف كل الملفات المؤقتة
    for (const f of chunkFiles) {
      try { fs.unlinkSync(path.join(tmpDir, f)); } catch { /* تجاهل */ }
    }
    try { fs.unlinkSync(listPath); } catch { /* تجاهل */ }
    try { fs.unlinkSync(outPath); } catch { /* تجاهل */ }
    try { fs.rmdirSync(tmpDir); } catch { /* تجاهل */ }
  }
}

// ===== الواجهة الرئيسية: نص → Buffer mp3 واحد =====
// opts اختياري: { provider?: string } — فرض مزوّد بعينه
async function textToMp3Buffer(text, lang = 'ar', opts) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    const err = new Error('invalid-text');
    err.code = 'invalid-text';
    throw err;
  }
  const clean = text.trim();
  if (clean.length > MAX_TEXT_LEN) {
    const err = new Error('text-too-long');
    err.code = 'text-too-long';
    throw err;
  }

  const provider = resolveProvider(opts && opts.provider);
  const chunks = splitIntoChunks(clean, provider.maxChunkChars);
  const buffers = [];
  try {
    for (const chunk of chunks) {
      buffers.push(await provider.synthesize(chunk, lang));
    }
  } catch (err) {
    const wrapped = new Error(`tts-failed: ${err.message}`);
    wrapped.code = 'tts-failed';
    throw wrapped;
  }
  return concatMp3s(buffers);
}

// ===== الواجهة الصوتية: نص + صوت المتحدث → Buffer mp3 =====
// voice: { gender } أو اسم صوت Edge مباشرة. السلسلة: Edge (إن مفعّل ومعرّف)
// ← gTTS (احتياطي دائم). النصوص الطويلة (>1500 حرف) تذهب لـ gTTS مباشرة
// لأن Edge أبطأ عليها والدمج المقطعي موجود أصلًا هناك.
const EDGE_TEXT_LIMIT = 1500;
async function textToMp3BufferWithVoice(text, lang = 'ar', voice = null) {
  const clean = String(text || '').trim();
  if (!clean) {
    const err = new Error('invalid-text');
    err.code = 'invalid-text';
    throw err;
  }
  let config = null;
  try { config = require('./config'); } catch { /* بلا إعدادات */ }
  const engine = (config && config.TTS_ENGINE) || 'edge';
  if (engine !== 'gtts' && clean.length <= EDGE_TEXT_LIMIT) {
    try {
      const { edgeVoiceFor } = require('./dubbing/voice-manager');
      const edge = require('./edge-tts');
      const voiceName = typeof voice === 'string' ? voice
        : edgeVoiceFor(lang, voice && voice.gender);
      if (voiceName) return await edge.synthesize(clean, { voice: voiceName });
    } catch (e) {
      // فشل Edge (بما فيه cooling) → سقوط صامت إلى gTTS أدناه
      if (e && (e.code === 'invalid-text' || e.code === 'text-too-long')) throw e;
    }
  }
  return textToMp3Buffer(clean, lang);
}

module.exports = {
  textToMp3Buffer,
  splitIntoChunks,
  textToMp3BufferWithVoice,
  // ===== سجل المزوّدين =====
  registerProvider,
  getProviders,
  getProvider,
  getAvailableProviders,
  resolveProvider,
};
