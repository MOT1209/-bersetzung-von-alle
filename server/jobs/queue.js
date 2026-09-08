// server/jobs/queue.js — محرك الوظائف: تنفيذ محدود التزامن بحالة وتقدّم وإلغاء
//
// ═══ المشكلة التي يحلّها (CURRENT_STATE.md §7.1) ═══
// العمليات الثقيلة (تفريغ صوتي، دبلجة، OCR، تنزيل فيديو) كانت تعمل داخل دورة
// طلب HTTP. تصحيحٌ مهم: هي **لا تحجب** حلقة أحداث Node (execFile يشغّل عملية
// نظام منفصلة). المشاكل الحقيقية أربع:
//   1) لا سقف للتزامن  → عشرة طلبات فيديو متزامنة تستهلك المعالج بالكامل
//   2) لا استئناف       → أي انقطاع يضيّع العمل كله
//   3) لا إلغاء         → العمل يستمر بعد انصراف المستخدم
//   4) مهلة الطلب تقتل العمل الجاري (فيديو Gemini = طلب مفتوح 8 دقائق)
//
// ═══ لماذا ليس BullMQ الآن ═══
// BullMQ **يفرض** Redis ولا يملك وضع ذاكرة، بينما قاعدة المشروع (AGENTS.md) أن
// Redis اختياري ولا يجوز أن يكون شرطًا — والنشر على Render المجاني نسخة واحدة
// بلا Redis. لذلك المحرك هنا بواجهة سائق: سائق داخل العملية الآن، وسائق
// BullMQ يُركَّب لاحقًا عند الحاجة الفعلية للتوسّع الأفقي **دون تغيير هذه الواجهة**.
//
// ═══ حدّ صادق ═══
// الإلغاء تعاوني: نرفع `signal` ونعلّم الوظيفة ملغاة، لكن لا يمكن قتل عمل
// لا يفحص الإشارة. المعالجات الطويلة يجب أن تفحص `ctx.signal.aborted` بين المراحل.
const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');

const STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};
const TERMINAL = new Set([STATUS.COMPLETED, STATUS.FAILED, STATUS.CANCELLED]);

function codeError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

/**
 * @param {object} opts
 *  - concurrency: أقصى وظائف تعمل معًا (الافتراضي 2 — العمل الثقيل مقيّد بالمعالج)
 *  - maxQueued: سقف طابور الانتظار (يمنع نموًّا غير محدود للذاكرة)
 *  - ttlMs: مدة بقاء الوظيفة المنتهية قبل التنظيف
 */
function createQueue(opts = {}) {
  const concurrency = Math.max(1, Number(opts.concurrency) || 2);
  const maxQueued = Math.max(1, Number(opts.maxQueued) || 100);
  const ttlMs = Math.max(1000, Number(opts.ttlMs) || 3600000);

  const handlers = new Map(); // type → fn(payload, ctx)
  const jobs = new Map();     // id → سجل الوظيفة
  const waiting = [];         // معرّفات بترتيب الوصول (FIFO)
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0); // مشتركو SSE قد يكثرون — لا تحذير زائف
  let running = 0;
  let closed = false;

  function registerHandler(type, fn) {
    if (typeof fn !== 'function') throw new TypeError('handler must be a function');
    handlers.set(type, fn);
  }

  // العرض العام — بلا حقول داخلية (وعود، مُلغيات، مؤقتات)
  function toPublic(job) {
    if (!job) return null;
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: { ...job.progress },
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      queuePosition: job.status === STATUS.QUEUED ? waiting.indexOf(job.id) + 1 : 0,
    };
  }

  function emitUpdate(job) {
    emitter.emit('update', toPublic(job));
    emitter.emit(`update:${job.id}`, toPublic(job));
  }

  // تنظيف مؤجَّل: الوظائف المنتهية تُحذف بعد ttlMs حتى لا تتراكم الذاكرة
  function scheduleCleanup(job) {
    if (job._cleanupTimer) clearTimeout(job._cleanupTimer);
    job._cleanupTimer = setTimeout(() => jobs.delete(job.id), ttlMs);
    if (job._cleanupTimer.unref) job._cleanupTimer.unref();
  }

  function settle(job, status, { result = null, error = null } = {}) {
    if (TERMINAL.has(job.status)) return; // لا نُنهي وظيفة منتهية مرتين
    job.status = status;
    job.result = result;
    job.error = error;
    job.finishedAt = Date.now();
    scheduleCleanup(job);
    emitUpdate(job);
    if (status === STATUS.COMPLETED) job._resolve(result);
    else job._reject(error ? codeError(error.code || 'job-failed', error.message) : codeError('job-' + status));
  }

  async function execute(job) {
    const handler = handlers.get(job.type);
    if (!handler) {
      settle(job, STATUS.FAILED, { error: { code: 'unknown-job-type', message: `no handler for ${job.type}` } });
      return;
    }

    job.status = STATUS.RUNNING;
    job.startedAt = Date.now();
    emitUpdate(job);

    const ctx = {
      jobId: job.id,
      signal: job._controller.signal,
      // التقدّم: مرحلة نصية + نسبة محصورة 0..100
      progress(stage, percent) {
        if (TERMINAL.has(job.status)) return;
        job.progress = {
          stage: String(stage || job.progress.stage || ''),
          percent: percent === undefined || percent === null
            ? job.progress.percent
            : Math.max(0, Math.min(100, Math.round(Number(percent) || 0))),
        };
        emitUpdate(job);
      },
    };

    try {
      const result = await handler(job.payload, ctx);
      // أُلغيت أثناء التنفيذ: نحترم الإلغاء ولا نُبلغ نجاحًا
      if (job._cancelRequested) {
        settle(job, STATUS.CANCELLED, { error: { code: 'job-cancelled', message: 'أُلغيت الوظيفة' } });
        return;
      }
      job.progress = { stage: 'done', percent: 100 };
      settle(job, STATUS.COMPLETED, { result });
    } catch (e) {
      if (job._cancelRequested) {
        settle(job, STATUS.CANCELLED, { error: { code: 'job-cancelled', message: 'أُلغيت الوظيفة' } });
        return;
      }
      settle(job, STATUS.FAILED, {
        error: { code: (e && e.code) || 'job-failed', message: (e && e.message) || String(e) },
      });
    }
  }

  // المضخّة: تُشغّل ما يسمح به سقف التزامن، وتُستدعى بعد كل إضافة وكل انتهاء
  function pump() {
    while (!closed && running < concurrency && waiting.length) {
      const id = waiting.shift();
      const job = jobs.get(id);
      if (!job || job.status !== STATUS.QUEUED) continue; // أُلغيت وهي منتظرة
      running++;
      execute(job).finally(() => {
        running--;
        pump();
      });
    }
    // ترتيب الانتظار تغيّر — أبلغ المنتظرين بموضعهم الجديد
    for (const id of waiting) {
      const j = jobs.get(id);
      if (j) emitter.emit(`update:${id}`, toPublic(j));
    }
  }

  function enqueue(type, payload) {
    if (closed) throw codeError('queue-closed', 'الطابور مغلق');
    if (!handlers.has(type)) throw codeError('unknown-job-type', `no handler for ${type}`);
    // سقف الطابور: الرفض الصريح أفضل من نموّ ذاكرة غير محدود ثم انهيار
    if (waiting.length >= maxQueued) throw codeError('queue-full', 'طابور الوظائف ممتلئ');

    const job = {
      id: randomUUID(),
      type,
      payload,
      status: STATUS.QUEUED,
      progress: { stage: 'queued', percent: 0 },
      result: null,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      _controller: new AbortController(),
      _cancelRequested: false,
      _cleanupTimer: null,
    };
    job._promise = new Promise((resolve, reject) => {
      job._resolve = resolve;
      job._reject = reject;
    });
    job._promise.catch(() => {}); // لا تحذير unhandledRejection لمن لا ينتظر النتيجة

    jobs.set(job.id, job);
    waiting.push(job.id);
    emitUpdate(job);
    // التشغيل يُؤجَّل إلى microtask بدل النداء المباشر، لسببين:
    //   1) enqueue يعيد وظيفة **منتظرة** فعلًا لا وظيفة بدأت أصلًا.
    //   2) الأهم: من يشترك بالتحديثات مباشرةً بعد enqueue (بثّ SSE) كان يفوته
    //      كل حدث يقع قبل اشتراكه — ومعالج سريع كان ينتهي قبل أن يبدأ الاستماع.
    queueMicrotask(pump);
    return toPublic(job);
  }

  // تنفيذ وانتظار النتيجة — يمرّ بنفس سقف التزامن (المسارات المتزامنة تستفيد أيضًا)
  async function run(type, payload) {
    const pub = enqueue(type, payload);
    const job = jobs.get(pub.id);
    return job._promise;
  }

  function get(id) {
    return toPublic(jobs.get(id));
  }

  function cancel(id) {
    const job = jobs.get(id);
    if (!job) return null;
    if (TERMINAL.has(job.status)) return toPublic(job); // منتهية أصلًا — لا شيء يُلغى
    job._cancelRequested = true;
    try { job._controller.abort(); } catch { /* تجاهل */ }
    if (job.status === STATUS.QUEUED) {
      // لم تبدأ بعد: إلغاء فوري ومؤكَّد
      const i = waiting.indexOf(id);
      if (i !== -1) waiting.splice(i, 1);
      settle(job, STATUS.CANCELLED, { error: { code: 'job-cancelled', message: 'أُلغيت قبل التشغيل' } });
    }
    // إن كانت تعمل: الإلغاء تعاوني — تُحسم في execute() عند رجوع المعالج
    return toPublic(job);
  }

  function stats() {
    let queued = 0;
    for (const j of jobs.values()) if (j.status === STATUS.QUEUED) queued++;
    return { concurrency, running, queued, tracked: jobs.size, maxQueued };
  }

  // اشتراك بتحديثات وظيفة واحدة (يستخدمه بثّ SSE) — يعيد دالة إلغاء الاشتراك
  function subscribe(id, listener) {
    const evt = `update:${id}`;
    emitter.on(evt, listener);
    return () => emitter.off(evt, listener);
  }

  async function close() {
    closed = true;
    for (const job of jobs.values()) {
      if (job._cleanupTimer) clearTimeout(job._cleanupTimer);
      if (!TERMINAL.has(job.status)) cancel(job.id);
    }
  }

  return {
    registerHandler, enqueue, run, get, cancel, stats, subscribe, close,
    events: emitter,
    STATUS,
  };
}

module.exports = { createQueue, STATUS };
