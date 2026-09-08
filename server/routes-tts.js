// server/routes-tts.js — مسار تحويل النص إلى صوت (POST /api/tts)
// Uses EdgeTTS (natural voice) with gTTS fallback for long text or Edge failures.
const express = require('express');
const { textToMp3BufferWithVoice } = require('./tts');

const router = express.Router();

router.post('/tts', async (req, res) => {
  const { text, lang, voice, gender, rate } = req.body || {};
  try {
    // Build voice option: string voice name, { gender } object, or null (default by lang)
    const voiceOption = voice
      ? voice
      : (gender ? { gender } : null);
    const buffer = await textToMp3BufferWithVoice(text, lang || 'ar', voiceOption, {
      rate: Number(rate) || 1,
    });
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
