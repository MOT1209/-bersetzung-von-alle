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

const router = express.Router();

// ===== إحصاءات الطابور =====
router.get('/jobs', (req, res) => {
  res.json(jobs.stats());
});

// ===== بثّ التقدّم عبر SSE =====
// يسبق '/jobs/:id' في الترتيب لأن Express يطابق أول مسار موافق.
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
router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job-not-found' });
  res.json(job);
});

// ===== إلغاء =====
router.delete('/jobs/:id', (req, res) => {
  const job = jobs.cancel(req.params.id);
  if (!job) return res.status(404).json({ error: 'job-not-found' });
  res.json(job);
});

module.exports = router;
