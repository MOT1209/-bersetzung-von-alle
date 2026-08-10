// server/routes-tts.js — مسار تحويل النص إلى صوت (POST /api/tts)
const express = require('express');
const { textToMp3Buffer } = require('./tts');

const router = express.Router();

router.post('/tts', async (req, res) => {
  const { text, lang } = req.body || {};
  try {
    const buffer = await textToMp3Buffer(text, lang || 'ar');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  } catch (err) {
    const code = err && err.code ? err.code : 'tts-failed';
    const status = code === 'invalid-text' || code === 'text-too-long' ? 422 : 502;
    res.status(status).json({ error: code });
  }
});

module.exports = router;
