// server/dubbing/dubbing-service.js — واجهة الخدمة (يستخدمها route + الاختبارات)
const jobs = require('../jobs/job-manager');
const { runDubbingJob, projectDir } = require('./dubbing-pipeline');
const { randomUUID } = require('crypto');

function startDubJobs({ url, targetLang = 'ar', targetLangs = null, mode = 'full-dub' }) {
  const langs = Array.isArray(targetLangs) && targetLangs.length ? targetLangs : [targetLang];
  const projectId = randomUUID().slice(0, 8);
  projectDir(projectId); // يُنشأ عند أول كتابة فعليًا
  return langs.slice(0, 5).map((lang) => {
    const job = jobs.createJob({ type: 'youtube-dub', projectId, params: { url, targetLang: lang, mode } });
    // worker خلفية — لا ننتظرها في الطلب
    setImmediate(() => runDubbingJob(job, jobs).catch(() => {}));
    return jobs.publicJob(job);
  });
}

module.exports = { startDubJobs };
