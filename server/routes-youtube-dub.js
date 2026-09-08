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
const config = require('./config');

// تنظيف دوري للمشاريع القديمة (أول تشغيل بعد دقيقة، مؤقت unref لا يعيق الاختبارات)
scheduleCleanup({ maxAgeDays: config.PROJECTS_RETENTION_DAYS, maxBytes: config.PROJECTS_MAX_BYTES });

const router = express.Router();
const ALLOWED_MODES = new Set(['full-dub', 'voice-over', 'mix', 'subtitles']);
const LANG_RE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

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
  const created = startDubJobs({ url: cleanUrl, targetLangs: langs, mode: String(mode) });
  const first = created[0];
  res.status(202).json({ jobId: first.jobId, projectId: first.projectId, status: 'queued', jobs: created });
});

router.get('/dub/jobs/:id', (req, res) => {
  const job = jobs.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'job-not-found' });
  res.json(jobs.publicJob(job));
});

// بث حيّ للتقدم عبر SSE
router.get('/dub/jobs/:id/stream', (req, res) => {
  const job = jobs.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'job-not-found' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(`event: progress\ndata: ${JSON.stringify(jobs.publicJob(job))}\n\n`);
  jobs.subscribe(job.id, res);
});

// مهام المشروع (للاسترداد بعد إعادة التشغيل — تُقرأ من الذاكرة المستعادة من القرص)
// مهم: قبل مسار :file حتى لا يُفسَّر 'jobs' كاسم ملف.
router.get('/dub/projects/:projectId/jobs', (req, res) => {
  const pid = String(req.params.projectId || '');
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(pid)) return res.status(400).json({ error: 'invalid-project' });
  res.json({ projectId: pid, jobs: jobs.listProjectJobs(pid) });
});

// PATCH /api/dub/projects/:projectId/segments/:index — تعديل ترجمة مقطع + إعادة توليد TTS
const PROJECT_ID_RE = /^[a-zA-Z0-9_-]{1,40}$/;
router.patch('/dub/projects/:projectId/segments/:index', async (req, res) => {
  const pid = String(req.params.projectId || '');
  if (!PROJECT_ID_RE.test(pid)) return res.status(400).json({ error: 'invalid-project' });

  const { lang, translated } = req.body || {};
  if (!LANG_RE.test(String(lang || ''))) return res.status(400).json({ error: 'invalid-lang', errorAr: 'اللغة غير صالحة.' });

  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: 'invalid-index', errorAr: 'رقم المقطع غير صالح.' });

  if (typeof translated !== 'string' || !translated.trim() || translated.length > 1500) {
    return res.status(400).json({ error: 'invalid-text', errorAr: 'النص غير صالح (فارغ أو طويل جدًا).' });
  }

  // Guard: if a job for this project is still processing → 409
  const projectJobs = jobs.listProjectJobs(pid);
  if (projectJobs.some((j) => j.status === 'processing')) {
    return res.status(409).json({ error: 'job-running', errorAr: 'لا يمكن التعديل أثناء تشغيل الدبلجة.' });
  }

  const dir = path.join(PROJECTS_DIR, pid);
  const segsPath = path.join(dir, `translation-${lang}.json`);
  if (!fs.existsSync(segsPath)) return res.status(404).json({ error: 'translation-not-found' });

  let segments;
  try { segments = JSON.parse(fs.readFileSync(segsPath, 'utf8')); } catch { return res.status(404).json({ error: 'translation-not-found' }); }
  if (!Array.isArray(segments) || index >= segments.length) {
    return res.status(400).json({ error: 'invalid-index', errorAr: 'رقم المقطع خارج النطاق.' });
  }

  // Update translated text, keep everything else
  const seg = segments[index];
  seg.translated = translated.trim();

  // Regenerate TTS for this segment only
  let audioError = null;
  try {
    const { textToMp3BufferWithVoice } = require('./tts');
    const { fitAudioToSlot } = require('./dubbing/timing-engine');
    const clipsDir = path.join(dir, `tts-${lang}`);
    fs.mkdirSync(clipsDir, { recursive: true });
    const pad = String(index).padStart(3, '0');
    const rawPath = path.join(clipsDir, `seg-${pad}-raw.mp3`);
    const fitPath = path.join(clipsDir, `seg-${pad}.mp3`);

    const buf = await textToMp3BufferWithVoice(seg.translated, lang, seg.voice);
    fs.writeFileSync(rawPath, buf);
    const slotSec = Math.max(1, (seg.end - seg.start) || seg.duration || 2);
    await fitAudioToSlot(rawPath, fitPath, slotSec);
    seg.audio = `seg-${pad}.mp3`;
  } catch (e) {
    // TTS failure: still save the text edit (user's fix is never lost).
    // Cost is intentionally NOT recorded here — textToMp3BufferWithVoice
    // already increments the TTS counter internally for successful synthesis.
    audioError = e.code || e.message || 'tts-failed';
    seg.audio = null;
  }

  // Atomic-ish write: tmp + rename so a crash never truncates the file
  const tmpPath = `${segsPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(segments));
  fs.renameSync(tmpPath, segsPath);

  res.json({ projectId: pid, lang, index, segment: seg, derivedStale: true, ...(audioError ? { audioError } : {}) });
});

// حذف مشروع كامل (ملفاته من القرص) — تنظيف يدوي بجانب التلقائي
router.delete('/dub/projects/:projectId', (req, res) => {
  const pid = String(req.params.projectId || '');
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(pid)) return res.status(400).json({ error: 'invalid-project' });
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
router.get('/dub/projects/:projectId/:file', (req, res) => {
  const pid = String(req.params.projectId || '');
  const file = String(req.params.file || '');
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(pid) || !SAFE_FILE.test(file)) {
    return res.status(400).json({ error: 'invalid-file' });
  }
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
