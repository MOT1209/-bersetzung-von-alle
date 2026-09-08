// server/dubbing/dubbing-service.js — واجهة الخدمة (يستخدمها route + الاختبارات)
const jobs = require('../jobs/job-manager');
const { runDubbingJob, projectDir, PROJECTS_DIR } = require('./dubbing-pipeline');
const { createOwner } = require('./dub-owner');
const config = require('../config');
const { randomUUID } = require('crypto');

// ===== سقف التزامن (CURRENT_STATE.md §20) =====
// قبل هذا كان كل طلب يطلق setImmediate لكل لغة (حتى 5) بلا أي سقف: عشرة طلبات
// = خمسون خطّ أنابيب متوازيًا، كلٌّ منها يشغّل ffmpeg وyt-dlp. على خطة Render
// (512MB رام، 0.5 vCPU) هذا يُسقط الخدمة، لا يبطئها فقط.
//
// لا نُعيد كتابة المحرّك هنا (توحيد المحرّكَين قرار منفصل): عدّاد بسيط بطابور
// انتظار يكفي لوضع السقف.
const MAX_CONCURRENT = Math.max(1, Number(config.JOB_CONCURRENCY) || 2);
let running = 0;
const waiting = [];

function pump() {
  while (running < MAX_CONCURRENT && waiting.length) {
    const task = waiting.shift();
    running++;
    task().catch(() => {}).finally(() => { running--; pump(); });
  }
}

function schedule(task) {
  waiting.push(task);
  setImmediate(pump);
}

function startDubJobs({ url, targetLang = 'ar', targetLangs = null, mode = 'full-dub' }) {
  const langs = Array.isArray(targetLangs) && targetLangs.length ? targetLangs : [targetLang];
  // معرّف كامل لا مقطوع: 8 أحرف hex = 32 بت فقط، وهو الحارس الوحيد على تنزيل
  // ملفات المشروع قبل §20 — ضعيف أمام التخمين المنهجي.
  const projectId = randomUUID();
  projectDir(projectId); // يُنشأ عند أول كتابة فعليًا
  const ownerToken = createOwner(PROJECTS_DIR, projectId);

  const created = langs.slice(0, 5).map((lang) =>
    jobs.createJob({ type: 'youtube-dub', projectId, params: { url, targetLang: lang, mode } }));

  // لغات الطلب الواحد تعمل **بالتتابع** لا بالتوازي: كلها تتشارك projectId نفسه،
  // فتكتب على source.mp4 وmeta.json نفسها بلا قفل — التوازي هنا سباقُ إفساد لا تسريع.
  schedule(async () => {
    for (const job of created) {
      await runDubbingJob(job, jobs).catch(() => {});
    }
  });

  // التوكن يُعاد مرة واحدة فقط — لا يُخزَّن نصًّا ولا يظهر في أي قراءة لاحقة
  return { jobs: created.map((j) => jobs.publicJob(j)), ownerToken };
}

module.exports = { startDubJobs };
