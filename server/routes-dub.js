// server/routes-dub.js — الدبلجة: مقاطع الترجمة → مقاطع صوتية مُوقّتة (POST /api/dub)
//
// الواجهة ترسل دفعة صغيرة من المقاطع قبل موضع التشغيل بقليل، لا الفيديو كاملًا:
// فيديو من عشر دقائق يعني ~150 مقطعًا، وتوليدها دفعة واحدة يعني انتظارًا طويلًا
// وحمولة ضخمة. الدفعات تجعل الدبلجة تبدأ فورًا وتبقى الذاكرة محدودة.
const express = require('express');
const tts = require('./tts');
const { isSupportedLang } = require('./languages');

// وصول وقت التشغيل لا استيراد مفكَّك — الاستيراد المفكَّك يجمّد المرجع فيتعذّر
// استبداله في الاختبارات (نفس القاعدة في routes-translate.js وroutes-sse.js).
const textToMp3Buffer = (...a) => tts.textToMp3Buffer(...a);

const router = express.Router();

const MAX_SEGMENTS = 40; // لكل طلب — الواجهة تطلب دفعات صغيرة
// 180 حرفًا هو حدّ طلب gTTS الواحد (MAX_CHUNK_LEN في tts.js). البقاء تحته يضمن
// أن كل مقطع طلبٌ واحد بلا دمج ffmpeg — وffmpeg قد لا يكون مثبتًا أصلًا.
const MAX_TEXT = 180;
const CONCURRENCY = 4; // توازٍ محدود حتى لا نُغرق gTTS فيحظرنا

function clampText(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (text.length <= MAX_TEXT) return text;
  const cut = text.slice(0, MAX_TEXT);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > MAX_TEXT * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

router.post('/dub', async (req, res) => {
  const { segments, lang } = req.body || {};

  if (!Array.isArray(segments) || segments.length === 0) {
    return res.status(422).json({ error: 'invalid-segments' });
  }
  if (segments.length > MAX_SEGMENTS) {
    return res.status(422).json({ error: 'too-many-segments' });
  }

  const target = isSupportedLang(lang) ? lang : 'ar';
  const out = new Array(segments.length);

  let next = 0;
  async function worker() {
    while (next < segments.length) {
      const idx = next++;
      const seg = segments[idx] || {};
      const start = Number(seg.start) || 0;
      const text = clampText(seg.text);
      if (!text) {
        out[idx] = { start, audio: null };
        continue;
      }
      try {
        const buf = await textToMp3Buffer(text, target);
        out[idx] = { start, audio: buf.toString('base64') };
      } catch {
        // مقطع واحد فاشل لا يُسقط الدفعة — الدبلجة تتخطاه وتكمل
        out[idx] = { start, audio: null };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, segments.length) }, worker)
  );

  res.json({ lang: target, segments: out });
});

module.exports = router;
