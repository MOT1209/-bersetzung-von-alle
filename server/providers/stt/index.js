// server/providers/stt/index.js — محرّكات التفريغ المدمجة بترتيب الأولوية
// sherpa أولًا (أسرع بكثير)، وtransformers احتياطي. الاختيار الفعلي في
// audio.js يحترم STT_ENGINE ثم التوفّر ثم يسقط للتالي عند فشل غير مُصنَّف.
module.exports = [
  require('./sherpa'),
  require('./transformers'),
];
