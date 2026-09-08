// server/providers/stt/transformers.js — محرك التفريغ الاحتياطي (@xenova/transformers)
//
// ⚠️ تنبيه أمني موثّق في CURRENT_STATE.md §6: هذه الحزمة تجرّ سلسلة
// onnxruntime-web → onnx-proto → protobufjs وفيها ثغرة حرجة بلا إصلاح أعلى
// المجرى (2.17.2 هو الأحدث). قابلية الوصول منخفضة (تتطلب نموذج ONNX خبيثًا،
// والنماذج يجلبها التطبيق من Hugging Face لا المستخدم). الخليفة
// @huggingface/transformers@4.x يُسقط تلك السلسلة — انتقال يحتاج تحقّقًا فعليًا.
const config = require('../../config');
const { normalizeLang } = require('./lang');

// استيراد كسول: كان require عند القمة فيعتمد إقلاع الخادم كله على اعتمادية
// أصلية ثقيلة. ثبت عمليًا داخل Docker أن غياب onnxruntime-node (اعتمادية
// اختيارية) منع الإقلاع أصلًا بدل أن يعطّل التفريغ وحده.
let transformers = null;
function loadTransformers() {
  if (!transformers) {
    transformers = require('@xenova/transformers');
    const { env } = transformers;
    if (env && env.backends && env.backends.onnx) {
      env.backends.onnx.numThreads = 4; // onnxruntime-node الأحدث يستفيد من الخيوط المتعددة
    }
  }
  return transformers;
}

// مفرد: أنبوب Whisper يُحمَّل مرة واحدة فقط
let sttPromise = null;
function getPipeline() {
  if (!sttPromise) {
    const { pipeline, env } = loadTransformers();
    env.allowLocalModels = false; // نحمّل النموذج من Hugging Face وليس محليًا
    sttPromise = pipeline('automatic-speech-recognition', config.WHISPER_MODEL).catch((e) => {
      sttPromise = null; // نسمح بإعادة المحاولة في المرة القادمة
      throw e;
    });
  }
  return sttPromise;
}

// chunk_length_s ضروري: بدونه يحذّر transformers من الصوت الأطول من 30 ثانية
// ثم يُخرج قمامة (سلاسل شرطات وتكرارًا) بدل نص. stride للتداخل بين القطع
// حتى لا تُبتر الكلمات عند الحدود.
function sttOptions(lang) {
  const o = { task: 'transcribe', return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 };
  const l = normalizeLang(lang);
  if (l !== 'auto') o.language = l;
  return o;
}

// transformers يعيد chunks بتنسيق { timestamp:[start,end], text }
function toSegments(res) {
  return (res.chunks || []).map((c) => {
    const ts = c.timestamp || [];
    return { start: ts[0] || 0, end: ts[1] || (ts[0] || 0) + 2, text: String(c.text || '') };
  });
}

async function transcribe(audio, lang) {
  const stt = await getPipeline();
  const res = await stt(audio, sttOptions(lang));
  return { text: res.text || '', segments: toSegments(res) };
}

module.exports = {
  id: 'transformers',
  label: '@xenova/transformers (whisper)',
  // الحزمة اعتمادية إنتاج معلنة، والفشل الحقيقي يظهر عند التحميل الكسول
  isAvailable: () => true,
  transcribe,
};
module.exports.toSegments = toSegments; // للاختبار المباشر
module.exports.sttOptions = sttOptions;
