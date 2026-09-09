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

// Module-level state for the currently-loaded project (used by renderTimeline + edit handlers).
let _currentProjectId = null;
let _currentTargetLang = null;
let _hasEdits = false;

// Map PATCH error codes to Arabic messages for the segment editor.
// The backend also returns errorAr — used first when present.
const SEGMENT_ERROR_AR = {
  'invalid-project': 'المشروع غير صالح.',
  'invalid-lang': 'اللغة غير صالحة.',
  'invalid-index': 'رقم المقطع غير صالح.',
  'invalid-text': 'النص غير صالح.',
  'translation-not-found': 'الترجمة غير موجودة.',
  'job-running': 'يوجد مهمة جارية — أعد المحاولة لاحقًا.',
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
// أضيف: تعديل المقطع + حفظ + إشعار التقادم + تحديث صوتي بعد الحفظ
async function renderTimeline(r) {
  const box = $('yt-timeline');
  const player = $('yt-player');
  if (!box || !player) return;
  box.innerHTML = '<p class="muted">جاري تحميل المقاطع…</p>';
  // Reset stale tracking when a different project is loaded (same-project
  // re-renders keep the stale notice visible).
  if (_currentProjectId && _currentProjectId !== r.projectId) _hasEdits = false;
  _currentProjectId = r.projectId;
  _currentTargetLang = r.targetLang;

  let segments = [];
  try {
    const res = await fetch(`/api/dub/projects/${r.projectId}/translation-${r.targetLang}.json`, { headers: tokenHeader(r.projectId) });
    if (res.ok) segments = await res.json();
  } catch { /* empty */ }
  box.innerHTML = '';
  if (!segments.length) { box.innerHTML = '<p class="muted">لا توجد مقاطع متاحة.</p>'; return; }

  let rows = [];

  // Delegate all click/keydown events on the timeline container — prevents
  // duplicate listeners when renderTimeline is re-invoked by renderResult.
  box.onclick = (ev) => {
    const seg = ev.target.closest('.yt-seg');
    if (!seg) return;

    // Save button inside the segment
    if (ev.target.closest('.yt-seg-save')) {
      handleSegmentSave(seg);
      return;
    }
    // Cancel button inside the segment
    if (ev.target.closest('.yt-seg-cancel')) {
      handleSegmentCancel(seg);
      return;
    }
    // Edit button: toggle into edit mode
    if (ev.target.closest('.yt-seg-edit')) {
      handleSegmentEdit(seg);
      return;
    }
    // Click on the segment background (not on textarea/buttons) seeks the player
    if (ev.target.tagName === 'TEXTAREA') return;
    const idx = Number(seg.dataset.index);
    if (!isNaN(idx) && rows[idx]) {
      seekToSegment(rows[idx].start, player);
    }
  };

  box.onkeydown = (ev) => {
    if (ev.key === 'Escape') {
      const editingSeg = box.querySelector('.yt-seg[data-editing]');
      if (editingSeg) {
        ev.stopPropagation();
        handleSegmentCancel(editingSeg);
      }
      return;
    }
    // Block Enter from triggering seek when the textarea is focused
    if (ev.key === 'Enter' && ev.target.tagName === 'TEXTAREA') {
      ev.preventDefault();
      return;
    }
    // Enter/Space on a non-editing segment seeks the player
    if (ev.key === 'Enter' || ev.key === ' ') {
      const seg = ev.target.closest('.yt-seg');
      if (seg && !seg.hasAttribute('data-editing')) {
        ev.preventDefault();
        const idx = Number(seg.dataset.index);
        if (!isNaN(idx) && rows[idx]) seekToSegment(rows[idx].start, player);
      }
    }
  };

  rows = segments.map((s, i) => {
    const d = document.createElement('div');
    d.className = 'yt-seg';
    d.tabIndex = 0;
    d.dataset.index = String(i);
    d.dataset.original = s.original || '';
    d.dataset.translated = s.translated || s.original || '';
    d.dataset.audio = s.audio || '';
    d.setAttribute('role', 'group');
    d.setAttribute('aria-label', `مقطع ${i + 1}`);

    // Build the segment: time | speaker | text | edit button
    d.innerHTML =
      `<span class="yt-seg-time">${fmtTime(s.start || 0)}</span>` +
      `<span class="yt-seg-spk">${escapeHtml(s.speaker || '')}</span>` +
      `<span class="yt-seg-txt">${escapeHtml(s.translated || s.original || '')}</span>` +
      '<button type="button" class="yt-seg-edit" aria-label="تعديل" title="تعديل">✎</button>';
    box.appendChild(d);
    return { el: d, start: s.start || 0, end: s.end || (s.start || 0) + 2 };
  });

  // Update the stale notice indicator
  updateStaleNotice(false);

  // Highlight the currently-playing segment and track its audio basename on the
  // player element so audio-refresh after an edit has a single source of truth.
  player.ontimeupdate = () => {
    const t = player.currentTime || 0;
    const cur = rows.findIndex((x) => t >= x.start && t < x.end);
    rows.forEach((x, idx) => x.el.classList.toggle('current', idx === cur));
    if (cur >= 0 && rows[cur]) {
      rows[cur].el.scrollIntoView({ block: 'nearest' });
      player.dataset.currentAudio = rows[cur].el.dataset.audio || '';
    }
  };
}

// Enter edit mode on a segment: replace the display text with a textarea
function handleSegmentEdit(seg) {
  if (seg.hasAttribute('data-editing')) return;
  const txt = seg.querySelector('.yt-seg-txt');
  const editBtn = seg.querySelector('.yt-seg-edit');
  const idx = Number(seg.dataset.index);
  if (!txt || isNaN(idx)) return;

  const currentText = txt.textContent;
  seg.dataset.editing = '1';
  if (editBtn) editBtn.hidden = true;

  const ta = document.createElement('textarea');
  ta.className = 'yt-seg-ta';
  ta.value = currentText;
  ta.rows = 2;
  ta.setAttribute('aria-label', `تعديل مقطع ${idx + 1}`);

  // Add save + cancel buttons after the textarea
  const actions = document.createElement('span');
  actions.className = 'yt-seg-actions';
  actions.innerHTML =
    '<button type="button" class="yt-seg-save btn-primary btn-sm" aria-label="حفظ">✔ حفظ</button>' +
    '<button type="button" class="yt-seg-cancel btn-secondary btn-sm" aria-label="إلغاء">✘</button>';

  txt.replaceWith(ta, actions);

  // Show original text as a reference below the editing area
  const orig = seg.dataset.original;
  if (orig) {
    const ref = document.createElement('div');
    ref.className = 'yt-seg-ref';
    ref.textContent = `الأصلي: ${orig}`;
    actions.after(ref);
  }

  ta.focus();
  ta.selectionStart = ta.selectionEnd = ta.value.length;

  // Auto-resize textarea to content height
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  });
}

// Cancel editing: revert the row to its last committed value
function handleSegmentCancel(seg) {
  if (!seg.hasAttribute('data-editing')) return;
  const idx = Number(seg.dataset.index);
  rebuildSeg(seg, idx, {
    translated: seg.dataset.translated || seg.dataset.original || '',
    original: seg.dataset.original || '',
    speaker: '',
    start: 0,
  }, false);
}

// Save the edited segment text via PATCH endpoint
async function handleSegmentSave(seg) {
  if (!seg.hasAttribute('data-editing')) return;
  const idx = Number(seg.dataset.index);
  const ta = seg.querySelector('.yt-seg-ta');
  if (!ta || !_currentProjectId || !_currentTargetLang) return;

  const newText = ta.value.trim();
  if (!newText) {
    showSegError(seg, 'النص لا يمكن أن يكون فارغًا.');
    return;
  }

  // Disable controls and show saving state
  const saveBtn = seg.querySelector('.yt-seg-save');
  const cancelBtn = seg.querySelector('.yt-seg-cancel');
  ta.disabled = true;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '…'; }
  if (cancelBtn) cancelBtn.disabled = true;
  clearSegFeedback(seg);

  try {
    const res = await fetch(
      `/api/dub/projects/${_currentProjectId}/segments/${idx}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...tokenHeader(_currentProjectId) },
        body: JSON.stringify({ lang: _currentTargetLang, translated: newText }),
      }
    );
    const data = await res.json();

    if (!res.ok) {
      const msg = data.errorAr || SEGMENT_ERROR_AR[data.error] || 'تعذر الحفظ — أعد المحاولة.';
      showSegError(seg, msg);
      return;
    }

    // Success: update the row with the returned segment data
    const updatedSegment = data.segment || { translated: newText };
    rebuildSeg(seg, idx, updatedSegment, false);

    // Transient confirmation
    showSegSuccess(seg, 'تم الحفظ');

    // Mark exports as stale if the backend says so
    if (data.derivedStale) {
      _hasEdits = true;
      updateStaleNotice(true);
    }

    // Audio refresh: if the player is currently playing this segment, update the audio src
    refreshAudioForSegment(idx, updatedSegment);

  } catch {
    showSegError(seg, 'تعذر الاتصال بالخادم.');
  }
}

// Rebuild a segment row's DOM to reflect the given segment data.
// When editing=true, enters edit mode; otherwise shows display mode.
function rebuildSeg(seg, idx, s, editing) {
  const txtContent = escapeHtml(s.translated || s.original || '');
  const spkContent = escapeHtml(s.speaker || '');
  const timeContent = fmtTime(s.start || 0);
  const refHtml = s.original ? `<div class="yt-seg-ref">الأصلي: ${escapeHtml(s.original)}</div>` : '';

  seg.dataset.original = s.original || '';
  seg.dataset.translated = s.translated || s.original || '';
  seg.dataset.audio = s.audio || '';
  seg.removeAttribute('data-editing');

  if (editing) {
    // Re-enter edit mode
    seg.innerHTML =
      `<span class="yt-seg-time">${timeContent}</span>` +
      `<span class="yt-seg-spk">${spkContent}</span>` +
      `<textarea class="yt-seg-ta" rows="2" aria-label="تعديل مقطع ${idx + 1}">${escapeHtml(s.translated || s.original || '')}</textarea>` +
      '<span class="yt-seg-actions">' +
        '<button type="button" class="yt-seg-save btn-primary btn-sm" aria-label="حفظ">✔ حفظ</button>' +
        '<button type="button" class="yt-seg-cancel btn-secondary btn-sm" aria-label="إلغاء">✘</button>' +
      '</span>' +
      refHtml;
    const ta = seg.querySelector('.yt-seg-ta');
    if (ta) {
      ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; });
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
    }
  } else {
    // Display mode (default)
    seg.innerHTML =
      `<span class="yt-seg-time">${timeContent}</span>` +
      `<span class="yt-seg-spk">${spkContent}</span>` +
      `<span class="yt-seg-txt">${txtContent}</span>` +
      '<button type="button" class="yt-seg-edit" aria-label="تعديل" title="تعديل">✎</button>';
  }
}

// Show a transient success message inside the segment row
function showSegSuccess(seg, msg) {
  clearSegFeedback(seg);
  const el = document.createElement('div');
  el.className = 'yt-seg-toast yt-seg-toast-ok';
  el.textContent = msg;
  seg.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// Show an inline error message inside the segment row (keeps the textarea intact)
function showSegError(seg, msg) {
  // Re-enable the textarea so the user doesn't lose their edit
  const ta = seg.querySelector('.yt-seg-ta');
  const saveBtn = seg.querySelector('.yt-seg-save');
  const cancelBtn = seg.querySelector('.yt-seg-cancel');
  if (ta) ta.disabled = false;
  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✔ حفظ'; }
  if (cancelBtn) cancelBtn.disabled = false;

  clearSegFeedback(seg);
  const el = document.createElement('div');
  el.className = 'yt-seg-toast yt-seg-toast-err';
  el.setAttribute('role', 'alert');
  el.textContent = msg;
  seg.appendChild(el);
}

// Clear any existing toast/error feedback inside the segment
function clearSegFeedback(seg) {
  seg.querySelectorAll('.yt-seg-toast').forEach((el) => el.remove());
}

// Update the stale-notice element beneath the timeline
function updateStaleNotice(show) {
  const notice = $('yt-stale-notice');
  if (!notice) return;
  if (show) {
    notice.textContent = 'التعديلات المعلّقة تجعل ملفات التصدير غير محدّثة';
    notice.hidden = false;
  } else if (!_hasEdits) {
    notice.hidden = true;
  }
}

// After a successful save, note the regenerated audio clip for the segment:
// keep the row's audio basename + the player's reference up to date so the
// next playback cycle uses the new clip without re-queuing the whole timeline.
function refreshAudioForSegment(idx, updatedSegment) {
  const player = $('yt-player');
  const box = $('yt-timeline');
  if (!player || !updatedSegment.audio) return;
  const row = box ? box.querySelector(`.yt-seg[data-index="${idx}"]`) : null;
  if (row) row.dataset.audio = updatedSegment.audio;
  player.dataset.currentAudio = updatedSegment.audio;
}

// Helper: seek the player to a segment's start time
function seekToSegment(start, player) {
  try { player.currentTime = Math.max(0, start - 0.2); player.play(); } catch { /* empty */ }
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
