// server/providers/tts/index.js — مزوّدو النطق المدمجون بترتيب الأولوية
// إضافة مزوّد (Azure، ElevenLabs، XTTS، محلي…) = ملف جديد + سطر هنا.
module.exports = [
  require('./gtts'),
];
