// server/jobs/index.js — طابور الوظائف المشترك للتطبيق (نسخة واحدة)
//
// المعالجات تُسجَّل من الوحدات التي تملك منطقها (routes-local-video.js مثلًا)
// عند تحميلها، لا هنا — فيبقى المنطق في مكان واحد ولا ينشأ استيراد دائري.
const config = require('../config');
const { createQueue, STATUS } = require('./queue');

const queue = createQueue({
  concurrency: config.JOB_CONCURRENCY,
  maxQueued: config.JOB_MAX_QUEUED,
  ttlMs: config.JOB_TTL_MS,
});

module.exports = queue;
module.exports.STATUS = STATUS;
