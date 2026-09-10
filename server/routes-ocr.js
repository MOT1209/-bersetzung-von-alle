// server/routes-ocr.js — نقطة التعرف الضوئي OCR
// POST /api/ocr → { text, confidence }
const express = require('express');
const { sendError: _sendError } = require('./errorHelpers');

const router = express.Router();

// راوتر خاص بحد جسم أكبر (15mb) — يُركَّب قبل express.json العام في server.js
router.use(express.json({ limit: '15mb' }));

// ===== الصيغ المدعومة =====
const SUPPORTED_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp'];

// ===== استجابة خطأ موحدة (izu errorHelpers) =====
function sendError(res, e) {
  return _sendError(res, e, { label: 'ocr', detail: false });
}

// ===== POST /api/ocr — صورة base64 → نص =====
// body: { content (base64), ext }
router.post('/ocr', async (req, res) => {
  const { content, ext } = req.body || {};

  // 1) الصيغة مدعومة؟ (png/jpg/jpeg/webp/bmp)
  if (!SUPPORTED_EXT.includes(String(ext || '').toLowerCase())) {
    return res.status(400).json({ error: 'invalid-format' });
  }
  // 2) content سلسلة base64 ≤ 15MB — يمنع استهلاك الذاكرة من الأجسام الضخمة
  if (typeof content !== 'string' || !content.length || content.length > 15 * 1024 * 1024) {
    return res.status(400).json({ error: 'invalid-file' });
  }
  try {
    // وصول وقت التنفيذ — يسمح بتزييف الدوال في الاختبارات
    const ocr = require('./ocr');
    // 3) جاهزية ملفات التدريب (503 إن ناقصة)
    ocr.ensureTraineddata();

    const buffer = Buffer.from(content, 'base64');
    const result = await ocr.recognizeImage(buffer);

    // 4) نتيجة فارغة؟ → 422
    if (!result.text) {
      return res.status(422).json({ error: 'ocr-empty' });
    }
    res.json({ text: result.text, confidence: result.confidence });
  } catch (e) {
    return sendError(res, e);
  }
});

module.exports = router;
