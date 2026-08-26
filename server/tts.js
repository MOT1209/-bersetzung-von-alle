// server/tts.js — تحويل النص إلى صوت mp3 (gTTS مجاني) ودمج المقاطع الطويلة بـ ffmpeg
// ملاحظة: لا نستخدم msedge-tts — تم التحقق من أنه معطل في هذه البيئة.
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { randomUUID } = require('crypto');

const execFileAsync = promisify(execFile);

// ===== ثوابت =====
const GTTs_URL = 'https://translate.google.com/translate_tts';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_TEXT_LEN = 5000; // حد أقصى لإجمالي النص
const MAX_CHUNK_LEN = 180; // كل طلب gTTS لا يتحمل أكثر من ~180 حرفًا
const REQUEST_TIMEOUT = 20000; // مهلة طلب gTTS (مللي ثانية)
const SENTENCE_BOUNDS = ['.', '!', '?', '؟', '…', '\n'];

// ===== تقسيم النص إلى مقاطع ≤180 حرفًا على حدود الجمل =====
function splitIntoChunks(text) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_LEN) {
      chunks.push(remaining);
      break;
    }
    const slice = remaining.slice(0, MAX_CHUNK_LEN);
    let cut = -1;
    for (let i = slice.length - 1; i >= 0; i--) {
      if (SENTENCE_BOUNDS.includes(slice[i])) {
        cut = i + 1;
        break;
      }
    }
    if (cut <= 0) cut = MAX_CHUNK_LEN; // لا توجد حدود جمل → قص إجباري
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  return chunks;
}

// ===== جلب mp3 لقطعة نصية واحدة من gTTS =====
async function fetchChunk(text, lang) {
  const url = `${GTTs_URL}?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  if (!res.ok) throw new Error(`gTTS HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error('gTTS returned empty audio');
  return buf;
}

// ===== دمج مقاطع mp3 في ملف واحد عبر ffmpeg concat =====
async function concatMp3s(chunkBuffers) {
  if (chunkBuffers.length === 1) return chunkBuffers[0];

  const tmpDir = path.join(os.tmpdir(), 'aralink');
  const stamp = randomUUID().slice(0,8);
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
async function textToMp3Buffer(text, lang = 'ar') {
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

  const chunks = splitIntoChunks(clean);
  const buffers = [];
  try {
    for (const chunk of chunks) {
      buffers.push(await fetchChunk(chunk, lang));
    }
  } catch (err) {
    const wrapped = new Error(`tts-failed: ${err.message}`);
    wrapped.code = 'tts-failed';
    throw wrapped;
  }
  return concatMp3s(buffers);
}

module.exports = { textToMp3Buffer, splitIntoChunks };
