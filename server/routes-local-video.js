// server/routes-local-video.js — فيديو/صوت محلي: رفع → تفريغ (STT) → ترجمة → ترجمات
// POST /api/video-local → { type:'local-video', sourceLang, captions, meta }
const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');

const router = express.Router();

// راوتر خاص بحد جسم أكبر (60mb — فيديو base64) — يُركَّب قبل express.json العام في server.js
router.use(express.json({ limit: '60mb' }));

// ===== الصيغ المدعومة (فيديو + صوت) =====
const SUPPORTED_EXT = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', '3gp', 'mp3', 'wav', 'm4a', 'ogg'];
const MAX_BASE64 = 40 * 1024 * 1024; // ~40MB فيديو (base64) — يحمي الذاكرة على هذا الجهاز

// ===== خريطة رمز الخطأ → حالة HTTP (قالب موحد مثل routes-file.js) =====
const ERROR_STATUS = {
  'invalid-format': 400,
  'invalid-file': 400,
  'video-too-long': 422,
  'audio-empty': 422,
  'translate-failed': 502,
  'server-error': 500,
};

// ===== استجابة خطأ موحدة =====
function sendError(res, e) {
  const code = (e && e.code) || 'server-error';
  const status = ERROR_STATUS[code] || 500;
  console.error('[local-video] error:', code, '→', e && e.message);
  return res.status(status).json({ error: code });
}

// ===== فحص مدة الملف عبر ffprobe (مُصدَّرة للتزييف في الاختبارات) =====
function probeDuration(file) {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
      { timeout: 15000 },
      (err, stdout) => {
        if (err) return reject(err);
        const sec = parseFloat(String(stdout).trim());
        if (!Number.isFinite(sec) || sec < 0) return reject(new Error('ffprobe: مدة غير صالحة'));
        resolve(sec);
      }
    );
  });
}

// ===== حاوية التنفيذ — تُستدعى عبر impl حتى يمكن تزييفها في الاختبارات =====
const impl = { probeDuration };

// ===== POST /api/video-local — فيديو محلي base64 → captions مترجمة =====
// body: { content (base64), ext, targetLang?, provider?, providers? }
router.post('/video-local', async (req, res) => {
  const { content, ext, targetLang = 'ar', provider, providers } = req.body || {};
  const format = String(ext || '').toLowerCase();

  // 1) الصيغة مدعومة؟
  if (!SUPPORTED_EXT.includes(format)) {
    return res.status(400).json({ error: 'invalid-format' });
  }
  // 2) content سلسلة base64 ضمن الحد
  if (typeof content !== 'string' || !content.length || content.length > MAX_BASE64) {
    return res.status(400).json({ error: 'invalid-file' });
  }

  // ملف مؤقت فريد (يُنظَّف قبل إرسال أي رد — لا سباق)
  const tmpFile = path.join(
    os.tmpdir(),
    'aralink-local-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + format
  );

  // يرسل الاستجابة بعد حذف الملف المؤقت أولًا — يضمن عدم بقاء ملفات بعد عودة fetch
  const respond = async (status, body) => {
    await fs.promises.unlink(tmpFile).catch(() => {});
    return res.status(status).json(body);
  };

  try {
    // 3) حفظ الفيديو مؤقتًا
    fs.writeFileSync(tmpFile, Buffer.from(content, 'base64'));

    // 4) حد المدة (config.LOCAL_VIDEO_MAX_MIN دقيقة)
    let durationSec = 0;
    try {
      durationSec = await impl.probeDuration(tmpFile);
    } catch {
      // ffprobe فشل (ملف تالف؟) — نكمل بدون حد مدة صارم؛ التفريغ سيفشل لاحقًا بخطأ واضح
    }
    if (durationSec > config.LOCAL_VIDEO_MAX_MIN * 60) {
      return await respond(422, { error: 'video-too-long', maxMinutes: config.LOCAL_VIDEO_MAX_MIN });
    }

    // 5) تفريغ صوتي محلي (سيركا-onnx — وصول وقت التنفيذ ليمكن تزييفه في الاختبارات)
    const { transcribeMediaFile } = require('./audio');
    const { chunks } = await transcribeMediaFile(tmpFile, 'local-' + format);
    if (!Array.isArray(chunks) || !chunks.length) {
      return await respond(422, { error: 'audio-empty' });
    }

    // 6) ترجمة المقاطع عبر المسار المشترك (محاذاة 1:1 + كاش — وصول وقت التنفيذ)
    const { translateLines } = require('./routes-translate');
    const lines = chunks.map((c) => ({
      start: c.start || 0,
      duration: c.duration || 2000,
      original: c.text || '',
    }));
    const { sourceLang, captions, cached } = await translateLines(lines, targetLang, { provider, providers });

    // 7) النجاح — حذف قبل الرد
    return await respond(200, {
      type: 'local-video',
      sourceLang,
      captions,
      meta: { source: 'audio', durationSec: Math.round(durationSec), cached, maxMinutes: config.LOCAL_VIDEO_MAX_MIN },
    });
  } catch (e) {
    // تنظيف قبل إرسال الخطأ أيضًا
    await fs.promises.unlink(tmpFile).catch(() => {});
    return sendError(res, e);
  }
});

module.exports = router;
module.exports.probeDuration = probeDuration; // للتزييف في الاختبارات
module.exports.impl = impl; // حاوية قابلة للتزييف (probeDuration)
