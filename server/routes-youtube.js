// server/routes-youtube.js — بيانات يوتيوب الوصفية عبر الواجهة الرسمية
// GET /api/youtube/metadata?url=<رابط أو معرّف>
//
// المسار المتوافق: البيانات الوصفية فقط. نص الترجمات لا يُتاح رسميًا لطرف ثالث
// (captions.download يتطلب OAuth بحساب المالك) — انظر server/youtubeApi.js.
const express = require('express');
const youtubeApi = require('./youtubeApi'); // وصول وقت التنفيذ — يسمح بالتزييف في الاختبارات
const { sendError: _sendError } = require('./errorHelpers');

const router = express.Router();

// ===== استجابة خطأ موحدة (izu errorHelpers) =====
function sendError(res, e) {
  return _sendError(res, e, { label: 'youtube', detail: false });
}

// ===== GET /api/youtube/metadata =====
router.get('/youtube/metadata', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'invalid-url' });
  }
  if (url.length > 2000) {
    return res.status(413).json({ error: 'input-too-large' });
  }
  try {
    const meta = await youtubeApi.getVideoMetadata(url);
    res.json({
      ...meta,
      // عقد صريح للواجهة: الترجمات ليست قابلة للجلب رسميًا حتى لو وُجدت.
      // بدونه ستفترض الواجهة أن hasCaptions=true يعني أن النص متاح.
      captionsAvailableToUs: false,
      contentSource: 'upload-required',
    });
  } catch (e) {
    return sendError(res, e);
  }
});

module.exports = router;
