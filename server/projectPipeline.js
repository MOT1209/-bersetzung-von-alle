// server/projectPipeline.js — خط الأنابيب المرئي: ملف مرفوع ← ترجمة محفوظة
//
// هذا الملف هو الذي يحوّل كل ما بُني في P1–P3 إلى شيء يراه المستخدم:
//   أصل وسائط في مشروع → تفريغ صوتي → ترجمة → ملفا SRT وVTT محفوظان كأصول.
//
// يعمل داخل محرك الوظائف (P2) فيرث سقف التزامن والتقدّم والإلغاء، ويستخدم
// طبقة التخزين (P3) فلا يعرف شيئًا عن نظام الملفات.
//
// المسار المتوافق: المصدر ملف **يرفعه المستخدم** — لا تنزيل من يوتيوب. راجع
// server/youtubeApi.js لسبب ذلك (captions.download يتطلب ملكية الفيديو).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const jobs = require('./jobs');
const repo = require('./db/projects');
const { storage } = require('./providers/storage');
const { buildSrt } = require('./youtube');
const { buildSubtitle } = require('./files');

const JOB_TYPE = 'project-video';

function codeError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

// captions من translateLines تحمل { start, duration, original, translated }.
// buildSubtitle يريد { start, end, text } — التحويل هنا لا في كل مستدعٍ.
function toVttSegments(captions) {
  return captions.map((c) => ({
    start: c.start || 0,
    end: (c.start || 0) + (c.duration || 2),
    text: c.translated || c.original || '',
  }));
}

/**
 * ينفّذ الخط كاملًا على أصل وسائط داخل مشروع.
 * payload: { projectId, assetId, targetLang }
 * يعيد: { captions, sourceLang, subtitles: { srt: assetId, vtt: assetId } }
 */
async function runProjectVideo(payload, ctx) {
  const { projectId, assetId, targetLang = 'ar' } = payload || {};

  const project = repo.getProject(projectId);
  if (!project) throw codeError('project-not-found');
  const asset = repo.getAsset(assetId);
  if (!asset || asset.projectId !== projectId) throw codeError('asset-not-found');

  // ملف مؤقت للمعالجة فقط: ffmpeg وSTT يحتاجان مسارًا على القرص، بينما مصدر
  // الحقيقة يبقى في طبقة التخزين. يُحذف دائمًا في finally.
  const ext = (asset.meta && asset.meta.originalName && String(asset.meta.originalName).includes('.'))
    ? String(asset.meta.originalName).split('.').pop().replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
    : 'bin';
  const tmpFile = path.join(os.tmpdir(), `aralink-proj-${randomUUID()}.${ext}`);

  try {
    repo.updateProject(projectId, { status: 'processing' });

    // 1) إحضار الوسائط من التخزين إلى القرص المؤقت
    ctx.progress('preparing', 5);
    const media = await storage().get(asset.storageKey);
    if (!media) throw codeError('asset-not-found', 'الملف غير موجود في التخزين');
    fs.writeFileSync(tmpFile, media);

    // 2) التفريغ الصوتي (المرحلة الأثقل — تقارب 5.5× مدة الفيديو)
    ctx.progress('transcribing', 25);
    if (ctx.signal.aborted) throw codeError('job-cancelled');
    const { transcribeMediaFile } = require('./audio'); // تفكيك وقت التنفيذ (تزييف الاختبارات)
    const { chunks } = await transcribeMediaFile(tmpFile, 'project-' + projectId);
    if (!Array.isArray(chunks) || !chunks.length) throw codeError('audio-empty');

    // 3) الترجمة عبر المسار المشترك (محاذاة 1:1 صارمة + كاش)
    ctx.progress('translating', 55);
    if (ctx.signal.aborted) throw codeError('job-cancelled');
    const { translateLines } = require('./routes-translate');
    const lines = chunks.map((c) => ({
      start: c.start || 0,
      duration: c.duration || 2,
      original: c.text || '',
    }));
    const { sourceLang, captions } = await translateLines(lines, targetLang, {});

    // 4) بناء ملفات الترجمة وحفظها كأصول في المشروع
    ctx.progress('saving', 85);
    const srtKey = `${repo.projectPrefix(projectId)}/subtitle/${randomUUID()}.srt`;
    const vttKey = `${repo.projectPrefix(projectId)}/subtitle/${randomUUID()}.vtt`;
    const srtBody = Buffer.from(buildSrt(captions), 'utf8');
    const vttBody = Buffer.from(buildSubtitle(toVttSegments(captions), 'vtt'), 'utf8');

    await storage().put(srtKey, srtBody);
    await storage().put(vttKey, vttBody);

    const srtAsset = repo.addAsset(projectId, {
      kind: 'subtitle', lang: targetLang, storageKey: srtKey,
      mime: 'application/x-subrip', bytes: srtBody.length,
      meta: { format: 'srt', sourceLang, lines: captions.length },
    });
    const vttAsset = repo.addAsset(projectId, {
      kind: 'subtitle', lang: targetLang, storageKey: vttKey,
      mime: 'text/vtt', bytes: vttBody.length,
      meta: { format: 'vtt', sourceLang, lines: captions.length },
    });

    // اللغة الهدف تُضاف لقائمة المشروع إن لم تكن موجودة (مشروع متعدد اللغات لاحقًا)
    const langs = project.targetLangs.includes(targetLang)
      ? project.targetLangs
      : [...project.targetLangs, targetLang];
    repo.updateProject(projectId, { status: 'ready', targetLangs: langs });

    return {
      projectId,
      sourceLang,
      targetLang,
      captions,
      subtitles: { srt: srtAsset.id, vtt: vttAsset.id },
    };
  } catch (e) {
    // الفشل يظهر على المشروع نفسه لا في السجلّ وحده — المستخدم يرى الحالة
    repo.updateProject(projectId, { status: 'failed' });
    throw e;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* غير موجود — تجاهل */ }
  }
}

jobs.registerHandler(JOB_TYPE, runProjectVideo);

module.exports = { runProjectVideo, JOB_TYPE, toVttSegments };
