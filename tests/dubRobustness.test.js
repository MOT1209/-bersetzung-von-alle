// tests/dubRobustness.test.js — إصلاحات الصحّة الخمسة (CURRENT_STATE.md §21)
//
// كلها عيوب «تفشل بصمت أو تُبلغ حالة خاطئة» لا ثغرات: مهمة ناجحة تُعرض منقطعة،
// ورمز خطأ رقمي بدل نصّي، وأصوات عصبية ميتة بلا أثر في السجل، وبثّ لا يُغلق.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const jobs = require('../server/jobs/job-manager');
const { run } = require('../server/dubbing/ffmpeg');

// ===== 1) الإخراج من الذاكرة لا يمسّ مهمة جارية =====

test('تجاوز السقف يُخرج مهمة منتهية لا مهمة جارية', () => {
  jobs._testClear();
  const pid = 'test-evict-' + Date.now().toString(36);

  // مهمة طويلة تبدأ أولًا (أقدم الكل) وتبقى processing — كانت أول المرشّحين للإخراج
  const running = jobs.createJob({ type: 'youtube-dub', projectId: pid, params: {} });
  jobs.updateJob(running.id, { status: 'processing', stage: 'دبلجة…', progress: 10 });

  // ثم فيض من المهام المنتهية يتجاوز MAX_JOBS
  for (let i = 0; i < 260; i++) {
    const j = jobs.createJob({ type: 'youtube-dub', projectId: pid, params: {} });
    jobs.updateJob(j.id, { status: 'completed', progress: 100 });
  }

  const still = jobs.getJob(running.id);
  assert.ok(still, 'أُخرجت مهمة جارية من الذاكرة — ستُبلَّغ «منقطعة» رغم نجاحها');
  assert.equal(still.status, 'processing');

  // والأهم: تحديثها ما زال يعمل (كان updateJob يعيد null بصمت بعد الإخراج)
  const done = jobs.updateJob(running.id, { status: 'completed', progress: 100, result: { ok: true } });
  assert.ok(done, 'updateJob أعاد null — الحالة النهائية لن تُحفظ ولا تُبثّ');
  assert.equal(jobs.getJob(running.id).status, 'completed');

  jobs._testClear();
  try { fs.rmSync(path.join(jobs.PROJECTS_DIR, pid), { recursive: true, force: true }); } catch { /* تنظيف */ }
});

// ===== 2) رموز ffmpeg نصّية لا أرقام خروج =====

test('ffmpeg: ثنائي غير موجود → ffmpeg-missing لا ENOENT', async () => {
  await assert.rejects(
    () => run('ffmpeg-does-not-exist-xyz', ['-version']),
    (e) => e.code === 'ffmpeg-missing',
  );
});

test('ffmpeg: فشل غير صفري → ffmpeg-failed لا رقم خروج', async () => {
  // 'node -e process.exit(3)' يفشل برمز 3؛ الغلاف يجب أن يحوّله إلى رمز نصّي
  await assert.rejects(
    () => run(process.execPath, ['-e', 'process.exit(3)']),
    (e) => {
      assert.equal(e.code, 'ffmpeg-failed', `تسرّب رمز غير نصّي: ${e.code}`);
      assert.notEqual(e.code, 3);
      return true;
    },
  );
});

test('ffmpeg: تجاوز المهلة → ffmpeg-timeout (لا server-error عام)', async () => {
  await assert.rejects(
    () => run(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], { timeout: 300 }),
    (e) => e.code === 'ffmpeg-timeout',
  );
});

// ===== 3) الأصوات العصبية: الغياب حالة معلَنة لا صمت =====

test('edge-tts: الوحدة معلَنة في package.json كتبعية اختيارية', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.ok(pkg.optionalDependencies && pkg.optionalDependencies['msedge-tts'],
    'msedge-tts مستوردة في edge-tts.js لكنها غير معلنة — الأصوات العصبية تموت بصمت');
  assert.ok(!(pkg.dependencies && pkg.dependencies['msedge-tts']),
    'يجب أن تبقى اختيارية: فشل جلبها لا يجوز أن يُفشل التثبيت');
});

test('edge-tts: مدخلات غير صالحة ترفع رموزًا نصّية ثابتة', async () => {
  const edge = require('../server/edge-tts');
  await assert.rejects(() => edge.synthesize('', { voice: 'ar-SA-HamedNeural' }), (e) => e.code === 'invalid-text');
  await assert.rejects(() => edge.synthesize('نص', {}), (e) => e.code === 'invalid-voice');
  await assert.rejects(() => edge.synthesize('x'.repeat(6000), { voice: 'ar-SA-HamedNeural' }), (e) => e.code === 'text-too-long');
});

// ===== 4) البثّ يُغلق من الخادم عند الحالة النهائية =====

test('broadcast: الحالة النهائية تُنهي اتصال المشترك وتحذف مدخله', () => {
  jobs._testClear();
  const pid = 'test-sse-' + Date.now().toString(36);
  const job = jobs.createJob({ type: 'youtube-dub', projectId: pid, params: {} });

  // ردّ مزيّف يسجّل ما يجري عليه (يكفي write/end/on لعقد subscribe)
  const written = [];
  let ended = false;
  const fakeRes = {
    write: (s) => { written.push(s); return true; },
    end: () => { ended = true; },
    on: () => {},
  };
  jobs.subscribe(job.id, fakeRes);

  jobs.updateJob(job.id, { status: 'processing', progress: 50 });
  assert.ok(written.length >= 1, 'لم يصل أي حدث تقدّم');
  assert.equal(ended, false, 'أُغلق الاتصال قبل الحالة النهائية');

  jobs.updateJob(job.id, { status: 'completed', progress: 100 });
  assert.equal(ended, true, 'الخادم لم يغلق البثّ عند الاكتمال — يبقى المقبس مفتوحًا بلا نهاية');

  // بثّ لاحق على المهمة نفسها لا يكتب على ردّ مُغلق
  const before = written.length;
  jobs.updateJob(job.id, { stage: 'بعد الإغلاق' });
  assert.equal(written.length, before, 'كُتب على مشترك أُغلق أصلًا');

  jobs._testClear();
  try { fs.rmSync(path.join(jobs.PROJECTS_DIR, pid), { recursive: true, force: true }); } catch { /* تنظيف */ }
});

// مهمة انتهت **قبل** الاشتراك: حالة فاتت اختبارَ الوحدة أعلاه وكشفها فحص حيّ.
// broadcast يُنادى من updateJob وحده، فلو انتهت المهمة قبل فتح البثّ لم يقع أي
// حدث بعدها ولا شيء يغلق الاتصال — وهي الحالة الشائعة (فشل سريع كـytdlp-missing
// يقع قبل أن يفتح المتصفح البثّ). لذلك تُفحص هنا عبر HTTP حقيقي لا بردّ مزيّف.
test('البثّ: مهمة منتهية سلفًا تُغلق فورًا لا تبقى معلّقة', async () => {
  const { once } = require('node:events');
  const { createOwner } = require('../server/dubbing/dub-owner');
  const app = require('../server/server');

  const srv = app.listen(0);
  await once(srv, 'listening');
  const base = `http://127.0.0.1:${srv.address().port}`;
  const pid = 'test-sse-done-' + Date.now().toString(36);
  fs.mkdirSync(path.join(jobs.PROJECTS_DIR, pid), { recursive: true });
  const token = createOwner(jobs.PROJECTS_DIR, pid);

  try {
    const job = jobs.createJob({ type: 'youtube-dub', projectId: pid, params: {} });
    jobs.updateJob(job.id, { status: 'failed', error: 'ytdlp-missing', progress: 100 });

    // لو لم يغلق الخادم لظلّ القارئ ينتظر إلى الأبد — المهلة تحرس ذلك
    const res = await fetch(`${base}/api/dub/jobs/${job.id}/stream?token=${token}`, {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(res.status, 200);
    const body = await res.text(); // ينتهي فقط إن أغلق الخادم
    assert.match(body, /ytdlp-missing/);
  } finally {
    srv.close();
    jobs._testClear();
    try { fs.rmSync(path.join(jobs.PROJECTS_DIR, pid), { recursive: true, force: true }); } catch { /* تنظيف */ }
  }
});

// ===== 5) الاستعادة من القرص لا تحجب الإقلاع =====

test('reloadFromDisk: مؤجَّلة عن تحميل الوحدة (لا تحجب حلقة الأحداث)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'jobs', 'job-manager.js'), 'utf8');
  assert.match(src, /setImmediate\(reloadFromDisk\)/,
    'الاستعادة تُنادى متزامنة وقت التحميل — تحجب الإقلاع بقدر ما تراكم من مشاريع');
  assert.doesNotMatch(src, /^reloadFromDisk\(\);$/m, 'بقي نداء متزامن عند التحميل');
  // وتبقى الدالة نفسها متزامنة وقابلة للنداء المباشر (الاختبارات تعتمد عليها)
  assert.equal(typeof jobs.reloadFromDisk, 'function');
});
