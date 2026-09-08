// server/routes-youtube-dub.js — POST /api/youtube/dub + GET /api/jobs/:id + ملفات المشاريع
// لا يُرجع فيديو Base64 أبدًا — النتيجة ملفات داخل projects/{projectId}/ تُخدم عبر URL.
const express = require('express');
const path = require('path');
const fs = require('fs');
const { extractVideoId } = require('./youtube');
const jobs = require('./jobs/job-manager');
const { startDubJobs } = require('./dubbing/dubbing-service');
const { PROJECTS_DIR } = require('./dubbing/dubbing-pipeline');
const { scheduleCleanup } = require('./dubbing/cleanup');
const { verifyOwner } = require('./dubbing/dub-owner');
const { isAdmin } = require('./adminAuth');
const config = require('./config');

// تنظيف دوري للمشاريع القديمة (أول تشغيل بعد دقيقة، مؤقت unref لا يعيق الاختبارات)
scheduleCleanup({ maxAgeDays: config.PROJECTS_RETENTION_DAYS, maxBytes: config.PROJECTS_MAX_BYTES });

const router = express.Router();
const ALLOWED_MODES = new Set(['full-dub', 'voice-over', 'mix', 'subtitles']);
const LANG_RE = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const PROJECT_ID_RE = /^[a-zA-Z0-9_-]{1,40}$/;

// ===== الملكية (CURRENT_STATE.md §20) =====
// قبل هذا كانت هذه المسارات الستة مفتوحة تمامًا: أي زائر يقرأ حالة مهام غيره،
// وينزّل الفيديوهات المدبلجة التي أنتجها غيره، **ويحذف مشاريعهم**. وهي الثغرة
// نفسها التي أُغلقت لمشاريع SQLite في §19، فتُغلق هنا بالنمط نفسه.
//
// التوكن يصل في رأس X-Project-Token، أو — لمسار SSE وحده — في ?token= لأن
// EventSource لا يستطيع إرسال رؤوس مخصّصة إطلاقًا.
function tokenOf(req) {
  return req.get('x-project-token') || (typeof req.query.token === 'string' ? req.query.token : '');
}

// الرفض 404 لا 403: 403 يؤكّد وجود المعرّف لمن لا يملكه (نفس قرار §19).
function ownsProject(req, projectId) {
  return isAdmin(req) || verifyOwner(PROJECTS_DIR, projectId, tokenOf(req));
}

// حارس للمسارات التي معرّف المشروع في مسارها
function requireProjectOwner(req, res, next) {
  const pid = String(req.params.projectId || '');
  if (!PROJECT_ID_RE.test(pid)) return res.status(400).json({ error: 'invalid-project' });
  if (!ownsProject(req, pid)) return res.status(404).json({ error: 'not-found' });
  req.dubProjectId = pid;
  next();
}

// حارس للمسارات التي معرّف المهمة في مسارها (المشروع يُستنتج من المهمة)
function requireJobOwner(req, res, next) {
  const job = jobs.getJob(req.params.id);
  // مهمة غير موجودة ومهمة لا يملكها الطالب: الردّ نفسه، فلا يفرّق بينهما بالتجربة
  if (!job || !ownsProject(req, job.projectId)) return res.status(404).json({ error: 'job-not-found' });
  req.dubJob = job;
  next();
}

router.post('/youtube/dub', async (req, res) => {
  const { url, targetLang = 'ar', targetLangs = null, mode = 'full-dub' } = req.body || {};
  const cleanUrl = String(url || '').trim();
  if (!/^https?:\/\//i.test(cleanUrl) || cleanUrl.length > 2000) {
    return res.status(400).json({ error: 'invalid-url', errorAr: 'صيغة الرابط غير صحيحة.' });
  }
  const videoId = extractVideoId(cleanUrl);
  if (!videoId) return res.status(400).json({ error: 'invalid-url', errorAr: 'رابط يوتيوب غير صالح.' });
  if (!ALLOWED_MODES.has(String(mode))) return res.status(400).json({ error: 'invalid-mode' });
  let langs = Array.isArray(targetLangs) && targetLangs.length ? targetLangs : [targetLang];
  langs = [...new Set(langs.map((l) => String(l).slice(0, 10)))].filter((l) => LANG_RE.test(l)).slice(0, 5);
  if (!langs.length) return res.status(400).json({ error: 'missing-lang' });

  // وضع الترجمات فقط: لا حاجة لـ worker — يُعالَج عبر مسار الترجمة الحالي
  if (String(mode) === 'subtitles') {
    return res.status(400).json({ error: 'use-translate-endpoint', errorAr: 'وضع الترجمات يستخدم زر الترجمة الحالي.' });
  }
  const { jobs: created, ownerToken } = startDubJobs({ url: cleanUrl, targetLangs: langs, mode: String(mode) });
  const first = created[0];
  // ownerToken يُعاد هنا **مرة واحدة** ولا يُعاد أبدًا بعدها — بدونه لا وصول
  // إلى المشروع ولا إلى ملفاته لاحقًا.
  res.status(202).json({
    jobId: first.jobId, projectId: first.projectId, status: 'queued', jobs: created, ownerToken,
  });
});

router.get('/dub/jobs/:id', requireJobOwner, (req, res) => {
  res.json(jobs.publicJob(req.dubJob));
});

// بث حيّ للتقدم عبر SSE
router.get('/dub/jobs/:id/stream', requireJobOwner, (req, res) => {
  const job = req.dubJob;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(`event: progress\ndata: ${JSON.stringify(jobs.publicJob(job))}\n\n`);
  // مهمة انتهت **قبل** الاشتراك: لن يقع أي حدث بعدها، فلا شيء يُغلق الاتصال.
  // (broadcast يُنادى من updateJob وحده.) هذه الحالة شائعة: فشل سريع مثل
  // ytdlp-missing يقع قبل أن يفتح المتصفح البثّ — فكان يبقى معلّقًا إلى الأبد.
  if (job.status === 'completed' || job.status === 'failed') return res.end();
  jobs.subscribe(job.id, res);
});

// مهام المشروع (للاسترداد بعد إعادة التشغيل — تُقرأ من الذاكرة المستعادة من القرص)
// مهم: قبل مسار :file حتى لا يُفسَّر 'jobs' كاسم ملف.
router.get('/dub/projects/:projectId/jobs', requireProjectOwner, (req, res) => {
  const pid = req.dubProjectId;
  res.json({ projectId: pid, jobs: jobs.listProjectJobs(pid) });
});

// حذف مشروع كامل (ملفاته من القرص) — تنظيف يدوي بجانب التلقائي
router.delete('/dub/projects/:projectId', requireProjectOwner, (req, res) => {
  const pid = req.dubProjectId;
  const full = path.join(PROJECTS_DIR, pid);
  if (!full.startsWith(PROJECTS_DIR)) return res.status(400).json({ error: 'invalid-project' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'not-found' });
  try {
    fs.rmSync(full, { recursive: true, force: true });
    res.json({ deleted: pid });
  } catch {
    res.status(500).json({ error: 'server-error', errorAr: 'تعذر حذف المشروع.' });
  }
});

// ملفات المشاريع: أسماء آمنة فقط (dubbed-XX.mp4 / dubbing-XX.mp3 / subtitles-XX.srt|vtt / source.mp4)
const SAFE_FILE = /^(dubbed-[a-z]{2,3}(-[A-Z]{2})?\.mp4|dubbing-[a-z]{2,3}(-[A-Z]{2})?\.mp3|subtitles-[a-z]{2,3}(-[A-Z]{2})?\.(srt|vtt)|translation-[a-z]{2,3}(-[A-Z]{2})?\.json|source\.mp4|transcript\.json)$/;
router.get('/dub/projects/:projectId/:file', requireProjectOwner, (req, res) => {
  const pid = req.dubProjectId;
  const file = String(req.params.file || '');
  if (!SAFE_FILE.test(file)) return res.status(400).json({ error: 'invalid-file' });
  const full = path.join(PROJECTS_DIR, pid, file);
  if (!full.startsWith(PROJECTS_DIR)) return res.status(400).json({ error: 'invalid-file' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'not-found' });
  const ext = path.extname(file).toLowerCase();
  const ct = ext === '.mp4' ? 'video/mp4' : ext === '.mp3' ? 'audio/mpeg' : ext === '.vtt' ? 'text/vtt;charset=utf-8' : ext === '.srt' ? 'text/plain;charset=utf-8' : 'application/json';
  res.setHeader('Content-Type', ct);
  if (ext === '.mp4' || ext === '.mp3') res.setHeader('Accept-Ranges', 'bytes');
  fs.createReadStream(full).pipe(res);
});

module.exports = router;
