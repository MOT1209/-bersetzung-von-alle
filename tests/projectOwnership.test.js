// tests/projectOwnership.test.js — عزل المشاريع بين الزوار (CURRENT_STATE.md §19)
//
// قبل هذا كان أي زائر يسرد كل المشاريع، وينزّل ملفات غيره، ويحذفها. هذه
// الاختبارات تثبّت العزل: التوكن يُعاد مرة واحدة، ومن لا يملكه يرى 404.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-own-'));
process.env.DB_FILE = path.join(tmpDir, 'test.db');
process.env.STORAGE_DIR = path.join(tmpDir, 'storage');
process.env.CACHE_FILE = path.join(tmpDir, 'cache.json');
process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';
process.env.ADMIN_TOKEN = 'test-admin-token';

const db = require('../server/db');
const app = require('../server/server');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  db.closeDb();
  delete process.env.ADMIN_TOKEN;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* تنظيف */ }
});

const api = (p, opts = {}) => fetch(baseUrl + p, {
  ...opts,
  headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
});
const owner = (token) => ({ 'X-Project-Token': token });

async function newProject(name = 'مشروع') {
  const res = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name }) });
  return res.json();
}

// ===== 1) التوكن =====

test('الإنشاء يعيد ownerToken مرة واحدة فقط — ولا يظهر في أي قراءة لاحقة', async () => {
  const p = await newProject('توكن');
  assert.ok(p.ownerToken, 'لم يُعَد توكن مالك عند الإنشاء');
  assert.equal(p.ownerToken.length, 64, 'توكن قصير: 32 بايت = 64 حرفًا hex');

  const read = await (await api(`/api/projects/${p.id}`, { headers: owner(p.ownerToken) })).json();
  assert.equal(read.id, p.id);
  assert.equal(read.ownerToken, undefined, 'التوكن تسرّب في قراءة لاحقة');
});

// ===== 2) العزل بين الزوار =====

test('زائر بلا توكن: كل عمليات المشروع 404 (لا 403 — لا نؤكّد وجود المعرّف)', async () => {
  const p = await newProject('خاص');

  assert.equal((await api(`/api/projects/${p.id}`)).status, 404);
  assert.equal((await api(`/api/projects/${p.id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await api(`/api/projects/${p.id}`, { method: 'PATCH', body: '{"name":"x"}' })).status, 404);
  assert.equal((await api(`/api/projects/${p.id}/assets`, {
    method: 'POST',
    body: JSON.stringify({ kind: 'media', content: 'AAAA' }),
  })).status, 404);
});

test('توكن مشروع آخر لا يفتح هذا المشروع', async () => {
  const a = await newProject('أ');
  const b = await newProject('ب');
  assert.equal((await api(`/api/projects/${a.id}`, { headers: owner(b.ownerToken) })).status, 404);
  assert.equal((await api(`/api/projects/${b.id}`, { headers: owner(a.ownerToken) })).status, 404);
  // وبتوكنه الصحيح يعمل — الرفض ليس عطلًا عامًّا
  assert.equal((await api(`/api/projects/${a.id}`, { headers: owner(a.ownerToken) })).status, 200);
});

test('توكن مزيّف بالطول نفسه يُرفض', async () => {
  const p = await newProject('مزيّف');
  const fake = 'f'.repeat(64);
  assert.equal((await api(`/api/projects/${p.id}`, { headers: owner(fake) })).status, 404);
});

test('المالك ينزّل أصله، وغيره لا — حتى لو عرف معرّفي المشروع والأصل', async () => {
  const p = await newProject('أصل');
  const asset = await (await api(`/api/projects/${p.id}/assets`, {
    method: 'POST',
    headers: owner(p.ownerToken),
    body: JSON.stringify({ kind: 'subtitle', content: Buffer.from('hello').toString('base64') }),
  })).json();

  const mine = await api(`/api/projects/${p.id}/assets/${asset.id}/content`, { headers: owner(p.ownerToken) });
  assert.equal(mine.status, 200);
  assert.equal(await mine.text(), 'hello');

  const theirs = await api(`/api/projects/${p.id}/assets/${asset.id}/content`);
  assert.equal(theirs.status, 404, 'ملف مستخدم آخر كان قابلًا للتنزيل بلا توكن');
});

// ===== 3) قائمة كل المشاريع =====

test('GET /api/projects: للأدمن وحده — الزائر لا يسرد مشاريع غيره', async () => {
  await newProject('في القائمة');

  assert.equal((await api('/api/projects')).status, 401);
  assert.equal((await api('/api/projects', { headers: { 'x-admin-token': 'wrong' } })).status, 401);

  const asAdmin = await api('/api/projects', { headers: { 'x-admin-token': 'test-admin-token' } });
  assert.equal(asAdmin.status, 200);
  assert.ok((await asAdmin.json()).projects.length > 0);
});

test('الأدمن يتجاوز توكن الملكية (اللوحة ترى كل شيء)', async () => {
  const p = await newProject('للأدمن');
  const res = await api(`/api/projects/${p.id}`, { headers: { 'x-admin-token': 'test-admin-token' } });
  assert.equal(res.status, 200);
});

// ===== 4) دخول الأدمن بكوكي httpOnly (دين §8.6) =====

test('POST /api/admin/login: يعيد كوكي httpOnly ولا يقبل مفتاحًا خاطئًا', async () => {
  const bad = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ token: 'nope' }) });
  assert.equal(bad.status, 401);

  const ok = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ token: 'test-admin-token' }) });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie') || '';
  assert.match(cookie, /aralink_admin=/);
  assert.match(cookie, /HttpOnly/i, 'الكوكي ليس httpOnly — جافاسكربت يقرأه');
  assert.match(cookie, /SameSite=Strict/i, 'بلا SameSite=Strict يبقى الطريق مفتوحًا لـCSRF');
});

test('الكوكي وحده يكفي للوصول الإداري (بلا رأس x-admin-token)', async () => {
  const res = await api('/api/projects', {
    headers: { cookie: 'aralink_admin=test-admin-token' },
  });
  assert.equal(res.status, 200);
});

test('كوكي خاطئ لا يُقبل', async () => {
  const res = await api('/api/projects', { headers: { cookie: 'aralink_admin=wrong' } });
  assert.equal(res.status, 401);
});
