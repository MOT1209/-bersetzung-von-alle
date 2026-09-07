// server/routes-local-video.js — فيديو/صوت محلي: رفع → تفريغ (STT) → ترجمة → ترجمات
// POST /api/video-local → { type:'local-video', sourceLang, captions, meta }
//
// ═══ التنفيذ يمرّ بمحرك الوظائف (server/jobs) ═══
// العمل هنا هو الأثقل في المشروع (التفريغ ~5.5× مدة الفيديو)، وكان يعمل بلا سقف
// تزامن: عشرة طلبات متزامنة تستهلك المعالج بالكامل. الآن يمرّ كل تنفيذ عبر
// الطابور المشترك، **وعقد المسار المتزامن لم يتغيّر** (نفس الجسم ونفس الأخطاء)
// — الفارق أن الطلب الحادي عشر ينتظر دوره بدل أن يزاحم العشرة.
//
// وضع غير متزامن اختياري: { async: true } يعيد 202 ومعرّف وظيفة، فيتابعها
// العميل عبر GET /api/jobs/:id أو بثّ /api/jobs/:id/stream — وهو المسار الذي
// يتجاوز مهلة الطلب للفيديوهات الطويلة.
const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const config = require('./config');
const jobs = require('./jobs');

const router = express.Router();

// ===== الصيغ المدعومة (فيديو + صوت) =====
const SUPPORTED_EXT = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', '3gp', 'mp3', 'wav', 'm4a', 'ogg'];
const MAX_BASE64 = 40 * 1024 * 1024; // ~40MB فيديو (base64) — يحمي الذاكرة

const JOB_TYPE = 'video-local';

// ===== خريطة رمز الخطأ → حالة HTTP =====
const ERROR_STATUS = {
  'invalid-format': 400,
  'invalid-file': 400,
  'video-too-long': 422,
  'audio-empty': 422,
  'translate-failed': 502,
  'queue-full': 503,
  'server-error': 500,
};

function codeError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function sendError(res, e) {
  const code = (e && e.code) || 'server-error';
  const status = ERROR_STATUS[code] || 500;
  console.error('[local-video] error:', code, '→', e && e.message);
  const body = { error: code };
  // نحافظ على تفصيل العقد: الواجهة تعرض الحد للمستخدم
  if (code === 'video-too-long') body.maxMinutes = config.LOCAL_VIDEO_MAX_MIN;
  return res.status(status).json(body);
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

// ===== منطق الوظيفة: ملف مؤقت → مدة → تفريغ → ترجمة =====
// يعمل داخل الطابور، ويبلّغ التقدّم لكل مرحلة (يستهلكه بثّ /api/jobs/:id/stream)
async function runLocalVideoJob(payload, ctx) {
  const { content, format, targetLang = 'ar', provider, providers } = payload;
  const tmpFile = path.join(os.tmpdir(), 'aralink-local-' + randomUUID() + '.' + format);

  try {
    // 1) حفظ الوسائط مؤقتًا
    ctx.progress('saving', 5);
    fs.writeFileSync(tmpFile, Buffer.from(content, 'base64'));

    // 2) حد المدة قبل أي عمل ثقيل (أرخص بكثير من التفريغ ثم الرفض)
    ctx.progress('probing', 15);
    let durationSec = 0;
    try {
      durationSec = await impl.probeDuration(tmpFile);
    } catch (e) {
      throw codeError('invalid-file');
    }
    if (durationSec > config.LOCAL_VIDEO_MAX_MIN * 60) throw codeError('video-too-long');

    // 3) التفريغ الصوتي (المرحلة الأثقل)
    ctx.progress('transcribing', 30);
    if (ctx.signal.aborted) throw codeError('job-cancelled');
    // تفكيك وقت التنفيذ — يسمح بتزييف transcribeMediaFile في الاختبارات
    const { transcribeMediaFile } = require('./audio');
    const { chunks } = await transcribeMediaFile(tmpFile, 'local-' + format);
    if (!Array.isArray(chunks) || !chunks.length) throw codeError('audio-empty');

    // 4) الترجمة عبر المسار المشترك (محاذاة 1:1 + كاش)
    ctx.progress('translating', 70);
    if (ctx.signal.aborted) throw codeError('job-cancelled');
    const { translateLines } = require('./routes-translate');
    const lines = chunks.map((c) => ({
      start: c.start || 0,
      duration: c.duration || 2000,
      original: c.text || '',
    }));
    const { sourceLang, captions, cached } = await translateLines(lines, targetLang, { provider, providers });

    return {
      type: 'local-video',
      sourceLang,
      captions,
      meta: {
        source: 'audio',
        durationSec: Math.round(durationSec),
        cached,
        maxMinutes: config.LOCAL_VIDEO_MAX_MIN,
      },
    };
  } finally {
    // تنظيف الملف المؤقت دائمًا — نجاحًا أو فشلًا أو إلغاءً
    await fs.promises.unlink(tmpFile).catch(() => {});
  }
}

jobs.registerHandler(JOB_TYPE, runLocalVideoJob);

// ===== POST /api/video-local =====
// body: { content (base64), ext, targetLang?, provider?, providers?, async? }
router.post('/video-local', express.json({ limit: '60mb' }), async (req, res) => {
  const { content, ext, targetLang = 'ar', provider, providers, async: asyncMode } = req.body || {};
  const format = String(ext || '').toLowerCase();

  // التحقق يبقى متزامنًا: رفض المدخل الخاطئ لا يستحق مقعدًا في الطابور
  if (!SUPPORTED_EXT.includes(format)) {
    return res.status(400).json({ error: 'invalid-format' });
  }
  if (typeof content !== 'string' || !content.length || content.length > MAX_BASE64) {
    return res.status(400).json({ error: 'invalid-file' });
  }

  const payload = { content, format, targetLang, provider, providers };

  try {
    if (asyncMode) {
      // 202: العمل قُبل ولم ينتهِ — يتابعه العميل عبر /api/jobs/:id
      const job = jobs.enqueue(JOB_TYPE, payload);
      return res.status(202).json({ jobId: job.id, status: job.status, statusUrl: `/api/jobs/${job.id}`, streamUrl: `/api/jobs/${job.id}/stream` });
    }
    // المسار المتزامن: نفس العقد السابق تمامًا، لكنه يمرّ بسقف التزامن
    const result = await jobs.run(JOB_TYPE, payload);
    return res.status(200).json(result);
  } catch (e) {
    return sendError(res, e);
  }
});

module.exports = router;
module.exports.probeDuration = probeDuration; // للتزييف في الاختبارات
module.exports.impl = impl; // حاوية قابلة للتزييف (probeDuration)
module.exports.runLocalVideoJob = runLocalVideoJob;
module.exports.JOB_TYPE = JOB_TYPE;
