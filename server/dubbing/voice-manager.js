// server/dubbing/voice-manager.js — ربط المتحدثين بالأصوات
// البداية: male/female بالتناوب عبر gTTS (اللغة تحدد الصوت فعليًا).
// البنية تقبل voice IDs حقيقية لاحقًا (EdgeTTS/OpenAI) دون تغيير pipeline.
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

// خيارات مستقبلية: تمرير pitch/rate حسب الجنس عند توفر محرك يدعمها
function voiceParams(voice) {
  if (!voice) return {};
  return voice.gender === 'female' ? { pitch: '+2Hz' } : { pitch: '-2Hz' };
}

module.exports = { mapSpeakersToVoices, voiceParams, VOICE_POOL };
