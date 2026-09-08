// server/jobs/job-manager.js — مدير مهام الدبلجة (queue داخل العملية + persistence على القرص)
// الدبلجة تستغرق دقائق، فلا يصح أن تعيش داخل طلب HTTP واحد.
// POST /api/youtube/dub → job queued → worker يعمل بالخلفية → GET /api/jobs/:id للتقدّم.
//
// الاستمرارية: كل مهمة تُحفظ في projects/{projectId}/job-{jobId}.json عند الإنشاء
// وعند تغيّر الحالة/التقدم. عند إقلاع الخادم تُستعاد المهام من القرص: المنتهية
// (completed/failed) كما هي، والجارية تُعلَّم interrupted — لا تُفقد بصمت أبدًا.
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const PROJECTS_DIR = path.join(__dirname, '..', '..', 'projects');

const jobs = new Map(); // jobId → job
const MAX_JOBS = 200;
const sseClients = new Map(); // jobId → Set<res>
const lastPersistedProgress = new Map(); // jobId → progress at last disk write

function jobFilePath(projectId, jobId) {
  const pid = String(projectId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const jid = String(jobId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return path.join(PROJECTS_DIR, pid || 'p', `job-${jid || 'x'}.json`);
}

// كتابة نار-وانسَ: فشل القرص لا يُسقط المهمة (الذاكرة هي المصدر الحي)
function persistJob(job) {
  try {
    const dir = path.dirname(jobFilePath(job.projectId, job.id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(jobFilePath(job.projectId, job.id), JSON.stringify({
      id: job.id, type: job.type, projectId: job.projectId, params: job.params,
      status: job.status, stage: job.stage, progress: job.progress,
      result: job.result, error: job.error, errorAr: job.errorAr,
      createdAt: job.createdAt, updatedAt: job.updatedAt,
    }));
    lastPersistedProgress.set(job.id, job.progress);
  } catch { /* القرص ممتلئ/للقراءة فقط — المهمة تكمل في الذاكرة */ }
}

function needsPersist(job, prevStatus) {
  if (job.status !== prevStatus) return true;
  if (job.status === 'completed' || job.status === 'failed') return true;
  return Math.abs((job.progress || 0) - (lastPersistedProgress.get(job.id) ?? -10)) >= 10;
}

function createJob({ type, projectId, params }) {
  const id = randomUUID().slice(0, 8);
  const job = {
    id, type, projectId,
    params: params || {},
    status: 'queued', // queued → processing → completed | failed
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
    lastPersistedProgress.delete(oldest.id);
  }
  persistJob(job);
  return job;
}

function getJob(id) { return jobs.get(String(id || '')) || null; }

function updateJob(id, patch) {
  const job = getJob(id);
  if (!job) return null;
  const prevStatus = job.status;
  Object.assign(job, patch, { updatedAt: Date.now() });
  if (needsPersist(job, prevStatus)) persistJob(job);
  broadcast(id);
  return job;
}

function pushLog(id, msg) {
  const job = getJob(id);
  if (!job) return;
  job.logs.push({ t: Date.now(), msg: String(msg).slice(0, 300) });
  if (job.logs.length > 100) job.logs.shift();
}

function listProjectJobs(projectId) {
  const pid = String(projectId || '');
  return [...jobs.values()]
    .filter((j) => j.projectId === pid)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(publicJob);
}

// ===== الاسترداد عند الإقلاع: إعادة بناء المهام من ملفات القرص =====
function reloadFromDisk() {
  let restored = 0;
  let interrupted = 0;
  let entries = [];
  try { entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }); } catch { return { restored, interrupted }; }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    let files = [];
    try { files = fs.readdirSync(path.join(PROJECTS_DIR, ent.name)); } catch { continue; }
    for (const f of files) {
      if (!/^job-[a-zA-Z0-9_-]{1,40}\.json$/.test(f)) continue;
      try {
        const snap = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, ent.name, f), 'utf8'));
        if (!snap || !snap.id || jobs.has(snap.id)) continue;
        const terminal = snap.status === 'completed' || snap.status === 'failed';
        const job = {
          id: snap.id, type: snap.type || 'youtube-dub', projectId: snap.projectId || ent.name,
          params: snap.params || {},
          status: terminal ? snap.status : 'failed',
          stage: terminal ? snap.stage : 'توقفت',
          progress: terminal ? snap.progress : 100,
          result: terminal ? snap.result : null,
          error: terminal ? snap.error : 'interrupted',
          errorAr: terminal ? snap.errorAr : 'توقفت المهمة بسبب إعادة تشغيل الخادم — أعد بدء الدبلجة.',
          createdAt: snap.createdAt || Date.now(), updatedAt: Date.now(), logs: [],
        };
        jobs.set(job.id, job);
        if (terminal) restored++; else { interrupted++; persistJob(job); }
      } catch { /* ملف تالف — يُتجاهل */ }
    }
  }
  return { restored, interrupted };
}

// تُستدعى مرة واحدة عند تحميل الوحدة (إقلاع الخادم)
reloadFromDisk();

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

module.exports = {
  createJob, getJob, updateJob, pushLog, subscribe, publicJob,
  listProjectJobs, reloadFromDisk, PROJECTS_DIR,
  // للاختبارات فقط: تصفير الذاكرة لمحاكاة إعادة التشغيل
  _testClear() { jobs.clear(); lastPersistedProgress.clear(); },
};
