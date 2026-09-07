// server/routes-youtube.js — بيانات يوتيوب الوصفية عبر الواجهة الرسمية
// GET /api/youtube/metadata?url=<رابط أو معرّف>
//
// المسار المتوافق: البيانات الوصفية فقط. نص الترجمات لا يُتاح رسميًا لطرف ثالث
// (captions.download يتطلب OAuth بحساب المالك) — انظر server/youtubeApi.js.
const express = require('express');
const youtubeApi = require('./youtubeApi'); // وصول وقت التنفيذ — يسمح بالتزييف في الاختبارات

const router = express.Router();

// ===== خريطة رمز الخطأ → حالة HTTP (نفس قالب بقية المسارات) =====
const ERROR_STATUS = {
  'invalid-url': 400,
  'video-not-found': 404,
  'youtube-quota': 429,
  'youtube-api-disabled': 503,
  'youtube-api-failed': 502,
  'server-error': 500,
};

function sendError(res, e) {
  const raw = e && e.code;
  const code = typeof raw === 'string' && ERROR_STATUS[raw] ? raw : 'server-error';
  const status = ERROR_STATUS[code] || 500;
  console.error('[youtube] error:', code, '→', e && e.message);
  return res.status(status).json({ error: code });
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
