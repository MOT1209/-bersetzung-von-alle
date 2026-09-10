// server/routes-tts.js — مسار تحويل النص إلى صوت (POST /api/tts)
// Uses EdgeTTS (natural voice) with gTTS fallback for long text or Edge failures.
const express = require('express');
const { textToMp3BufferWithVoice } = require('./tts');
const { sendError: _sendError } = require('./errorHelpers');

const router = express.Router();

const TTS_MAX_TEXT = 10000;

// ===== استجابة خطأ موحدة (izu errorHelpers) =====
function sendError(res, e) {
  return _sendError(res, e, { label: 'tts', detail: false });
}

router.post('/tts', async (req, res) => {
  const { text, lang, voice, gender, rate } = req.body || {};

  // ── التحقق من المدخلات قبل أي عمل ──
  const rawText = typeof text === 'string' ? text : '';
  if (!rawText.trim()) {
    return res.status(422).json({ error: 'invalid-text' });
  }
  if (rawText.length > TTS_MAX_TEXT) {
    return res.status(413).json({ error: 'text-too-long' });
  }

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
    return sendError(res, err);
  }
});

module.exports = router;
