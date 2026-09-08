// server/routes-projects.js — نظام المشاريع (البند 30)
//   GET    /api/projects            قائمة
//   POST   /api/projects            إنشاء
//   GET    /api/projects/:id        مشروع + أصوله
//   PATCH  /api/projects/:id        تعديل
//   DELETE /api/projects/:id        حذف المشروع وملفاته المخزّنة (البند 59)
//   POST   /api/projects/:id/assets رفع أصل (base64) وتخزينه
//   GET    /api/projects/:id/assets/:assetId/content  تنزيل محتوى الأصل
//
// ===== الملكية (بدل «كل المشاريع مشتركة» السابق) =====
// لا مستخدمين ولا تسجيل دخول بعد، لكن غياب المستخدمين لا يبرّر أن يسرد أي زائر
// مشاريع الآخرين وينزّل ملفاتهم ويحذفها — وهو ما كان يحدث فعليًا. البديل الأخفّ:
// توكن مالك عشوائي يُعاد مرة واحدة عند الإنشاء ويُرسَل في رأس X-Project-Token.
// هذا «رابط قدرة» (capability) لا هوية: يكفي لعزل المستخدمين عن بعضهم، ويُستبدل
// بمصادقة حقيقية لاحقًا دون تغيير شكل المسارات.
const express = require('express');
const { randomUUID } = require('crypto');
const repo = require('./db/projects');
const jobs = require('./jobs');
const pipeline = require('./projectPipeline'); // يسجّل معالج الوظيفة عند تحميله
const { storage } = require('./providers/storage');
const { requireAdmin, isAdmin } = require('./adminAuth');

const router = express.Router();

const PROJECT_TOKEN_HEADER = 'x-project-token';

/**
 * يتحقق من ملكية المشروع قبل أي عملية عليه.
 * الأدمن يتجاوز (لوحة التحكم تحتاج رؤية كل شيء).
 * الرد على مشروع لا يملكه الطالب هو 404 لا 403: لا نؤكّد وجود معرّف لا يملكه.
 */
function requireProjectOwner(req, res, next) {
  const project = repo.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'project-not-found' });
  if (!isAdmin(req) && !repo.verifyProjectOwner(project.id, req.get(PROJECT_TOKEN_HEADER))) {
    return res.status(404).json({ error: 'project-not-found' });
  }
  req.project = project;
  next();
}

const MAX_ASSET_BASE64 = 60 * 1024 * 1024; // ~45MB فعلية بعد فكّ base64

const ERROR_STATUS = {
  'invalid-project': 400,
  'invalid-asset': 400,
  'invalid-storage-key': 400,
  'project-not-found': 404,
  'asset-not-found': 404,
  'queue-full': 503,
  'server-error': 500,
};

function sendError(res, e) {
  const code = (e && e.code) || 'server-error';
  const status = ERROR_STATUS[code] || 500;
  console.error('[projects] error:', code, '→', e && e.message);
  return res.status(status).json({ error: code });
}

router.use(express.json({ limit: '80mb' })); // الأصول تصل base64

// ===== قائمة كل المشاريع — للأدمن وحده =====
// كانت مفتوحة للجميع، فكانت تكشف مشاريع كل الزوار وتجعل تنزيل ملفاتهم مسألة
// نسخ معرّف. لا يملك المستخدم العادي «قائمة» أصلًا: يحتفظ متصفحه بتوكناته.
router.get('/projects', requireAdmin, (req, res) => {
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
router.get('/projects/:id', requireProjectOwner, (req, res) => {
  try {
    res.json({ ...req.project, assets: repo.listAssets(req.project.id) });
  } catch (e) {
    return sendError(res, e);
  }
});

// ===== تعديل =====
router.patch('/projects/:id', requireProjectOwner, (req, res) => {
  try {
    res.json(repo.updateProject(req.project.id, req.body || {}));
  } catch (e) {
    return sendError(res, e);
  }
});

// ===== حذف (يشمل الملفات المخزّنة) =====
router.delete('/projects/:id', requireProjectOwner, async (req, res) => {
  try {
    await repo.deleteProject(req.project.id);
    res.json({ deleted: true, id: req.project.id });
  } catch (e) {
    return sendError(res, e);
  }
});

// ===== رفع أصل =====
// body: { kind, content (base64), filename?, mime?, lang?, meta? }
router.post('/projects/:id/assets', requireProjectOwner, async (req, res) => {
  try {
    const project = req.project;

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
router.get('/projects/:id/assets/:assetId/content', requireProjectOwner, async (req, res) => {
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
router.delete('/projects/:id/assets/:assetId', requireProjectOwner, async (req, res) => {
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

// ===== تشغيل خط المعالجة على أصل وسائط =====
// POST /api/projects/:id/process  body: { assetId, targetLang? }
// يعيد 202 ومعرّف وظيفة: العمل أثقل من عمر طلب HTTP، فيُتابع عبر /api/jobs/:id
router.post('/projects/:id/process', requireProjectOwner, (req, res) => {
  try {
    const project = req.project;

    const { assetId, targetLang = 'ar' } = req.body || {};
    const asset = repo.getAsset(assetId);
    // الأصل يجب أن ينتمي للمشروع: بدونه يصير معرّف الأصل مفتاحًا لمعالجة أي ملف
    if (!asset || asset.projectId !== project.id) {
      return res.status(404).json({ error: 'asset-not-found' });
    }
    if (asset.kind !== 'media') {
      return res.status(400).json({ error: 'invalid-asset' });
    }

    const job = jobs.enqueue(pipeline.JOB_TYPE, {
      projectId: project.id,
      assetId: asset.id,
      targetLang,
    });
    res.status(202).json({
      jobId: job.id,
      status: job.status,
      statusUrl: `/api/jobs/${job.id}`,
      streamUrl: `/api/jobs/${job.id}/stream`,
    });
  } catch (e) {
    return sendError(res, e);
  }
});

module.exports = router;
