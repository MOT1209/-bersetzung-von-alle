/* ---------- رفع فيديو/صوت عبر خط أنابيب المشاريع ----------
   يُستدعى من translate.js عند state.mode === 'file' وstate.file.kind === 'media'.
   المسار: إنشاء مشروع → رفع الأصل → بدء المعالجة → متابعة التقدّم عبر بثّ
   /api/jobs/:id/stream (نفس محرك الوظائف من server/jobs — P2) حتى تنتهي.

   قرار مُعلَن: هذا يستبدل صفحة /studio.html المنفصلة (أُزيلت) — ليست هوية
   بصرية موازية، بل نفس مسار «ترجمة ملف» الموجود يتفرّع حسب نوع الملف.
   انظر CURRENT_STATE.md §18. */
import { postJson } from './utils.js';

const STAGE_LABELS = {
  queued: 'في الطابور…',
  preparing: 'تحضير الملف…',
  transcribing: 'تفريغ الصوت (الأطول)…',
  translating: 'الترجمة…',
  saving: 'حفظ ملفات الترجمة…',
  done: 'اكتمل',
};

function stageText(progress) {
  const stage = STAGE_LABELS[progress && progress.stage] || 'جارٍ العمل…';
  const pct = Math.round((progress && progress.percent) || 0);
  return `${stage} ${pct}%`;
}

/**
 * يرفع ملف فيديو/صوت ويترجمه، مع تحديثات تقدّم حيّة.
 * @param {{name:string, ext:string, base64:string}} file
 * @param {string} targetLang
 * @param {{onProgress?: (text:string)=>void}} callbacks
 * @returns {Promise<object>} نتيجة الخط الكاملة (renderResult جاهزة لاستهلاكها)
 */
export async function uploadAndTranslateMedia(file, targetLang, { onProgress } = {}) {
  // 1) مشروع جديد — اسم الملف افتراضيًا (بلا الامتداد)
  const name = file.name.replace(/\.[^.]+$/, '').slice(0, 100) || file.name;
  const { status: s1, data: project } = await postJson('/api/projects', {
    name, sourceType: 'upload', sourceRef: file.name, targetLangs: [targetLang],
  });
  if (s1 >= 400 || !project || !project.id) {
    throw apiError(project, s1, 'invalid-project');
  }

  // 2) رفع الأصل
  const { status: s2, data: asset } = await postJson(`/api/projects/${project.id}/assets`, {
    kind: 'media', content: file.base64, filename: file.name, mime: file.mime || null,
  });
  if (s2 >= 400 || !asset || !asset.id) {
    throw apiError(asset, s2, 'invalid-asset');
  }

  // 3) بدء المعالجة — 202 + معرّف وظيفة
  const { status: s3, data: job } = await postJson(`/api/projects/${project.id}/process`, {
    assetId: asset.id, targetLang,
  });
  if (s3 >= 400 || !job || !job.jobId) {
    throw apiError(job, s3, 'server-error');
  }

  // 4) متابعة التقدّم حتى الانتهاء
  return await followJob(job.streamUrl, job.statusUrl, onProgress);
}

function apiError(data, status, fallback) {
  const err = new Error((data && data.error) || fallback);
  err.code = (data && data.error) || fallback;
  err.status = status || 500;
  return err;
}

function followJob(streamUrl, statusUrl, onProgress) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const es = new EventSource(streamUrl);

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      es.close();
      fn();
    };

    es.addEventListener('update', (ev) => {
      let job;
      try { job = JSON.parse(ev.data); } catch { return; }
      if (onProgress) onProgress(stageText(job.progress));

      if (job.status === 'completed') {
        finish(() => resolve(job.result));
      } else if (job.status === 'failed' || job.status === 'cancelled') {
        finish(() => reject(apiError(job.error, 502, job.status === 'cancelled' ? 'job-cancelled' : 'server-error')));
      }
    });

    // انقطاع الشبكة: نسقط إلى الاستطلاع بدل ترك الواجهة معلّقة بلا تفسير
    es.onerror = () => {
      if (settled) return;
      es.close();
      pollJob(statusUrl, onProgress).then(
        (result) => finish(() => resolve(result)),
        (err) => finish(() => reject(err)),
      );
    };
  });
}

async function pollJob(statusUrl, onProgress, attempt = 0) {
  const res = await fetch(statusUrl);
  const job = await res.json().catch(() => null);
  if (!job) throw apiError(null, res.status, 'server-error');
  if (onProgress) onProgress(stageText(job.progress));

  if (job.status === 'completed') return job.result;
  if (job.status === 'failed' || job.status === 'cancelled') {
    throw apiError(job.error, 502, job.status === 'cancelled' ? 'job-cancelled' : 'server-error');
  }
  // تراجع أسّي بحد أقصى 5 ثوانٍ — لا حاجة لإغراق الخادم بطلبات متلاحقة
  const delay = Math.min(5000, 1000 + attempt * 500);
  await new Promise((r) => setTimeout(r, delay));
  return pollJob(statusUrl, onProgress, attempt + 1);
}
