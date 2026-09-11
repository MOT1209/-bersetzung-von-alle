// server/routes-jobs.js — متابعة الوظائف الطويلة
//   GET    /api/jobs/:id         حالة الوظيفة
//   GET    /api/jobs/:id/stream  بثّ التقدّم عبر SSE
//   DELETE /api/jobs/:id         إلغاء
//   GET    /api/jobs             إحصاءات الطابور
//
// ⚠️ يُركَّب **قبل** compression() في server.js: 'text/event-stream' نوع قابل
// للضغط، فيخزّن الضاغط الأحداث وتصل دفعة واحدة — يعمل الطلب ويضيع البثّ صامتًا.
// (نفس الدرس الموثّق في AGENTS.md وroutes-sse.js.)
const express = require('express');
const jobs = require('./jobs');
const { requireAdmin, isAdmin } = require('./adminAuth');
const repo = require('./db/projects');

const router = express.Router();

const PROJECT_TOKEN_HEADER = 'x-project-token';

// ===== إحصاءات الطابور — للأدمن وحده =====
// كانت مكشوفة للجميع. هي عدّادات إجمالية لا معرّفات، لكنها بيانات تشغيلية
// لا يحتاجها أي مستخدم (الواجهة لا تنادي هذا المسار أصلًا) — نفس قاعدة
// GET /api/projects في routes-projects.js.
router.get('/jobs', requireAdmin, (req, res) => {
  res.json(jobs.stats());
});

// ===== بثّ التقدّم عبر SSE =====
// يسبق '/jobs/:id' في الترتيب لأن Express يطابق أول مسار موافق.
// بلا مصادقة برأس عمدًا (رابط قدرة — انظر تعليق GET /jobs/:id أعلاه):
// EventSource لا يرسل ترويسات مخصّصة.
router.get('/jobs/:id/stream', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job-not-found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // يمنع التخزين المؤقت عند الوسيط
  res.flushHeaders();

  // انقطاع العميل يُكتشف على res لا req: منذ Node 16 يُطلق الطلب 'close' فور
  // قراءة جسمه، فيصبح كل بثّ مهملًا فورًا (الدرس نفسه في routes-sse.js).
  let closed = false;
  res.on('close', () => { closed = true; off(); });

  const send = (data) => {
    if (closed) return;
    try {
      res.write(`event: update\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      closed = true;
    }
  };

  const off = jobs.subscribe(req.params.id, (updated) => {
    send(updated);
    // انتهت الوظيفة → أنهِ البثّ بدل إبقاء اتصال مفتوح بلا فائدة
    if (['completed', 'failed', 'cancelled'].includes(updated.status)) {
      off();
      if (!closed) res.end();
    }
  });

  // الحالة الراهنة فورًا — قد تكون الوظيفة انتهت قبل الاشتراك
  send(job);
  if (['completed', 'failed', 'cancelled'].includes(job.status)) {
    off();
    res.end();
  }
});

// ===== حالة وظيفة =====
// رابط قدرة (capability URL) عمدًا لا مصادقة برأس: متابعة التقدّم تتم عبر
// EventSource في المتصفح وهو لا يرسل ترويسات مخصّصة (CURRENT_STATE.md §19).
// المعرّف UUID عشوائي 128-بت غير قابل للتخمين، ولا يكشف إلا تقدّم وظيفة واحدة.
router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job-not-found' });
  res.json(job);
});

// ===== إلغاء =====
// وظيفة مرتبطة بمشروع (project-video عبر POST /api/projects/:id/process)
// تتطلّب توكن مالك المشروع أو الأدمن — وإلا 404 (لا نؤكّد الوجود لغير المالك،
// نفس قاعدة requireProjectOwner). الوظائف المجهولة المالك (video-local العام)
// تبقى على نموذج رابط القدرة: منشئها العام لا يملك توكنًا أصلًا.
router.delete('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job-not-found' });
  const projectId = jobs.ownerProject(req.params.id);
  if (projectId) {
    const project = repo.getProject(projectId);
    if (!project || (!isAdmin(req) && !repo.verifyProjectOwner(project.id, req.get(PROJECT_TOKEN_HEADER)))) {
      return res.status(404).json({ error: 'job-not-found' });
    }
  }
  const cancelled = jobs.cancel(req.params.id);
  if (!cancelled) return res.status(404).json({ error: 'job-not-found' });
  res.json(cancelled);
});

module.exports = router;
