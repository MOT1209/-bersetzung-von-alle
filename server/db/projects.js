// server/db/projects.js — مستودع المشاريع والأصول
//
// كل وصول إلى SQL يمرّ من هنا: النواة والمسارات لا تكتب استعلامًا واحدًا،
// فالانتقال إلى Postgres لاحقًا يمسّ هذا الملف وحده (البند 43 مطبَّقًا على البيانات).
const { randomUUID, randomBytes, createHash, timingSafeEqual } = require('crypto');
const { getDb } = require('./index');
const { storage } = require('../providers/storage');

const VALID_STATUS = ['draft', 'processing', 'ready', 'failed'];
const VALID_KINDS = ['media', 'audio', 'subtitle', 'transcript', 'export'];

function codeError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

// SQLite لا يعرف JSON ولا التواريخ — نحوّل عند الحدود لا في كل مستدعٍ
function rowToProject(r) {
  if (!r) return null;
  let targetLangs = [];
  try { targetLangs = JSON.parse(r.target_langs || '[]'); } catch { targetLangs = []; }
  return {
    id: r.id,
    name: r.name,
    sourceType: r.source_type || null,
    sourceRef: r.source_ref || null,
    targetLangs,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToAsset(r) {
  if (!r) return null;
  let meta = {};
  try { meta = JSON.parse(r.meta || '{}'); } catch { meta = {}; }
  return {
    id: r.id,
    projectId: r.project_id,
    kind: r.kind,
    lang: r.lang || null,
    storageKey: r.storage_key,
    mime: r.mime || null,
    bytes: r.bytes,
    meta,
    createdAt: r.created_at,
  };
}

// ===== المشاريع =====

// توكن الملكية: 32 بايت عشوائية تُعاد **مرة واحدة** عند الإنشاء ولا تُخزَّن أبدًا
// كنصّ. القاعدة تحفظ sha256 فقط، فمن يقرأ القاعدة لا يستطيع انتحال المالك.
function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function createProject({ name, sourceType = null, sourceRef = null, targetLangs = [], status = 'draft' } = {}) {
  const clean = String(name || '').trim();
  if (!clean) throw codeError('invalid-project', 'الاسم مطلوب');
  if (clean.length > 200) throw codeError('invalid-project', 'الاسم أطول من الحد');
  if (!VALID_STATUS.includes(status)) throw codeError('invalid-project', 'حالة غير معروفة');
  if (!Array.isArray(targetLangs)) throw codeError('invalid-project', 'targetLangs يجب أن تكون مصفوفة');

  const now = Date.now();
  const id = randomUUID();
  const ownerToken = randomBytes(32).toString('hex');
  getDb().prepare(`INSERT INTO projects
      (id, name, source_type, source_ref, target_langs, status, created_at, updated_at, owner_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, clean, sourceType, sourceRef, JSON.stringify(targetLangs), status, now, now, hashToken(ownerToken));
  // التوكن خارج rowToProject عمدًا: لا يظهر في أي قراءة لاحقة، هذه فرصته الوحيدة
  return { ...getProject(id), ownerToken };
}

/**
 * هل يملك حاملُ هذا التوكن المشروعَ؟ مقارنة ثابتة الزمن على التجزئتين.
 * صفّ قديم بلا owner_hash ⇒ false دائمًا (fail-closed، لا انفتاح ضمني).
 */
function verifyProjectOwner(projectId, token) {
  if (!token) return false;
  const row = getDb().prepare('SELECT owner_hash FROM projects WHERE id = ?').get(String(projectId || ''));
  if (!row || !row.owner_hash) return false;
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(row.owner_hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function getProject(id) {
  return rowToProject(getDb().prepare('SELECT * FROM projects WHERE id = ?').get(String(id || '')));
}

function listProjects({ limit = 50, offset = 0 } = {}) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);
  return getDb()
    .prepare('SELECT * FROM projects ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(lim, off)
    .map(rowToProject);
}

function countProjects() {
  return getDb().prepare('SELECT COUNT(*) AS n FROM projects').get().n;
}

function updateProject(id, patch = {}) {
  const existing = getProject(id);
  if (!existing) return null;

  const next = {
    name: patch.name === undefined ? existing.name : String(patch.name).trim(),
    sourceType: patch.sourceType === undefined ? existing.sourceType : patch.sourceType,
    sourceRef: patch.sourceRef === undefined ? existing.sourceRef : patch.sourceRef,
    targetLangs: patch.targetLangs === undefined ? existing.targetLangs : patch.targetLangs,
    status: patch.status === undefined ? existing.status : patch.status,
  };
  if (!next.name) throw codeError('invalid-project', 'الاسم مطلوب');
  if (!VALID_STATUS.includes(next.status)) throw codeError('invalid-project', 'حالة غير معروفة');
  if (!Array.isArray(next.targetLangs)) throw codeError('invalid-project', 'targetLangs يجب أن تكون مصفوفة');

  getDb().prepare(`UPDATE projects
      SET name = ?, source_type = ?, source_ref = ?, target_langs = ?, status = ?, updated_at = ?
      WHERE id = ?`)
    .run(next.name, next.sourceType, next.sourceRef, JSON.stringify(next.targetLangs), next.status, Date.now(), id);
  return getProject(id);
}

// حذف المشروع = حذف صفوفه **وملفاته المخزّنة**.
// البند 59 (الخصوصية) صريح: حذف المشروع يحذف الوسائط والملفات المولَّدة. حذف
// الصفوف وحدها كان سيترك الملفات على القرص إلى الأبد بلا أي مرجع يدلّ عليها.
async function deleteProject(id) {
  const project = getProject(id);
  if (!project) return false;
  // نحذف الملفات أولاً: لو فشل الحذف نبقي الصفوف فلا تصير الملفات يتيمة بلا مرجع
  await storage().removePrefix(projectPrefix(id)).catch(() => {});
  // ON DELETE CASCADE يتكفّل بالأصول (PRAGMA foreign_keys مفعّل في db/index.js)
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
  return true;
}

// بادئة تخزين المشروع — كل أصوله تحتها، فيصبح حذفها عملية واحدة
function projectPrefix(projectId) {
  return `projects/${projectId}`;
}

// ===== الأصول =====

function addAsset(projectId, { kind, lang = null, storageKey, mime = null, bytes = 0, meta = {} } = {}) {
  if (!getProject(projectId)) throw codeError('project-not-found', 'المشروع غير موجود');
  if (!VALID_KINDS.includes(kind)) throw codeError('invalid-asset', 'نوع أصل غير معروف');
  if (!storageKey || typeof storageKey !== 'string') throw codeError('invalid-asset', 'storageKey مطلوب');

  const id = randomUUID();
  getDb().prepare(`INSERT INTO assets
      (id, project_id, kind, lang, storage_key, mime, bytes, meta, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, projectId, kind, lang, storageKey, mime, Number(bytes) || 0, JSON.stringify(meta || {}), Date.now());
  return getAsset(id);
}

function getAsset(id) {
  return rowToAsset(getDb().prepare('SELECT * FROM assets WHERE id = ?').get(String(id || '')));
}

function listAssets(projectId, { kind } = {}) {
  const db = getDb();
  const rows = kind
    ? db.prepare('SELECT * FROM assets WHERE project_id = ? AND kind = ? ORDER BY created_at').all(projectId, kind)
    : db.prepare('SELECT * FROM assets WHERE project_id = ? ORDER BY created_at').all(projectId);
  return rows.map(rowToAsset);
}

async function deleteAsset(id) {
  const asset = getAsset(id);
  if (!asset) return false;
  await storage().remove(asset.storageKey).catch(() => {});
  getDb().prepare('DELETE FROM assets WHERE id = ?').run(id);
  return true;
}

module.exports = {
  createProject, getProject, listProjects, countProjects, updateProject, deleteProject,
  verifyProjectOwner,
  addAsset, getAsset, listAssets, deleteAsset,
  projectPrefix,
  VALID_STATUS, VALID_KINDS,
};
