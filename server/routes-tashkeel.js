// server/routes-tashkeel.js — نقطة تشكيل النص العربي
// POST /api/tashkeel → { diacritized, engine: 'gemini'|'basic' }
const express = require('express');
const { diacritize } = require('./tashkeel'); // وصول وقت التنفيذ — يسمح بتزييف الدوال في الاختبارات

const router = express.Router();

// راوتر خاص بحد جسم أكبر (2mb) — يُركَّب قبل express.json العام في server.js
router.use(express.json({ limit: '2mb' }));

// ===== خريطة رمز الخطأ → حالة HTTP (قالب موحد مثل routes-translate.js) =====
const ERROR_STATUS = {
  'invalid-text': 400,
  'input-too-large': 413,
  'server-error': 500,
};

// ===== استجابة خطأ موحدة =====
function sendError(res, e) {
  const code = (e && e.code) || 'server-error';
  const status = ERROR_STATUS[code] || 500;
  console.error('[tashkeel] error:', code, '→', e && e.message);
  return res.status(status).json({ error: code });
}

// ===== POST /api/tashkeel — تشكيل نص عربي =====
// body: { text }
router.post('/tashkeel', async (req, res) => {
  const { text } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'invalid-text' });
  }
  // حد حجم النص (حوالي 200 ألف حرف) — يمنع استهلاك الذاكرة/تعليق الخادم
  if (String(text).length > 200000) {
    return res.status(413).json({ error: 'input-too-large' });
  }
  try {
    // engine حسب المسار الفعلي: 'gemini' إن نجح Gemini، وإلا 'basic'
    const { diacritized, engine } = await diacritize(String(text));
    res.json({ diacritized, engine });
  } catch (e) {
    console.error('[tashkeel] error:', e.message);
    return sendError(res, e);
  }
});

module.exports = router;
