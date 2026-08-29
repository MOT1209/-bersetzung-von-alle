// server/routes-dub.js — الدبلجة: مقاطع الترجمة → مقاطع صوتية مُوقّتة (POST /api/dub)
//
// الواجهة ترسل دفعة صغيرة من المقاطع قبل موضع التشغيل بقليل، لا الفيديو كاملًا:
// فيديو من عشر دقائق يعني ~150 مقطعًا، وتوليدها دفعة واحدة يعني انتظارًا طويلًا
// وحمولة ضخمة. الدفعات تجعل الدبلجة تبدأ فورًا وتبقى الذاكرة محدودة.
const express = require('express');
const tts = require('./tts');
const { isTtsSupported } = require('./languages');

// وصول وقت التشغيل لا استيراد مفكَّك — الاستيراد المفكَّك يجمّد المرجع فيتعذّر
// استبداله في الاختبارات (نفس القاعدة في routes-translate.js وroutes-sse.js).
const textToMp3Buffer = (...a) => tts.textToMp3Buffer(...a);
const splitIntoChunks = (...a) => tts.splitIntoChunks(...a);

const router = express.Router();

const MAX_SEGMENTS = 40; // لكل طلب — الواجهة تطلب دفعات صغيرة
// كل سطر يُنطق كقطعة أو أكثر ≤180 حرفًا (حدّ طلب gTTS الواحد). نُعيدها كمصفوفة
// تشغّلها الواجهة بالتتابع بدل دمجها بـ ffmpeg — ffmpeg قد لا يكون مثبتًا، وبتر
// النص عند 180 حرفًا كان يُسقط بقية الجملة صامتًا.
const MAX_CHUNKS_PER_SEGMENT = 3; // سطر ترجمة أطول من ذلك لا يلحق بتوقيته أصلًا
const CONCURRENCY = 4; // توازٍ محدود حتى لا نُغرق gTTS فيحظرنا

router.post('/dub', async (req, res) => {
  const { segments, lang } = req.body || {};

  if (!Array.isArray(segments) || segments.length === 0) {
    return res.status(422).json({ error: 'invalid-segments' });
  }
  if (segments.length > MAX_SEGMENTS) {
    return res.status(422).json({ error: 'too-many-segments' });
  }
  // لغة الترجمة أوسع من لغة النطق: بلا هذه البوابة يمرّ الطلب ثم يفشل عند gTTS
  // فتصل المستخدم دبلجة صامتة بلا تفسير.
  if (!isTtsSupported(lang)) {
    return res.status(422).json({ error: 'dub-lang-unsupported' });
  }

  const out = new Array(segments.length);
  let failed = 0;

  let next = 0;
  async function worker() {
    while (next < segments.length) {
      const idx = next++;
      const seg = segments[idx] || {};
      const start = Number(seg.start) || 0;
      const text = String(seg.text || '').replace(/\s+/g, ' ').trim();
      if (!text) {
        out[idx] = { start, audio: [] };
        continue;
      }
      const chunks = splitIntoChunks(text).slice(0, MAX_CHUNKS_PER_SEGMENT);
      try {
        const parts = [];
        for (const chunk of chunks) {
          parts.push((await textToMp3Buffer(chunk, lang)).toString('base64'));
        }
        out[idx] = { start, audio: parts };
      } catch {
        // مقطع واحد فاشل لا يُسقط الدفعة — الدبلجة تتخطاه وتكمل
        out[idx] = { start, audio: [] };
        failed++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, segments.length) }, worker)
  );

  res.json({ lang, failed, segments: out });
});

module.exports = router;
