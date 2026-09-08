// public/js/youtube-studio.js — استوديو دبلجة يوتيوب: URL → job → progress حي → فيديو نهائي
import { $, safeGet, safeSet } from './utils.js';

/* ===== توكن ملكية المشروع (CURRENT_STATE.md §20) =====
   يُعاد مرة واحدة من POST /api/youtube/dub ولا يُعاد أبدًا بعدها. بدونه لا وصول
   إلى حالة المهمة ولا إلى ملفات المشروع — لا لنا ولا لغيرنا. */
const TOKENS_KEY = 'aralink-dub-tokens';

function loadTokens() {
  try { return JSON.parse(safeGet(TOKENS_KEY) || '{}'); } catch { return {}; }
}

function rememberToken(projectId, token) {
  const all = loadTokens();
  all[projectId] = token;
  const ids = Object.keys(all);
  if (ids.length > 50) delete all[ids[0]]; // سقف: التوكنات لا تنتهي فلا تنمو بلا حد
  safeSet(TOKENS_KEY, JSON.stringify(all));
}

function tokenFor(projectId) {
  return loadTokens()[projectId] || '';
}

const tokenHeader = (projectId) => {
  const t = tokenFor(projectId);
  return t ? { 'X-Project-Token': t } : {};
};

/* يضيف التوكن كمعامل استعلام. لازم لثلاث حالات لا تستطيع إرسال رؤوس مخصّصة:
   EventSource، و<video src>، و<a download>. التوكن يظهر في الرابط عندئذٍ —
   مقبول لرابط قدرة على نفس الأصل، ولا يُستخدم حيث يكفي الرأس. */
function withToken(url, projectId) {
  const t = tokenFor(projectId);
  if (!t) return url;
  return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(t);
}

const STAGES_AR = {
  queued: 'في الانتظار…', analyzing: 'تحليل الفيديو…', transcribing: 'تفريغ الصوت…',
  translating: 'ترجمة المقاطع…', voicing: 'توليد الأصوات…', rendering: 'دمج الفيديو…',
  completed: 'مكتمل ✓', failed: 'فشل',
};

function els() {
  return {
    url: $('yt-url'), langs: [...document.querySelectorAll('.yt-lang:checked')].map((c) => c.value),
    mode: (document.querySelector('input[name="yt-mode"]:checked') || {}).value || 'full-dub',
    start: $('yt-start'), prog: $('yt-progress'), plabel: $('yt-progress-label'),
    steps: $('yt-steps'), result: $('yt-result'), player: $('yt-player'),
    dlVideo: $('yt-dl-video'), dlAudio: $('yt-dl-audio'), dlSrt: $('yt-dl-srt'), studio: $('yt-open-studio'),
    err: $('yt-error'), retry: $('yt-retry'),
  };
}

function setSteps(current) {
  const order = ['analyzing', 'transcribing', 'translating', 'voicing', 'rendering'];
  const box = $('yt-steps');
  if (!box) return;
  box.innerHTML = '';
  for (const s of order) {
    const d = document.createElement('div');
    const done = order.indexOf(s) < order.indexOf(current) || current === 'completed';
    const active = s === current;
    d.className = 'yt-step' + (done ? ' done' : '') + (active ? ' active' : '');
    d.textContent = (done ? '✓ ' : '') + (STAGES_AR[s] || s);
    box.appendChild(d);
  }
}

async function pollJob(jobId, onUpdate, projectId) {
  // SSE أولًا، مع fallback للـ polling كل 2 ثانية عند انقطاعه.
  // لا يبقى أي مؤقت حي بعد اكتمال المهمة أو فشلها (settled يحرس كل المسارات).
  let settled = false;
  const finish = () => { settled = true; };
  function fallback() {
    if (settled) return;
    const p = setInterval(async () => {
      if (settled) { clearInterval(p); return; }
      try {
        const r = await fetch(`/api/dub/jobs/${jobId}`, { headers: tokenHeader(projectId) });
        const job = await r.json();
        onUpdate(job);
        if (job.status === 'completed' || job.status === 'failed') { finish(); clearInterval(p); }
      } catch {}
    }, 2000);
  }
  try {
    // EventSource لا يرسل رؤوسًا — التوكن في الاستعلام
    const es = new EventSource(withToken(`/api/dub/jobs/${jobId}/stream`, projectId));
    es.addEventListener('progress', (ev) => {
      try {
        const job = JSON.parse(ev.data);
        onUpdate(job);
        if (job.status === 'completed' || job.status === 'failed') { finish(); es.close(); }
      } catch {}
    });
    es.onerror = () => { es.close(); fallback(); };
  } catch {
    fallback();
  }
}

function showErrorAr(msg) {
  const e = $('yt-error');
  if (!e) return;
  e.hidden = false;
  e.querySelector('.error-message').textContent = msg;
}

export function initYoutubeStudio() {
  const start = $('yt-start');
  if (!start || start.dataset.bound) return;
  start.dataset.bound = '1';
  start.addEventListener('click', async () => {
    const E = els();
    if (E.err) E.err.hidden = true;
    if (E.result) E.result.hidden = true;
    const url = E.url.value.trim();
    if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
      showErrorAr('الصق رابط يوتيوب صالحًا أولًا.');
      return;
    }
    if (!E.langs.length) { showErrorAr('اختر لغة هدف واحدة على الأقل.'); return; }
    E.prog.hidden = false;
    E.plabel.textContent = STAGES_AR.queued;
    setSteps('analyzing');
    start.disabled = true;
    try {
      const res = await fetch('/api/youtube/dub', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, targetLangs: E.langs, targetLang: E.langs[0], mode: E.mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.errorAr || data.error || 'server-error');
      const jobId = data.jobId;
      // التوكن يصل في هذا الرد وحده — احفظه قبل أي طلب لاحق وإلا ضاع المشروع
      if (data.ownerToken && data.projectId) rememberToken(data.projectId, data.ownerToken);
      E.plabel.textContent = 'بدأت الدبلجة — تتبع التقدم لحظيًا…';
      await pollJob(jobId, (job) => {
        E.plabel.textContent = `${job.stage || STAGES_AR[job.status]} (${job.progress || 0}٪)`;
        const bar = $('yt-progress-bar');
        if (bar) bar.style.width = `${job.progress || 0}%`;
        setSteps(job.stage in STAGES_AR ? jobStatusToStep(job) : job.stage);
        if (job.status === 'completed' && job.result) renderResult(job.result);
        if (job.status === 'failed') {
          showErrorAr(job.errorAr || 'تعذر إكمال الدبلجة — أعد المحاولة.');
          start.disabled = false;
        }
      }, data.projectId);
    } catch (e) {
      showErrorAr(e.message || 'تعذر بدء الدبلجة.');
    } finally {
      start.disabled = false;
    }
  });
  const retry = $('yt-retry');
  if (retry) retry.addEventListener('click', () => { $('yt-error').hidden = true; start.click(); });
}

function jobStatusToStep(job) {
  const map = { 'تحليل الفيديو…': 'analyzing', 'تنزيل الفيديو الأصلي…': 'analyzing', 'فهم الفيديو بالذكاء الاصطناعي…': 'transcribing', 'جلب ترجمات يوتيوب…': 'transcribing', 'تفريغ الصوت (لا توجد ترجمة نصية)…': 'transcribing', 'تجهيز المقاطع…': 'translating', 'مزج الصوت…': 'rendering', 'دمج الفيديو النهائي…': 'rendering' };
  if (map[job.stage]) return map[job.stage];
  if (/ترجمة/.test(job.stage || '')) return 'translating';
  if (/توليد الصوت/.test(job.stage || '')) return 'voicing';
  return 'analyzing';
}

function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// مخطط زمني تفاعلي: قائمة المقاطع من ملف translation (نفس timeline الدبلجة)
async function renderTimeline(r) {
  const box = $('yt-timeline');
  const player = $('yt-player');
  if (!box || !player) return;
  box.innerHTML = '<p class="muted">جاري تحميل المقاطع…</p>';
  let segments = [];
  try {
    const res = await fetch(`/api/dub/projects/${r.projectId}/translation-${r.targetLang}.json`, { headers: tokenHeader(r.projectId) });
    if (res.ok) segments = await res.json();
  } catch {}
  box.innerHTML = '';
  if (!segments.length) { box.innerHTML = '<p class="muted">لا توجد مقاطع متاحة.</p>'; return; }
  const rows = segments.map((s) => {
    const d = document.createElement('div');
    d.className = 'yt-seg';
    d.tabIndex = 0;
    d.setAttribute('role', 'button');
    d.innerHTML = `<span class="yt-seg-time">${fmtTime(s.start || 0)}</span> <span class="yt-seg-spk">${s.speaker || ''}</span> <span class="yt-seg-txt">${escapeHtml(s.translated || s.original || '')}</span>`;
    const jump = () => { try { player.currentTime = Math.max(0, (s.start || 0) - 0.2); player.play(); } catch {} };
    d.addEventListener('click', jump);
    d.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(); } });
    box.appendChild(d);
    return { el: d, start: s.start || 0, end: s.end || (s.start || 0) + 2 };
  });
  player.ontimeupdate = () => {
    const t = player.currentTime || 0;
    const cur = rows.findIndex((x) => t >= x.start && t < x.end);
    rows.forEach((x, idx) => x.el.classList.toggle('current', idx === cur));
    if (cur >= 0) rows[cur].el.scrollIntoView({ block: 'nearest' });
  };
}

function renderResult(r) {
  const box = $('yt-result');
  if (!box) return;
  box.hidden = false;
  const player = $('yt-player');
  if (player) { player.src = withToken(r.videoUrl, r.projectId); player.poster = ''; }
  const meta = $('yt-meta');
  if (meta) meta.textContent = `الأصل: ${r.sourceLang || '?'} → الهدف: ${r.targetLang} • ${r.segments} مقطعًا • وضع ${r.mode}`;
  const set = (id, href, dl) => {
    const a = $(id);
    if (!a) return;
    a.href = href; if (dl) a.setAttribute('download', dl);
  };
  set('yt-dl-video', withToken(r.videoUrl, r.projectId), 'dubbed.mp4');
  set('yt-dl-audio', withToken(r.audioUrl, r.projectId), 'dubbed.mp3');
  set('yt-dl-srt', withToken(r.srtUrl, r.projectId), 'subtitles.srt');
  wireDeleteButton(r);
  renderTimeline(r);
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// زر حذف المشروع (تنظيف القرص) — يربط مرة واحدة فقط
function wireDeleteButton(r) {
  const btn = $('yt-delete');
  if (!btn) return;
  if (r && r.projectId) btn.dataset.project = r.projectId;
  if (btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async () => {
    const pid = btn.dataset.project || '';
    if (!pid) return;
    if (!window.confirm('حذف المشروع وملفاته نهائيًا؟')) return;
    try {
      const res = await fetch(`/api/dub/projects/${pid}`, { method: 'DELETE', headers: tokenHeader(pid) });
      if (!res.ok) throw new Error('delete-failed');
      $('yt-result').hidden = true;
      $('yt-progress-label').textContent = 'حُذف المشروع.';
    } catch {
      window.alert('تعذر حذف المشروع.');
    }
  });
}
