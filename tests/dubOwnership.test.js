// tests/dubOwnership.test.js — عزل مشاريع الدبلجة بين الزوّار (CURRENT_STATE.md §20)
//
// قبل هذا كانت المسارات الستة مفتوحة تمامًا: أي زائر يقرأ حالة مهام غيره، وينزّل
// الفيديوهات التي أنتجها غيره، **ويحذف مشاريعهم**. هذه الاختبارات تثبّت الإغلاق.
//
// لا شبكة ولا ffmpeg هنا: نكتب ملفات المشروع مباشرة على القرص ونمتحن المسارات.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';
process.env.RATE_LIMIT_MAX_DUB = '1000';
process.env.ADMIN_TOKEN = 'dub-test-admin';

const { createOwner } = require('../server/dubbing/dub-owner');
const { PROJECTS_DIR } = require('../server/dubbing/dubbing-pipeline');
const jobs = require('../server/jobs/job-manager');
const app = require('../server/server');

let server;
let baseUrl;
const made = [];

before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  for (const pid of made) {
    try { fs.rmSync(path.join(PROJECTS_DIR, pid), { recursive: true, force: true }); } catch { /* تنظيف */ }
  }
  delete process.env.ADMIN_TOKEN;
});

const api = (p, opts = {}) => fetch(baseUrl + p, opts);
const owner = (token) => ({ 'X-Project-Token': token });

// ينشئ مشروع دبلجة على القرص بمالك ومهمة وملف نتيجة — بلا تشغيل خط الأنابيب
function seedProject(name) {
  const pid = `test-own-${name}-${Date.now().toString(36)}`;
  made.push(pid);
  const dir = path.join(PROJECTS_DIR, pid);
  fs.mkdirSync(dir, { recursive: true });
  const token = createOwner(PROJECTS_DIR, pid);
  fs.writeFileSync(path.join(dir, 'subtitles-ar.srt'), '1\n00:00:00,000 --> 00:00:01,000\nمرحبا\n');
  const job = jobs.createJob({ type: 'youtube-dub', projectId: pid, params: {} });
  return { pid, token, jobId: job.id };
}

// ===== 1) التوكن =====

test('createOwner: توكن 64 حرفًا، ولا يُخزَّن نصًّا على القرص', () => {
  const { pid, token } = seedProject('tok');
  assert.equal(token.length, 64, '32 بايت = 64 حرفًا hex');
  const raw = fs.readFileSync(path.join(PROJECTS_DIR, pid, 'owner.json'), 'utf8');
  assert.ok(!raw.includes(token), 'التوكن نفسه مكتوب على القرص — يجب أن تُخزَّن تجزئته فقط');
  assert.ok(JSON.parse(raw).ownerHash, 'لا توجد تجزئة مالك');
});

// ===== 2) العزل =====

test('بلا توكن: كل مسارات المشروع والمهمة 404', async () => {
  const { pid, jobId } = seedProject('anon');
  assert.equal((await api(`/api/dub/projects/${pid}/jobs`)).status, 404);
  assert.equal((await api(`/api/dub/projects/${pid}/subtitles-ar.srt`)).status, 404);
  assert.equal((await api(`/api/dub/jobs/${jobId}`)).status, 404);
  assert.equal((await api(`/api/dub/projects/${pid}`, { method: 'DELETE' })).status, 404);
  // والأهم: الحذف لم يحدث فعلًا، لا أنه ردّ 404 وحذف
  assert.ok(fs.existsSync(path.join(PROJECTS_DIR, pid)), 'حُذف المشروع رغم رفض الطلب');
});

test('بالتوكن الصحيح: القراءة والتنزيل يعملان', async () => {
  const { pid, token, jobId } = seedProject('ok');
  assert.equal((await api(`/api/dub/projects/${pid}/jobs`, { headers: owner(token) })).status, 200);
  assert.equal((await api(`/api/dub/jobs/${jobId}`, { headers: owner(token) })).status, 200);

  const dl = await api(`/api/dub/projects/${pid}/subtitles-ar.srt`, { headers: owner(token) });
  assert.equal(dl.status, 200);
  assert.match(await dl.text(), /مرحبا/);
});

test('توكن مشروع آخر لا يفتح هذا المشروع', async () => {
  const a = seedProject('a');
  const b = seedProject('b');
  assert.equal((await api(`/api/dub/projects/${a.pid}/jobs`, { headers: owner(b.token) })).status, 404);
  assert.equal((await api(`/api/dub/jobs/${a.jobId}`, { headers: owner(b.token) })).status, 404);
  assert.equal((await api(`/api/dub/projects/${a.pid}/subtitles-ar.srt`, { headers: owner(b.token) })).status, 404);
});

test('توكن مزيّف بالطول نفسه يُرفض', async () => {
  const { pid } = seedProject('fake');
  assert.equal((await api(`/api/dub/projects/${pid}/jobs`, { headers: owner('f'.repeat(64)) })).status, 404);
});

test('مشروع قديم بلا owner.json يُرفض دائمًا (fail-closed)', async () => {
  const pid = `test-own-legacy-${Date.now().toString(36)}`;
  made.push(pid);
  fs.mkdirSync(path.join(PROJECTS_DIR, pid), { recursive: true });
  // بلا owner.json: لا توكن يفتحه، ولا غيابُ التوكن يفتحه
  assert.equal((await api(`/api/dub/projects/${pid}/jobs`)).status, 404);
  assert.equal((await api(`/api/dub/projects/${pid}/jobs`, { headers: owner('x'.repeat(64)) })).status, 404);
});

// ===== 3) التوكن في الاستعلام (EventSource و<video src> لا ترسل رؤوسًا) =====

test('?token= يعمل حيث لا يمكن إرسال رأس', async () => {
  const { pid, token } = seedProject('query');
  const ok = await api(`/api/dub/projects/${pid}/subtitles-ar.srt?token=${token}`);
  assert.equal(ok.status, 200);
  const bad = await api(`/api/dub/projects/${pid}/subtitles-ar.srt?token=${'0'.repeat(64)}`);
  assert.equal(bad.status, 404);
});

// ===== 4) الأدمن يتجاوز =====

test('الأدمن يقرأ أي مشروع بلا توكن مالك', async () => {
  const { pid } = seedProject('admin');
  const res = await api(`/api/dub/projects/${pid}/jobs`, { headers: { 'x-admin-token': 'dub-test-admin' } });
  assert.equal(res.status, 200);
});

// ===== 5) owner.json نفسه ليس قابلًا للتنزيل =====

test('owner.json خارج قائمة الملفات المسموحة — لا يُنزَّل ولو بالتوكن', async () => {
  const { pid, token } = seedProject('leak');
  const res = await api(`/api/dub/projects/${pid}/owner.json`, { headers: owner(token) });
  assert.equal(res.status, 400, 'تجزئة المالك يجب ألّا تُخدَم عبر HTTP إطلاقًا');
});
