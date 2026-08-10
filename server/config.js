// server/config.js — تحميل الإعدادات من .env
require('dotenv').config();
const path = require('path');

// مجلد نماذج التفريغ الصوتي (لا يُدرج في git)
const MODEL_DIR = process.env.MODEL_DIR || path.join(__dirname, '..', 'models');

module.exports = {
  PORT: process.env.PORT || 3000,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  WHISPER_MODEL: process.env.WHISPER_MODEL || 'Xenova/whisper-tiny', // whisper-tiny: سريع؛ whisper-base أدق لكنه أبطأ بكثير

  // محرك التفريغ الصوتي: 'sherpa' (أسرع بكثير، sherpa-onnx) أو 'transformers' (الاحتياطي Xenova)
  // إن لم يكن sherpa-onnx مثبتًا أو فشل تحميل نموذجه يعود audio.js تلقائيًا إلى 'transformers'
  STT_ENGINE: process.env.STT_ENGINE || 'sherpa',

  // نموذج sherpa-onnx: whisper-tiny متعدد اللغات (يدعم 100+ لغة، int8 ~75MB) من HuggingFace
  // المسارات قابلة للتعديل عبر المتغيرات؛ يُنزَّل النموذج تلقائيًا عند أول تشغيل ويُخزَّن محليًا
  SHERPA_MODEL_DIR: process.env.SHERPA_MODEL_DIR || path.join(MODEL_DIR, 'sherpa-whisper-tiny'),
  SHERPA_ENCODER: process.env.SHERPA_ENCODER || '', // يُملأ تلقائيًا من SHERPA_MODEL_DIR
  SHERPA_DECODER: process.env.SHERPA_DECODER || '',
  SHERPA_TOKENS: process.env.SHERPA_TOKENS || '',
};
