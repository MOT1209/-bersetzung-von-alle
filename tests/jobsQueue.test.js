// tests/jobsQueue.test.js — محرك الوظائف (P2a)
// نقيّ تمامًا: لا شبكة ولا ملفات ولا خادم. كل شيء بمعالجات وهمية ومؤقتات قصيرة.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createQueue, STATUS } = require('../server/jobs/queue');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ينتظر حتى يتحقّق الشرط أو تنتهي المهلة — أدقّ من sleep ثابت
async function until(fn, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await sleep(5);
  }
  return false;
}

// ===== 1) دورة الحياة =====

test('run: ينفّذ ويعيد النتيجة وينتهي بـ completed', async () => {
  const q = createQueue({ concurrency: 2 });
  q.registerHandler('echo', async (payload) => ({ got: payload.v }));
  const result = await q.run('echo', { v: 42 });
  assert.deepEqual(result, { got: 42 });
  await q.close();
});

test('enqueue: يعيد وظيفة queued فورًا ثم تنتقل إلى completed', async () => {
  const q = createQueue({ concurrency: 1 });
  q.registerHandler('slow', async () => { await sleep(20); return 'done'; });
  const job = q.enqueue('slow', {});
  assert.equal(job.status, STATUS.QUEUED);
  assert.ok(job.id);
  assert.ok(await until(() => q.get(job.id).status === STATUS.COMPLETED));
  assert.equal(q.get(job.id).result, 'done');
  await q.close();
});

test('فشل المعالج → failed مع رمز الخطأ محفوظًا', async () => {
  const q = createQueue({ concurrency: 1 });
  q.registerHandler('boom', async () => {
    const e = new Error('انفجار');
    e.code = 'audio-empty';
    throw e;
  });
  const job = q.enqueue('boom', {});
  assert.ok(await until(() => q.get(job.id).status === STATUS.FAILED));
  assert.equal(q.get(job.id).error.code, 'audio-empty');
  // run() يرفض بنفس الرمز — المسار المتزامن يرى الخطأ الحقيقي لا خطأ عامًا
  await assert.rejects(() => q.run('boom', {}), (e) => e.code === 'audio-empty');
  await q.close();
});

test('نوع غير مسجَّل → unknown-job-type من enqueue مباشرةً', async () => {
  const q = createQueue({});
  assert.throws(() => q.enqueue('ghost', {}), (e) => e.code === 'unknown-job-type');
  await q.close();
});

// ===== 2) سقف التزامن — جوهر P2 =====

test('التزامن: لا يتجاوز السقف مهما بلغ عدد الوظائف', async () => {
  const q = createQueue({ concurrency: 2 });
  let active = 0;
  let peak = 0;
  q.registerHandler('track', async () => {
    active++;
    peak = Math.max(peak, active);
    await sleep(25);
    active--;
    return true;
  });
  await Promise.all(Array.from({ length: 8 }, () => q.run('track', {})));
  assert.equal(peak, 2, `تجاوز سقف التزامن: بلغ ${peak}`);
  await q.close();
});

test('التزامن: الزائد ينتظر في الطابور ويحمل موضعه', async () => {
  const q = createQueue({ concurrency: 1 });
  q.registerHandler('hold', async () => { await sleep(40); return 1; });
  const a = q.enqueue('hold', {});
  const b = q.enqueue('hold', {});
  const c = q.enqueue('hold', {});
  // الأولى تعمل، والباقيتان تنتظران بترتيب الوصول
  assert.ok(await until(() => q.get(a.id).status === STATUS.RUNNING));
  assert.equal(q.get(b.id).status, STATUS.QUEUED);
  assert.equal(q.get(b.id).queuePosition, 1);
  assert.equal(q.get(c.id).queuePosition, 2);
  assert.equal(q.stats().running, 1);
  assert.ok(await until(() => q.get(c.id).status === STATUS.COMPLETED, 3000));
  await q.close();
});

test('الترتيب FIFO محفوظ', async () => {
  const q = createQueue({ concurrency: 1 });
  const order = [];
  q.registerHandler('seq', async (p) => { order.push(p.n); await sleep(5); });
  await Promise.all([1, 2, 3, 4].map((n) => q.run('seq', { n })));
  assert.deepEqual(order, [1, 2, 3, 4]);
  await q.close();
});

// ===== 3) الإلغاء =====

test('إلغاء وظيفة منتظرة: فوري ومؤكَّد ولا تعمل أبدًا', async () => {
  const q = createQueue({ concurrency: 1 });
  let ran = 0;
  q.registerHandler('hold', async () => { ran++; await sleep(30); });
  const first = q.enqueue('hold', {});
  const queued = q.enqueue('hold', {});
  assert.ok(await until(() => q.get(first.id).status === STATUS.RUNNING));

  const cancelled = q.cancel(queued.id);
  assert.equal(cancelled.status, STATUS.CANCELLED);
  assert.ok(await until(() => q.get(first.id).status === STATUS.COMPLETED, 3000));
  await sleep(20);
  assert.equal(ran, 1, 'شُغّلت وظيفة أُلغيت قبل بدئها');
  await q.close();
});

test('إلغاء وظيفة تعمل: ترفع signal وتنتهي كـ cancelled', async () => {
  const q = createQueue({ concurrency: 1 });
  let sawAbort = false;
  q.registerHandler('watch', async (payload, ctx) => {
    for (let i = 0; i < 50; i++) {
      if (ctx.signal.aborted) { sawAbort = true; throw new Error('aborted'); }
      await sleep(5);
    }
    return 'finished';
  });
  const job = q.enqueue('watch', {});
  assert.ok(await until(() => q.get(job.id).status === STATUS.RUNNING));
  q.cancel(job.id);
  assert.ok(await until(() => q.get(job.id).status === STATUS.CANCELLED, 3000));
  assert.ok(sawAbort, 'لم تصل الإشارة إلى المعالج');
  await q.close();
});

test('إلغاء وظيفة منتهية: لا يغيّر نتيجتها', async () => {
  const q = createQueue({ concurrency: 1 });
  q.registerHandler('quick', async () => 'ok');
  const job = q.enqueue('quick', {});
  assert.ok(await until(() => q.get(job.id).status === STATUS.COMPLETED));
  const after = q.cancel(job.id);
  assert.equal(after.status, STATUS.COMPLETED);
  assert.equal(after.result, 'ok');
  await q.close();
});

test('إلغاء معرّف مجهول → null لا استثناء', async () => {
  const q = createQueue({});
  assert.equal(q.cancel('لا-وجود-له'), null);
  await q.close();
});

// ===== 4) التقدّم =====

test('التقدّم: المرحلة والنسبة تُحفظان وتُبثّان', async () => {
  const q = createQueue({ concurrency: 1 });
  q.registerHandler('staged', async (p, ctx) => {
    ctx.progress('downloading', 25);
    await sleep(5);
    ctx.progress('transcribing', 60);
    await sleep(5);
    return 'ok';
  });
  const seen = [];
  const job = q.enqueue('staged', {});
  const off = q.subscribe(job.id, (j) => seen.push(`${j.progress.stage}:${j.progress.percent}`));
  assert.ok(await until(() => q.get(job.id).status === STATUS.COMPLETED));
  off();
  assert.ok(seen.includes('downloading:25'), `لم تُبثّ المرحلة الأولى: ${seen.join(' | ')}`);
  assert.ok(seen.includes('transcribing:60'), `لم تُبثّ المرحلة الثانية: ${seen.join(' | ')}`);
  assert.deepEqual(q.get(job.id).progress, { stage: 'done', percent: 100 });
  await q.close();
});

test('التقدّم: النسبة محصورة بين 0 و100', async () => {
  const q = createQueue({ concurrency: 1 });
  let snap = null;
  q.registerHandler('odd', async (p, ctx) => {
    ctx.progress('a', -50);
    snap = q.get(ctx.jobId).progress.percent;
    ctx.progress('b', 999);
    return q.get(ctx.jobId).progress.percent;
  });
  const high = await q.run('odd', {});
  assert.equal(snap, 0, 'لم تُحصر النسبة السالبة');
  assert.equal(high, 100, 'لم تُحصر النسبة فوق المئة');
  await q.close();
});

// ===== 5) حدود الموارد =====

test('طابور ممتلئ → queue-full بدل نموّ ذاكرة غير محدود', async () => {
  const q = createQueue({ concurrency: 1, maxQueued: 2 });
  q.registerHandler('hold', async () => { await sleep(50); });
  q.enqueue('hold', {}); // تعمل
  assert.ok(await until(() => q.stats().running === 1));
  q.enqueue('hold', {}); // منتظرة 1
  q.enqueue('hold', {}); // منتظرة 2 — الطابور امتلأ
  assert.throws(() => q.enqueue('hold', {}), (e) => e.code === 'queue-full');
  await q.close();
});

test('stats: يعكس التزامن والانتظار', async () => {
  const q = createQueue({ concurrency: 2, maxQueued: 10 });
  q.registerHandler('hold', async () => { await sleep(40); });
  for (let i = 0; i < 5; i++) q.enqueue('hold', {});
  assert.ok(await until(() => q.stats().running === 2));
  const s = q.stats();
  assert.equal(s.concurrency, 2);
  assert.equal(s.running, 2);
  assert.equal(s.queued, 3);
  assert.equal(s.maxQueued, 10);
  await q.close();
});

test('التنظيف: الوظيفة المنتهية تُحذف بعد TTL', async () => {
  const q = createQueue({ concurrency: 1, ttlMs: 1000 }); // الحد الأدنى المسموح
  q.registerHandler('quick', async () => 'ok');
  const job = q.enqueue('quick', {});
  assert.ok(await until(() => q.get(job.id).status === STATUS.COMPLETED));
  assert.ok(q.get(job.id), 'يجب أن تبقى متاحة قبل انتهاء TTL');
  assert.ok(await until(() => q.get(job.id) === null, 3000), 'لم تُنظَّف بعد TTL');
  await q.close();
});

test('close: يُلغي كل ما لم ينتهِ ويمنع إضافة جديد', async () => {
  const q = createQueue({ concurrency: 1 });
  q.registerHandler('hold', async () => { await sleep(200); });
  const a = q.enqueue('hold', {});
  const b = q.enqueue('hold', {});
  await until(() => q.get(a.id).status === STATUS.RUNNING);
  await q.close();
  assert.equal(q.get(b.id).status, STATUS.CANCELLED);
  assert.throws(() => q.enqueue('hold', {}), (e) => e.code === 'queue-closed');
});

// ===== 6) الاشتراك =====

test('subscribe: يعيد دالة إلغاء اشتراك فعّالة', async () => {
  const q = createQueue({ concurrency: 1 });
  q.registerHandler('staged', async (p, ctx) => { ctx.progress('x', 10); await sleep(10); return 'ok'; });
  const job = q.enqueue('staged', {});
  let count = 0;
  const off = q.subscribe(job.id, () => count++);
  await until(() => count > 0);
  const atUnsub = count;
  off();
  assert.ok(await until(() => q.get(job.id).status === STATUS.COMPLETED));
  assert.equal(count, atUnsub, 'استمر الاستماع بعد إلغاء الاشتراك');
  await q.close();
});
