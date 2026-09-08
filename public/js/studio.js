/* ---------- استوديو أرا لينك — المسار الكامل المرئي ----------
   ملف مرفوع ← مشروع محفوظ ← تفريغ ← ترجمة ← ملف ترجمة للتنزيل.

   يستهلك ما بُني في الخلفية: المشاريع والتخزين (P3) عبر /api/projects،
   ومحرك الوظائف (P2) عبر بثّ /api/jobs/:id/stream للتقدّم الحيّ. */

const $ = (id) => document.getElementById(id);

const MAX_BYTES = 45 * 1024 * 1024; // يقابل حدّ base64 على الخادم (~60mb مُرمَّزة)

const state = {
  file: null,
  projectId: null,
  jobId: null,
  stream: null,
};

/* ===== أدوات واجهة ===== */

function setStep(n, { active = false, done = false } = {}) {
  const el = $(`step-${n}`);
  if (!el) return;
  if (active) el.dataset.active = 'true';
  if (done) { el.dataset.done = 'true'; el.dataset.active = 'false'; }
}

function showMsg(id, text, kind) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'msg ' + (kind || 'err');
  el.hidden = !text;
}

// أسماء المراحل بالعربية — المستخدم لا يجب أن يرى أسماء داخلية إنجليزية
const STAGE_LABELS = {
  queued: 'في الطابور…',
  preparing: 'تحضير الملف…',
  transcribing: 'تفريغ الصوت (الأطول)…',
  translating: 'الترجمة…',
  saving: 'حفظ ملفات الترجمة…',
  done: 'اكتمل',
};

function setProgress(stage, percent) {
  $('bar-fill').style.width = `${percent || 0}%`;
  $('stage-pct').textContent = `${Math.round(percent || 0)}%`;
  $('stage-name').textContent = STAGE_LABELS[stage] || stage || '…';
}

/* ===== رسائل الأخطاء بالعربية ===== */
const ERROR_TEXT = {
  'audio-empty': 'لم يُعثر على كلام واضح في الملف (موسيقى أو صمت فقط).',
  'invalid-asset': 'الملف غير صالح أو نوعه غير مدعوم.',
  'asset-not-found': 'تعذّر العثور على الملف المرفوع.',
  'project-not-found': 'تعذّر العثور على المشروع.',
  'translate-failed': 'فشلت كل محركات الترجمة — حاول لاحقًا.',
  'alignment-failed': 'تعذّرت محاذاة الترجمة مع المقاطع.',
  'queue-full': 'الخادم مشغول بطلبات أخرى — أعد المحاولة بعد قليل.',
  'job-cancelled': 'أُلغيت المعالجة.',
  'invalid-project': 'اسم المشروع غير صالح.',
};
const errText = (code) => ERROR_TEXT[code] || `تعذّر إكمال العملية (${code || 'خطأ غير معروف'}).`;

/* ===== فحص الخادم واللغات ===== */

async function checkBackend() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const data = await res.json();
    $('offline-banner').hidden = !!(data && data.ok);
    return !!(data && data.ok);
  } catch {
    $('offline-banner').hidden = false;
    return false;
  }
}

async function loadLanguages() {
  const sel = $('target-lang');
  try {
    const res = await fetch('/api/languages');
    const data = await res.json();
    const langs = data && data.languages;
    if (!langs) return;
    // الخادم يعيد كائنًا { code: nameAr } أو مصفوفة — ندعم الشكلين
    const entries = Array.isArray(langs)
      ? langs.map((l) => [l.code, l.nameAr || l.code])
      : Object.entries(langs);
    sel.innerHTML = '';
    for (const [code, name] of entries) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = name;
      sel.appendChild(opt);
    }
    sel.value = 'ar';
  } catch {
    /* تبقى العربية الافتراضية المضمّنة في HTML */
  }
}

/* ===== اختيار الملف ===== */

function pickFile(file) {
  if (!file) return;
  if (file.size > MAX_BYTES) {
    showMsg('proc-msg', `الملف أكبر من الحد (${Math.round(file.size / 1048576)} ميغابايت، الحد 45).`, 'err');
    $('step-3').dataset.active = 'true';
    return;
  }
  showMsg('proc-msg', '', 'err');
  state.file = file;
  $('file-name').textContent = `${file.name} — ${(file.size / 1048576).toFixed(1)} ميغابايت`;
  $('file-name').hidden = false;
  // اسم المشروع يُقترح من اسم الملف بلا امتداد — المستخدم يعدّله إن شاء
  if (!$('proj-name').value.trim()) {
    $('proj-name').value = file.name.replace(/\.[^.]+$/, '').slice(0, 100);
  }
  setStep(1, { done: true });
  setStep(2, { active: true });
  $('start-btn').disabled = false;
}

$('drop').addEventListener('click', () => $('file').click());
$('drop').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); }
});
$('file').addEventListener('change', (e) => pickFile(e.target.files && e.target.files[0]));
['dragenter', 'dragover'].forEach((ev) => $('drop').addEventListener(ev, (e) => {
  e.preventDefault(); $('drop').classList.add('is-over');
}));
['dragleave', 'drop'].forEach((ev) => $('drop').addEventListener(ev, (e) => {
  e.preventDefault(); $('drop').classList.remove('is-over');
}));
$('drop').addEventListener('drop', (e) => pickFile(e.dataTransfer && e.dataTransfer.files[0]));

/* ===== تحويل الملف إلى base64 دون تفجير الذاكرة ===== */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    // النتيجة data:*/*;base64,XXXX — نأخذ ما بعد الفاصلة فقط
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(file);
  });
}

/* ===== التشغيل ===== */

async function start() {
  if (!state.file) return;
  $('start-btn').disabled = true;
  setStep(2, { done: true });
  setStep(3, { active: true });
  showMsg('proc-msg', '', 'err');
  setProgress('queued', 2);

  try {
    // 1) إنشاء المشروع
    const name = $('proj-name').value.trim() || state.file.name;
    const targetLang = $('target-lang').value || 'ar';
    const projRes = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sourceType: 'upload', sourceRef: state.file.name, targetLangs: [targetLang] }),
    });
    if (!projRes.ok) throw new Error((await projRes.json().catch(() => ({}))).error || 'project-failed');
    const project = await projRes.json();
    state.projectId = project.id;

    // 2) رفع الملف كأصل وسائط
    setProgress('preparing', 8);
    const content = await fileToBase64(state.file);
    const assetRes = await fetch(`/api/projects/${project.id}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'media', content, filename: state.file.name, mime: state.file.type || null }),
    });
    if (!assetRes.ok) throw new Error((await assetRes.json().catch(() => ({}))).error || 'invalid-asset');
    const asset = await assetRes.json();

    // 3) بدء المعالجة (تعيد 202 ومعرّف وظيفة)
    const procRes = await fetch(`/api/projects/${project.id}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId: asset.id, targetLang }),
    });
    if (!procRes.ok) throw new Error((await procRes.json().catch(() => ({}))).error || 'process-failed');
    const job = await procRes.json();
    state.jobId = job.jobId;
    $('cancel-btn').hidden = false;

    follow(job.streamUrl);
  } catch (e) {
    showMsg('proc-msg', errText(e && e.message), 'err');
    $('start-btn').disabled = false;
  }
}

/* ===== متابعة التقدّم عبر البثّ =====
   البثّ يُغلق تلقائيًا عند انتهاء الوظيفة (الخادم ينهي الاتصال). */
function follow(streamUrl) {
  if (state.stream) state.stream.close();
  const es = new EventSource(streamUrl);
  state.stream = es;

  es.addEventListener('update', (ev) => {
    let job;
    try { job = JSON.parse(ev.data); } catch { return; }
    setProgress(job.progress && job.progress.stage, job.progress && job.progress.percent);

    if (job.status === 'completed') {
      es.close();
      $('cancel-btn').hidden = true;
      setStep(3, { done: true });
      showResult(job.result);
    } else if (job.status === 'failed' || job.status === 'cancelled') {
      es.close();
      $('cancel-btn').hidden = true;
      showMsg('proc-msg', errText(job.error && job.error.code), 'err');
      $('start-btn').disabled = false;
    }
  });

  // انقطاع الشبكة: نسقط إلى الاستطلاع بدل ترك الشاشة معلّقة بلا تفسير
  es.onerror = () => { es.close(); pollFallback(); };
}

async function pollFallback() {
  if (!state.jobId) return;
  try {
    const job = await (await fetch(`/api/jobs/${state.jobId}`)).json();
    setProgress(job.progress && job.progress.stage, job.progress && job.progress.percent);
    if (job.status === 'completed') { setStep(3, { done: true }); return showResult(job.result); }
    if (job.status === 'failed' || job.status === 'cancelled') {
      return showMsg('proc-msg', errText(job.error && job.error.code), 'err');
    }
    setTimeout(pollFallback, 2000);
  } catch {
    setTimeout(pollFallback, 4000);
  }
}

/* ===== عرض النتيجة ===== */

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function showResult(result) {
  if (!result) return;
  setStep(4, { active: true, done: true });
  setProgress('done', 100);

  const n = (result.captions || []).length;
  showMsg('result-msg', `تمّت الترجمة: ${n} مقطعًا (من ${result.sourceLang || 'auto'} إلى ${result.targetLang}).`, 'ok');

  const base = `/api/projects/${result.projectId}/assets`;
  $('dl-srt').href = `${base}/${result.subtitles.srt}/content`;
  $('dl-srt').setAttribute('download', 'subtitles.srt');
  $('dl-vtt').href = `${base}/${result.subtitles.vtt}/content`;
  $('dl-vtt').setAttribute('download', 'subtitles.vtt');
  $('dl-row').hidden = false;

  const body = $('caps-body');
  body.innerHTML = '';
  for (const c of result.captions || []) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.className = 't';
    td1.textContent = fmtTime(c.start);
    const td2 = document.createElement('td');
    // textContent لا innerHTML — النص مترجم من مصدر خارجي
    td2.textContent = c.translated || '';
    if (c.original) {
      const sm = document.createElement('span');
      sm.className = 'orig';
      sm.textContent = c.original;
      td2.appendChild(sm);
    }
    tr.append(td1, td2);
    body.appendChild(tr);
  }
  $('caps-wrap').hidden = false;
}

/* ===== الإلغاء ===== */
$('cancel-btn').addEventListener('click', async () => {
  if (!state.jobId) return;
  try { await fetch(`/api/jobs/${state.jobId}`, { method: 'DELETE' }); } catch { /* تجاهل */ }
});

$('start-btn').addEventListener('click', start);

/* ===== الثيم (نفس سلوك الصفحة الرئيسية) ===== */
$('theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('aralink-theme', next); } catch { /* وضع خاص */ }
  $('theme-toggle').querySelector('.icon').textContent = next === 'light' ? '☀️' : '🌙';
});

/* ===== الإقلاع ===== */
checkBackend();
loadLanguages();
