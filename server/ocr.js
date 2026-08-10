// server/ocr.js — محرك التعرف الضوئي (OCR) عبر tesseract.js
// يُستدعى من routes-ocr.js (POST /api/ocr): صورة base64 → نص
// ملاحظة: ملفات traineddata تُحمَّل مسبقًا عبر `npm run download:ocr`
// ولا يُعتمد على الشبكة وقت الطلب (offline بعد التحميل الأول)
const { createWorker } = require('tesseract.js');
const fs = require('fs');
const path = require('path');

// لغات OCR: العربية + الإنجليزية
const OCR_LANGS = 'ara+eng';

// server/ocr/traineddata/ — مجلد ملفات التدريب المحلية
const DATA_DIR = path.join(__dirname, 'ocr', 'traineddata');

// أسماء الملفات المطلوبة للعمل دون اتصال
const REQUIRED_FILES = ['ara.traineddata.gz', 'eng.traineddata.gz'];

// ===== فحص جاهزية ملفات التدريب =====
// إن لم توجد الملفات → خطأ برمز ocr-not-ready يوجّه إلى npm run download:ocr
function ensureTraineddata() {
  const missing = REQUIRED_FILES.filter((f) => !fs.existsSync(path.join(DATA_DIR, f)));
  if (missing.length) {
    const err = new Error(
      `ملفات traineddata ناقصة: ${missing.join(', ')} — شغّل npm run download:ocr`
    );
    err.code = 'ocr-not-ready';
    throw err;
  }
}

// ===== تعرّف على صورة (Buffer) → { text, confidence } =====
// worker جديد لكل طلب (نمط آمن — لا مشاركة حالة بين الطلبات)
async function recognizeImage(buffer) {
  ensureTraineddata();
  let worker = null;
  try {
    let progress = 0;
    worker = await createWorker(OCR_LANGS, 1, {
      langPath: DATA_DIR,
      cachePath: DATA_DIR,
      cacheMethod: 'write',
      logger: (m) => {
        if (m.status === 'recognizing text') progress = m.progress;
      },
    });
    const { data } = await worker.recognize(buffer);
    return {
      text: String(data.text || '').trim(),
      confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // تجاهل — التنظيف فقط
      }
    }
  }
}

module.exports = { recognizeImage, ensureTraineddata, OCR_LANGS, DATA_DIR };
