// server/dubbing/voice-manager.js — ربط المتحدثين بالأصوات
// البداية: male/female بالتناوب. مع EdgeTTS تُترجم إلى أصوات عصبية حقيقية
// (ShortName) لكل لغة؛ ومع gTTS يبقى التعيين منطقيًا فقط (gTTS بلا أصوات).
// إضافة لغة = سطر واحد في EDGE_VOICES. إضافة محرك = حقل جديد في كائن الصوت.
const EDGE_VOICES = {
  ar: { male: 'ar-SA-HamedNeural', female: 'ar-SA-ZariyahNeural' },
  en: { male: 'en-US-GuyNeural', female: 'en-US-JennyNeural' },
  de: { male: 'de-DE-ConradNeural', female: 'de-DE-KatjaNeural' },
  fr: { male: 'fr-FR-HenriNeural', female: 'fr-FR-DeniseNeural' },
  tr: { male: 'tr-TR-AhmetNeural', female: 'tr-TR-EmelNeural' },
  es: { male: 'es-ES-AlvaroNeural', female: 'es-ES-ElviraNeural' },
  ru: { male: 'ru-RU-DmitryNeural', female: 'ru-RU-SvetlanaNeural' },
};

const VOICE_POOL = [
  { id: 'voice_A', gender: 'male' },
  { id: 'voice_B', gender: 'female' },
  { id: 'voice_C', gender: 'male' },
  { id: 'voice_D', gender: 'female' },
];

function mapSpeakersToVoices(speakers) {
  const uniq = [...new Set(speakers)];
  const map = {};
  uniq.forEach((sp, i) => { map[sp] = VOICE_POOL[i % VOICE_POOL.length]; });
  return map;
}

// الصوت العصبي للغة والجنس — null إن لم تُعرَّف اللغة (يعود المتصل إلى gTTS)
function edgeVoiceFor(lang, gender) {
  const base = String(lang || '').toLowerCase().split('-')[0];
  const entry = EDGE_VOICES[base];
  if (!entry) return null;
  return entry[gender === 'female' ? 'female' : 'male'];
}

// خيارات مستقبلية: تمرير pitch/rate حسب الجنس عند توفر محرك يدعمها
function voiceParams(voice) {
  if (!voice) return {};
  return voice.gender === 'female' ? { pitch: '+2Hz' } : { pitch: '-2Hz' };
}

module.exports = { mapSpeakersToVoices, edgeVoiceFor, voiceParams, VOICE_POOL, EDGE_VOICES };
