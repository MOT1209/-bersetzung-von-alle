// server/jobs/job-manager.js — مدير مهام الدبلجة (queue داخل العملية)
// الدبلجة تستغرق دقائق، فلا يصح أن تعيش داخل طلب HTTP واحد.
// POST /api/youtube/dub → job queued → worker يعمل بالخلفية → GET /api/jobs/:id للتقدّم.
const { randomUUID } = require('crypto');

const jobs = new Map(); // jobId → job
const MAX_JOBS = 200;
const sseClients = new Map(); // jobId → Set<res>

function createJob({ type, projectId, params }) {
  const id = randomUUID().slice(0, 8);
  const job = {
    id, type, projectId,
    params: params || {},
    status: 'queued', // queued → analyzing → transcribing → translating → voicing → rendering → completed | failed
    stage: 'queued',
    progress: 0,
    result: null,
    error: null,
    errorAr: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    logs: [],
  };
  jobs.set(id, job);
  if (jobs.size > MAX_JOBS) {
    const oldest = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    jobs.delete(oldest.id);
  }
  return job;
}

function getJob(id) { return jobs.get(String(id || '')) || null; }

function updateJob(id, patch) {
  const job = getJob(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  broadcast(id);
  return job;
}

function pushLog(id, msg) {
  const job = getJob(id);
  if (!job) return;
  job.logs.push({ t: Date.now(), msg: String(msg).slice(0, 300) });
  if (job.logs.length > 100) job.logs.shift();
}

// ===== SSE: بث حيّ للتقدم =====
function subscribe(id, res) {
  const key = String(id);
  if (!sseClients.has(key)) sseClients.set(key, new Set());
  sseClients.get(key).add(res);
  res.on('close', () => {
    const s = sseClients.get(key);
    if (s) s.delete(res);
  });
}

function broadcast(id) {
  const s = sseClients.get(String(id));
  const job = getJob(id);
  if (!s || !s.size || !job) return;
  const payload = `event: progress\ndata: ${JSON.stringify(publicJob(job))}\n\n`;
  for (const res of [...s]) {
    try { res.write(payload); } catch { s.delete(res); }
  }
}

function publicJob(job) {
  if (!job) return null;
  return {
    jobId: job.id, projectId: job.projectId, type: job.type,
    status: job.status, stage: job.stage, progress: job.progress,
    result: job.result, error: job.error, errorAr: job.errorAr,
    updatedAt: job.updatedAt,
  };
}

module.exports = { createJob, getJob, updateJob, pushLog, subscribe, publicJob };
