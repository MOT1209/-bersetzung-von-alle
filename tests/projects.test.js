// tests/projects.test.js — القاعدة والمستودعات ومسارات المشاريع (P3b)
// قاعدة بيانات مؤقتة وتخزين مؤقت — لا تُلمس بيانات المشروع الحقيقية.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-proj-'));
process.env.DB_FILE = path.join(tmpDir, 'test.db');
process.env.STORAGE_DIR = path.join(tmpDir, 'storage');
process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX_HEAVY = '1000';
process.env.ADMIN_TOKEN = 'projects-test-admin';

const db = require('../server/db');
const repo = require('../server/db/projects');
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
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* تنظيف */ }
});

// كل عملية على مشروع تحتاج توكن المالك بعد §19؛ التوكن يُعاد عند الإنشاء وحده.
const api = (p, opts = {}) => fetch(baseUrl + p, {
  ...opts,
  headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
});
const post = (p, body, token) => api(p, {
  method: 'POST',
  body: JSON.stringify(body),
  headers: token ? { 'X-Project-Token': token } : {},
});
const owner = (token) => ({ 'X-Project-Token': token });
// ADMIN_TOKEN مضبوط في الأعلى — سرد كل المشاريع صار للأدمن وحده
const asAdmin = { 'x-admin-token': process.env.ADMIN_TOKEN };

// ===== 1) الترحيلات =====

test('الترحيلات: تُطبَّق مرة واحدة وتكون idempotent', () => {
  const handle = db.getDb();
  const applied = handle.prepare('SELECT version, name FROM schema_migrations').all();
  assert.ok(applied.length >= 2);
  assert.equal(applied[0].version, 1);
  assert.equal(applied[1].version, 2, 'ترحيل owner_hash (§19) غير مُطبَّق');
  // إعادة التشغيل لا تُعيد التطبيق ولا ترمي
  db.migrate(handle);
  assert.equal(handle.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, applied.length);
});

test('المفاتيح الأجنبية مفعّلة (بدونها لا يعمل ON DELETE CASCADE)', () => {
  assert.equal(db.getDb().prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
});

// ===== 2) المستودع =====

test('createProject/getProject: يحفظ الحقول ويحوّل JSON', () => {
  const p = repo.createProject({ name: 'دورتي', sourceType: 'upload', targetLangs: ['ar', 'de'] });
  assert.ok(p.id);
  assert.equal(p.name, 'دورتي');
  assert.deepEqual(p.targetLangs, ['ar', 'de']);
  assert.equal(p.status, 'draft');
  // التوكن يُعاد عند الإنشاء وحده ولا يظهر في القراءة (§19)
  assert.ok(p.ownerToken);
  const { ownerToken, ...stored } = p;
  assert.deepEqual(repo.getProject(p.id), stored);
});

test('createProject: يرفض المدخلات غير الصالحة', () => {
  assert.throws(() => repo.createProject({ name: '' }), (e) => e.code === 'invalid-project');
  assert.throws(() => repo.createProject({ name: 'x', status: 'ghost' }), (e) => e.code === 'invalid-project');
  assert.throws(() => repo.createProject({ name: 'x', targetLangs: 'ar' }), (e) => e.code === 'invalid-project');
});

test('getProject لمعرّف مجهول يعيد null', () => {
  assert.equal(repo.getProject('no-such-id'), null);
});

test('updateProject: تعديل جزئي يحفظ بقية الحقول', () => {
  const p = repo.createProject({ name: 'قبل', targetLangs: ['ar'] });
  const up = repo.updateProject(p.id, { status: 'processing' });
  assert.equal(up.status, 'processing');
  assert.equal(up.name, 'قبل', 'ضاع حقل لم يُطلب تعديله');
  assert.deepEqual(up.targetLangs, ['ar']);
  assert.ok(up.updatedAt >= p.updatedAt);
  assert.equal(repo.updateProject('no-such-id', { name: 'x' }), null);
});

test('listProjects: الأحدث أولا مع حد وإزاحة', () => {
  const before = repo.countProjects();
  const a = repo.createProject({ name: 'first' });
  const b = repo.createProject({ name: 'second' });
  const list = repo.listProjects({ limit: 2 });
  assert.equal(repo.countProjects(), before + 2);
  assert.ok([a.id, b.id].includes(list[0].id));
  assert.equal(repo.listProjects({ limit: 1, offset: 0 }).length, 1);
});

// ===== 3) الأصول والحذف المتسلسل =====

test('addAsset: يربط بالمشروع ويرفض النوع المجهول', () => {
  const p = repo.createProject({ name: 'with-assets' });
  const a = repo.addAsset(p.id, { kind: 'media', storageKey: `projects/${p.id}/media/x.mp4`, bytes: 10 });
  assert.equal(a.projectId, p.id);
  assert.equal(a.kind, 'media');
  assert.deepEqual(repo.listAssets(p.id).map((x) => x.id), [a.id]);
  assert.throws(() => repo.addAsset(p.id, { kind: 'ghost', storageKey: 'k' }), (e) => e.code === 'invalid-asset');
  assert.throws(() => repo.addAsset('no-such-id', { kind: 'media', storageKey: 'k' }), (e) => e.code === 'project-not-found');
});

test('listAssets: فلترة حسب النوع', () => {
  const p = repo.createProject({ name: 'filter' });
  repo.addAsset(p.id, { kind: 'media', storageKey: 'k1' });
  repo.addAsset(p.id, { kind: 'subtitle', storageKey: 'k2' });
  assert.equal(repo.listAssets(p.id, { kind: 'subtitle' }).length, 1);
  assert.equal(repo.listAssets(p.id).length, 2);
});

test('deleteProject: يحذف الأصول متسلسلا والملفات المخزنة (البند 59)', async () => {
  const { storage } = require('../server/providers/storage');
  const created = await (await post('/api/projects', { name: 'to-delete' })).json();
  const asset = await (await post(`/api/projects/${created.id}/assets`, {
    kind: 'media', content: Buffer.from('content').toString('base64'), filename: 'v.mp4',
  }, created.ownerToken)).json();

  assert.ok(await storage().exists(asset.storageKey), 'لم يكتب الملف اصلا');
  assert.equal(await repo.deleteProject(created.id), true);

  assert.equal(repo.getProject(created.id), null);
  assert.equal(repo.getAsset(asset.id), null, 'بقي اصل يتيم — CASCADE لا يعمل');
  assert.equal(await storage().exists(asset.storageKey), false, 'بقي الملف على القرص بعد حذف المشروع');
  assert.equal(await repo.deleteProject(created.id), false); // حذف متكرر آمن
});

// ===== 4) المسارات =====

test('POST/GET /api/projects: إنشاء وقائمة', async () => {
  const res = await post('/api/projects', { name: 'via-api', targetLangs: ['ar'] });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.name, 'via-api');

  const list = await (await api('/api/projects', { headers: asAdmin })).json();
  assert.ok(Array.isArray(list.projects));
  assert.ok(list.total >= 1);
  assert.ok(list.projects.some((p) => p.id === created.id));
});

test('POST /api/projects: اسم فارغ يعطي 400', async () => {
  const res = await post('/api/projects', { name: '   ' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid-project');
});

test('GET /api/projects/:id: يعيد المشروع مع أصوله، والمجهول 404', async () => {
  const created = await (await post('/api/projects', { name: 'with-assets-api' })).json();
  await post(`/api/projects/${created.id}/assets`, {
    kind: 'subtitle', content: Buffer.from('sub').toString('base64'), filename: 's.srt', mime: 'text/plain',
  }, created.ownerToken);
  const full = await (await api(`/api/projects/${created.id}`, { headers: owner(created.ownerToken) })).json();
  assert.equal(full.assets.length, 1);
  assert.equal(full.assets[0].kind, 'subtitle');
  assert.equal((await api('/api/projects/ghost')).status, 404);
});

test('PATCH /api/projects/:id: تعديل، والمجهول 404', async () => {
  const created = await (await post('/api/projects', { name: 'to-patch' })).json();
  const res = await api(`/api/projects/${created.id}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'ready' }), headers: owner(created.ownerToken),
  });
  assert.equal((await res.json()).status, 'ready');
  const missing = await api('/api/projects/ghost', { method: 'PATCH', body: JSON.stringify({ name: 'x' }) });
  assert.equal(missing.status, 404);
});

test('رفع أصل: يخزن المحتوى وينزل كما هو', async () => {
  const created = await (await post('/api/projects', { name: 'download' })).json();
  const payload = Buffer.from('binary-ish payload');
  const asset = await (await post(`/api/projects/${created.id}/assets`, {
    kind: 'audio', content: payload.toString('base64'), filename: 'a.mp3', mime: 'audio/mpeg',
  }, created.ownerToken)).json();
  assert.equal(asset.bytes, payload.length);

  const dl = await api(`/api/projects/${created.id}/assets/${asset.id}/content`, { headers: owner(created.ownerToken) });
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get('content-type'), 'audio/mpeg');
  assert.deepEqual(Buffer.from(await dl.arrayBuffer()), payload);
});

test('رفع أصل: اسم ملف خبيث لا يخرج عن مجلد المشروع', async () => {
  const created = await (await post('/api/projects', { name: 'evil-name' })).json();
  const evil = '../../../etc/passwd';
  const asset = await (await post(`/api/projects/${created.id}/assets`, {
    kind: 'media', content: Buffer.from('x').toString('base64'), filename: evil,
  }, created.ownerToken)).json();
  // المفتاح يولد ولا يشتق من اسم المستخدم — الاسم الأصلي يبقى في meta فقط
  assert.ok(asset.storageKey.startsWith(`projects/${created.id}/media/`), `مفتاح خطير: ${asset.storageKey}`);
  assert.ok(!asset.storageKey.includes('..'));
  assert.equal(asset.meta.originalName, evil);
});

test('رفع أصل: نوع غير معروف أو محتوى فارغ 400، ومشروع مجهول 404', async () => {
  const created = await (await post('/api/projects', { name: 'reject' })).json();
  const t = created.ownerToken;
  assert.equal((await post(`/api/projects/${created.id}/assets`, { kind: 'ghost', content: 'eA==' }, t)).status, 400);
  assert.equal((await post(`/api/projects/${created.id}/assets`, { kind: 'media', content: '' }, t)).status, 400);
  assert.equal((await post('/api/projects/ghost/assets', { kind: 'media', content: 'eA==' }, t)).status, 404);
});

test('أصل من مشروع آخر لا يقرأ عبر مشروع ثان', async () => {
  const p1 = await (await post('/api/projects', { name: 'one' })).json();
  const p2 = await (await post('/api/projects', { name: 'two' })).json();
  const asset = await (await post(`/api/projects/${p1.id}/assets`, {
    kind: 'media', content: Buffer.from('secret').toString('base64'),
  }, p1.ownerToken)).json();
  // معرف الأصل وحده لا يكفي — يجب أن ينتمي للمشروع في المسار (حتى بتوكن صحيح لـp2)
  assert.equal((await api(`/api/projects/${p2.id}/assets/${asset.id}/content`, { headers: owner(p2.ownerToken) })).status, 404);
  assert.equal((await api(`/api/projects/${p1.id}/assets/${asset.id}/content`, { headers: owner(p1.ownerToken) })).status, 200);
});

test('DELETE /api/projects/:id/assets/:assetId: يحذف الأصل وملفه', async () => {
  const { storage } = require('../server/providers/storage');
  const created = await (await post('/api/projects', { name: 'del-asset' })).json();
  const asset = await (await post(`/api/projects/${created.id}/assets`, {
    kind: 'export', content: Buffer.from('x').toString('base64'),
  }, created.ownerToken)).json();
  const res = await api(`/api/projects/${created.id}/assets/${asset.id}`, {
    method: 'DELETE', headers: owner(created.ownerToken),
  });
  assert.equal(res.status, 200);
  assert.equal(repo.getAsset(asset.id), null);
  assert.equal(await storage().exists(asset.storageKey), false);
});

test('DELETE /api/projects/:id: يعيد 404 للمجهول', async () => {
  assert.equal((await api('/api/projects/ghost', { method: 'DELETE' })).status, 404);
});
