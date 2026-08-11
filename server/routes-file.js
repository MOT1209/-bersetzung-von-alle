// server/routes-file.js — مسارات استيراد/تصدير الملفات
// POST /api/translate-file → ترجمة ملف (base64) مع الحفاظ على البنية
// POST /api/export → إرجاع ملف جاهز للتحميل (attachment)
const express = require('express');
const translate = require('./translate'); // وصول وقت التنفيذ — يسمح بتزييف translateText في الاختبارات
const { translateFileContent, buildExport, sanitizeFilename, SUPPORTED_IMPORT, SUPPORTED_EXPORT } = require('./files');

const router = express.Router();

// حد الجسم 15mb خاص بمسارات الملفات فقط (يُركَّب كوسيط على المسار نفسه لا على الراوتر)،
// لأن router.use كان يطبّق الحد على كل طلبات /api العابرة، متجاوزًا حد 2mb العام.

// ===== خريطة رمز الخطأ → حالة HTTP (قالب موحد بسيط مثل routes-translate.js) =====
const ERROR_STATUS = {
  'invalid-format': 400,
  'invalid-file': 400,
  'invalid-export': 400,
  'translate-failed': 502,
  'server-error': 500,
};

// ===== استجابة خطأ موحدة =====
function sendError(res, e) {
  // رمز الخطأ يجب أن يكون سلسلة معروفة. عمليات execFile الفاشلة تحمل code
  // رقميًا (رمز الخروج)، فكان يتسرّب للواجهة كـ {"error":1} — بلا معنى.
  const raw = e && e.code;
  const code = typeof raw === 'string' && ERROR_STATUS[raw] ? raw : 'server-error';
  const status = ERROR_STATUS[code] || 500;
  console.error('[files] error:', code, '→', e && e.message);
  return res.status(status).json({ error: code });
}

// ===== POST /api/translate-file — ترجمة ملف كامل =====
// body: { format, content (base64), targetLang?, sourceLang?, provider?, providers? }
router.post('/translate-file', express.json({ limit: '15mb' }), async (req, res) => {
  const { format, content, targetLang = 'ar', sourceLang, provider, providers } = req.body || {};
  const ext = String(format || '').toLowerCase();

  if (!SUPPORTED_IMPORT.includes(ext)) {
    return res.status(400).json({ error: 'invalid-format' });
  }
  // content: سلسلة base64 — حد ~40MB يحمي الذاكرة من الأجسام الضخمة
  if (typeof content !== 'string' || !content.length || content.length > 40 * 1024 * 1024) {
    return res.status(400).json({ error: 'invalid-file' });
  }

  try {
    const buffer = Buffer.from(content, 'base64');
    // غلاف يمرر المزوّد المفضّل/الترتيب المطلوب إلى محرك الترجمة
    const translateFn = (t, tl, sl) => translate.translateText(t, tl, sl, { provider, providers });
    const result = await translateFileContent(buffer, ext, targetLang, translateFn, sourceLang);
    res.json(result);
  } catch (e) {
    return sendError(res, e);
  }
});

// ===== POST /api/export — إرجاع ملف مترجم جاهز للتحميل =====
// body: { format, text?, segments?, structure?, filename? }
router.post('/export', express.json({ limit: '15mb' }), async (req, res) => {
  const { format, text, segments, structure, filename } = req.body || {};
  const ext = String(format || '').toLowerCase();

  if (!SUPPORTED_EXPORT.includes(ext)) {
    return res.status(400).json({ error: 'invalid-format' });
  }
  // التحقق من الحمولة المناسبة لكل صيغة
  const payloadOk =
    ext === 'srt' || ext === 'vtt'
      ? Array.isArray(segments) || typeof text === 'string'
      : ext === 'json' || ext === 'xml'
        ? structure !== undefined || typeof text === 'string'
        : typeof text === 'string';
  if (!payloadOk) {
    return res.status(400).json({ error: 'invalid-export' });
  }

  try {
    const { buffer, mime, name } = await buildExport(ext, { text, segments, structure, filename });
    const safeName = sanitizeFilename(name) || `translated.${ext}`;
    // أسماء الملفات العربية لا تُقبل في رأس HTTP → RFC 5987 filename* مع بديل ASCII آمن
    const ascii = safeName.replace(/[^\x20-\x7E]/g, '_');
    const disposition = ascii === safeName
      ? `attachment; filename="${safeName}"`
      : `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
    res.setHeader('Content-Disposition', disposition);
    res.type(mime).send(buffer);
  } catch (e) {
    return sendError(res, e);
  }
});

module.exports = router;
