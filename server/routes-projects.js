// server/routes-projects.js — نظام المشاريع (البند 30)
//   GET    /api/projects            قائمة
//   POST   /api/projects            إنشاء
//   GET    /api/projects/:id        مشروع + أصوله
//   PATCH  /api/projects/:id        تعديل
//   DELETE /api/projects/:id        حذف المشروع وملفاته المخزّنة (البند 59)
//   POST   /api/projects/:id/assets رفع أصل (base64) وتخزينه
//   GET    /api/projects/:id/assets/:assetId/content  تنزيل محتوى الأصل
//
// ملاحظة نطاق: لا مستخدمين بعد — كل المشاريع مشتركة. إضافة المالك تصبح عمودًا
// وفلترًا هنا عند بناء المصادقة، ولا تغيّر شكل هذه المسارات.
const express = require('express');
const { randomUUID } = require('crypto');
const repo = require('./db/projects');
const { storage } = require('./providers/storage');

const router = express.Router();

const MAX_ASSET_BASE64 = 60 * 1024 * 1024; // ~45MB فعلية بعد فكّ base64

const ERROR_STATUS = {
  'invalid-project': 400,
  'invalid-asset': 400,
  'invalid-storage-key': 400,
  'project-not-found': 404,
  'asset-not-found': 404,
  'server-error': 500,
};

function sendError(res, e) {
  const code = (e && e.code) || 'server-error';
  const status = ERROR_STATUS[code] || 500;
  console.error('[projects] error:', code, '→', e && e.message);
  return res.status(status).json({ error: code });
}

router.use(express.json({ limit: '80mb' })); // الأصول تصل base64

// ===== قائمة المشاريع =====
router.get('/projects', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    res.json({ projects: repo.listProjects({ limit, offset }), total: repo.countProjects() });
  } catch (e) {
    return sendError(res, e);
  }
});

// ===== إنشاء =====
router.post('/projects', (req, res) => {
  try {
    const { name, sourceType, sourceRef, targetLangs, status } = req.body || {};
    res.status(201).json(repo.createProject({ name, sourceType, sourceRef, targetLangs, status }));
  } catch (e) {
    return sendError(res, e);
  }
});

// ===== مشروع واحد مع أصوله =====
router.get('/projects/:id', (req, res) => {
  try {
    const project = repo.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project-not-found' });
    res.json({ ...project, assets: repo.listAssets(project.id) });
  } catch (e) {
    return sendError(res, e);
  }
});

// ===== تعديل =====
router.patch('/projects/:id', (req, res) => {
  try {
    const updated = repo.updateProject(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'project-not-found' });
    res.json(updated);
  } catch (e) {
    return sendError(res, e);
  }
});

// ===== حذف (يشمل الملفات المخزّنة) =====
router.delete('/projects/:id', async (req, res) => {
  try {
    const ok = await repo.deleteProject(req.params.id);
    if (!ok) return res.status(404).json({ error: 'project-not-found' });
    res.json({ deleted: true, id: req.params.id });
  } catch (e) {
    return sendError(res, e);
  }
});

// ===== رفع أصل =====
// body: { kind, content (base64), filename?, mime?, lang?, meta? }
router.post('/projects/:id/assets', async (req, res) => {
  try {
    const project = repo.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project-not-found' });

    const { kind, content, filename, mime = null, lang = null, meta = {} } = req.body || {};
    if (!repo.VALID_KINDS.includes(kind)) {
      return res.status(400).json({ error: 'invalid-asset' });
    }
    if (typeof content !== 'string' || !content.length || content.length > MAX_ASSET_BASE64) {
      return res.status(400).json({ error: 'invalid-asset' });
    }

    // اسم الملف من المستخدم لا يدخل المفتاح: نولّد اسمًا ونحتفظ بالأصلي في meta.
    // هذا يغلق اجتياز المسار من المصدر بدل الاعتماد على التطبيع وحده.
    const ext = String(filename || '').includes('.')
      ? String(filename).split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
      : '';
    const key = `${repo.projectPrefix(project.id)}/${kind}/${randomUUID()}${ext ? '.' + ext : ''}`;

    const buffer = Buffer.from(content, 'base64');
    const { bytes } = await storage().put(key, buffer);

    const asset = repo.addAsset(project.id, {
      kind,
      lang,
      storageKey: key,
      mime,
      bytes,
      meta: { ...(meta || {}), originalName: filename ? String(filename).slice(0, 200) : null },
    });
    res.status(201).json(asset);
  } catch (e) {
    return sendError(res, e);
  }
});

// ===== تنزيل محتوى أصل =====
router.get('/projects/:id/assets/:assetId/content', async (req, res) => {
  try {
    const asset = repo.getAsset(req.params.assetId);
    // نتحقق من انتماء الأصل للمشروع: بدونه يصير معرّف الأصل وحده مفتاحًا لأي ملف
    if (!asset || asset.projectId !== req.params.id) {
      return res.status(404).json({ error: 'asset-not-found' });
    }
    const buf = await storage().get(asset.storageKey);
    if (!buf) return res.status(404).json({ error: 'asset-not-found' });
    res.setHeader('Content-Type', asset.mime || 'application/octet-stream');
    res.setHeader('Content-Length', String(buf.length));
    res.send(buf);
  } catch (e) {
    return sendError(res, e);
  }
});

// ===== حذف أصل =====
router.delete('/projects/:id/assets/:assetId', async (req, res) => {
  try {
    const asset = repo.getAsset(req.params.assetId);
    if (!asset || asset.projectId !== req.params.id) {
      return res.status(404).json({ error: 'asset-not-found' });
    }
    await repo.deleteAsset(asset.id);
    res.json({ deleted: true, id: asset.id });
  } catch (e) {
    return sendError(res, e);
  }
});

module.exports = router;
