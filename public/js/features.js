/* ---------- ميزات إضافية: سجل + مسرد + إعدادات + قواعد + تشكيل + ملف ---------- */
import { state, safeGet, safeSet, postJson, mapError, detectArabic } from './utils.js';
import {
  $, targetLang, urlInput, textInput, tashkeelBtn,
  glossaryFrom, glossaryTo, glossaryAddBtn, glossaryListEl,
  ruleDomain, ruleSelector, ruleAddBtn, ruleListEl,
  settingsBtn, settingsModal, settingsForm, settingsCancelBtn, settingsCloseBtn,
  clearHistoryBtn, historyListEl,
  showToast, showError, hideProgress, showProgress,
} from './ui.js';

/* ========== سجل الترجمات ========== */
function loadHistory() {
  try { return JSON.parse(safeGet('aralink-history') || '[]'); } catch { return []; }
}
function saveHistory(list) { safeSet('aralink-history', JSON.stringify(list.slice(0, 30))); }

export function saveToHistory(data, lang) {
  if (!data) return;
  const list = loadHistory();
  const snippet = data.type === 'youtube'
    ? (data.captions || []).map((c) => c.translated || c.original || '').join(' ').slice(0, 140)
    : (data.translatedBlocks || []).map((b) => (b && b.content) || '').join(' ').slice(0, 140) || (data.translated || '').slice(0, 140);
  list.unshift({ ts: Date.now(), lang, type: data.type, src: data.sourceUrl || '', title: data.meta?.title || '', snippet });
  saveHistory(list);
}

export function renderHistory() {
  const list = loadHistory();
  historyListEl.innerHTML = '';
  if (!list.length) {
    historyListEl.innerHTML = '<p class="field-hint">لا توجد ترجمات سابقة</p>';
    return;
  }
  list.forEach((h) => {
    const d = document.createElement('div');
    d.className = 'glossary-item';
    const left = document.createElement('div');
    left.style.flex = '1';
    const titleEl = document.createElement('div');
    titleEl.style.fontWeight = '600';
    titleEl.textContent = h.title || h.src || 'ترجمة';
    const sub = document.createElement('div');
    sub.className = 'field-hint';
    const dt = new Date(h.ts);
    sub.textContent = dt.toLocaleDateString('ar') + ' ' + dt.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) + ' · ' + h.lang;
    const snip = document.createElement('div');
    snip.className = 'field-hint';
    snip.style.marginTop = '4px';
    snip.textContent = h.snippet || '';
    left.appendChild(titleEl);
    left.appendChild(sub);
    left.appendChild(snip);
    d.appendChild(left);
    historyListEl.appendChild(d);
  });
}

export function clearHistory() {
  localStorage.removeItem('aralink-history');
  renderHistory();
  showToast('تم مسح السجل');
}

/* ========== مشاركة عبر الرابط (#share=) ========== */
export function handleShareHash() {
  try {
    if (!location.hash || !location.hash.startsWith('#share=')) return;
    const text = decodeURIComponent(location.hash.slice(7));
    if (text) {
      state.current = { type: 'text', sourceLang: 'auto', translated: text, original: '', meta: { title: 'مشاركة' } };
      state.activeTab = 'translated';
      document.getElementById('result-body').textContent = text;
      document.getElementById('result').hidden = false;
    }
    history.replaceState(null, '', location.pathname + location.search);
  } catch {}
}

/* ========== المسرد ========== */
function loadGlossary() {
  try { return JSON.parse(safeGet('aralink-glossary') || '[]'); } catch { return []; }
}
function saveGlossary(list) { safeSet('aralink-glossary', JSON.stringify(list.slice(0, 100))); }

export function getGlossary() { return loadGlossary(); }

function renderGlossaryList() {
  const list = loadGlossary();
  glossaryListEl.innerHTML = '';
  if (!list.length) {
    glossaryListEl.innerHTML = '<p class="field-hint">لا توجد أزواج بعد — أضف كلمة أصلية وترجمتها</p>';
    return;
  }
  list.forEach((pair, i) => {
    const d = document.createElement('div');
    d.className = 'glossary-item';
    const from = document.createElement('span');
    from.className = 'glossary-from';
    from.textContent = pair.from;
    const to = document.createElement('span');
    to.className = 'glossary-to';
    to.textContent = pair.to;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'glossary-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'حذف ' + pair.from);
    del.addEventListener('click', () => {
      const updated = loadGlossary();
      updated.splice(i, 1);
      saveGlossary(updated);
      renderGlossaryList();
      showToast('حُذف الزوج');
    });
    d.appendChild(from);
    d.appendChild(to);
    d.appendChild(del);
    glossaryListEl.appendChild(d);
  });
}

function addGlossaryPair() {
  const from = glossaryFrom.value.trim();
  const to   = glossaryTo.value.trim();
  if (!from || !to) { showToast('أدخل الكلمتين معًا'); return; }
  const list = loadGlossary();
  list.push({ from, to });
  saveGlossary(list);
  glossaryFrom.value = '';
  glossaryTo.value   = '';
  renderGlossaryList();
  showToast('أُضيف إلى المسرد ✓');
}

export function initGlossary() {
  renderGlossaryList();
  glossaryAddBtn.addEventListener('click', addGlossaryPair);
  glossaryFrom.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); glossaryTo.focus(); } });
  glossaryTo.addEventListener('keydown',   (e) => { if (e.key === 'Enter') { e.preventDefault(); addGlossaryPair(); } });
}

/* ========== قواعد الاستخراج ========== */
async function loadRules() {
  try {
    const res  = await fetch('/api/settings/rules', { signal: AbortSignal.timeout(10000) });
    const data = await res.json().catch(() => null);
    return (data && Array.isArray(data.rules)) ? data.rules : [];
  } catch { return []; }
}

function renderRules(rules) {
  ruleListEl.innerHTML = '';
  if (!rules.length) {
    ruleListEl.innerHTML = '<p class="field-hint">لا توجد قواعد بعد — أضف نطاقًا مثل news.google.com مع المحدد article</p>';
    return;
  }
  rules.forEach((r) => {
    const d = document.createElement('div');
    d.className = 'glossary-item';
    const dom = document.createElement('span');
    dom.className = 'glossary-from';
    dom.dir = 'ltr';
    dom.textContent = r.domain;
    const sel = document.createElement('span');
    sel.className = 'glossary-to';
    sel.dir = 'ltr';
    sel.textContent = (r.contentSelectors || []).join(', ');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'glossary-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'حذف قاعدة ' + r.domain);
    del.addEventListener('click', async () => {
      try { await fetch('/api/settings/rules/' + encodeURIComponent(r.domain), { method: 'DELETE' }); } catch {}
      const rules2 = await loadRules();
      renderRules(rules2);
      showToast('حُذفت القاعدة');
    });
    d.appendChild(dom);
    d.appendChild(sel);
    d.appendChild(del);
    ruleListEl.appendChild(d);
  });
}

async function addRule() {
  const domain   = ruleDomain.value.trim();
  const selector = ruleSelector.value.trim();
  if (!domain || !selector) { showToast('أدخل النطاق والمحدد معًا'); return; }
  const contentSelectors = selector.split(',').map((s) => s.trim()).filter(Boolean);
  try {
    const res  = await fetch('/api/settings/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, titleSelector: 'h1', contentSelectors }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      showToast(data && data.error === 'invalid-rule' ? 'قاعدة غير صالحة — تحقق من النطاق والمحدد' : 'تعذر حفظ القاعدة');
      return;
    }
    ruleDomain.value   = '';
    ruleSelector.value = '';
    renderRules((data && data.rules) || await loadRules());
    showToast('أُضيفت القاعدة ✓');
  } catch { showToast('تعذر حفظ القاعدة'); }
}

export function initRules() {
  loadRules().then(renderRules);
  ruleAddBtn.addEventListener('click', addRule);
  ruleDomain.addEventListener('keydown',   (e) => { if (e.key === 'Enter') { e.preventDefault(); ruleSelector.focus(); } });
  ruleSelector.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addRule(); } });
}

/* ========== التشكيل ========== */
export function setupTashkeelButton() {
  tashkeelBtn.addEventListener('click', async () => {
    if (state.running) return;
    const text = (state.current && (state.current.translated || '')) || '';
    if (!text || !detectArabic(text)) { showToast('النص لا يحتوي على حروف عربية'); return; }
    state.running = true;
    tashkeelBtn.disabled = true;
    try {
      showProgress('جاري التشكيل (إضافة الحركات)…');
      const { status, data } = await postJson('/api/tashkeel', { text });
      hideProgress();
      if (data && data.error) { showError(data.error, status); return; }
      if (data && data.diacritized) {
        if (state.current) state.current.translated = data.diacritized;
        state.activeTab = 'translated';
        document.getElementById('result-body').innerHTML = '';
        renderParagraphsLocal(data.diacritized);
        showToast(data.engine === 'gemini' ? 'تم التشكيل (Gemini) ✓' : 'تم التشكيل (قواعدي — سكون/شدة) ✓');
      }
    } catch { hideProgress(); showError('server-error', 500); }
    finally { state.running = false; tashkeelBtn.disabled = false; }
  });
}

function renderParagraphsLocal(text) {
  const body = document.getElementById('result-body');
  body.innerHTML = '';
  String(text || '').split(/\n{2,}/).forEach((p) => {
    const el = document.createElement('p');
    el.className = 'blk';
    el.textContent = p;
    body.appendChild(el);
  });
}

/* ========== إعدادات ========== */
function openSettings() {
  settingsModal.hidden = false;
  const dashboardLink = document.getElementById('dashboard-link');
  if (dashboardLink) {
    const adminToken = localStorage.getItem('aralink-admin-token');
    dashboardLink.hidden = !adminToken;
  }
}
function closeSettings() { settingsModal.hidden = true;  }

async function saveSettings(e) {
  e.preventDefault();
  const fd = new FormData(settingsForm);
  const body = {};
  for (const [k, v] of fd.entries()) {
    if (k === 'ttsEnabled') body.ttsEnabled = true;
    else if (k === 'autoCache') body.autoCache = true;
    else body[k] = v;
  }
  if (!body.ttsEnabled) body.ttsEnabled = false;
  if (!body.autoCache)  body.autoCache  = false;
  try {
    const res  = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) { showToast(data?.error || 'تعذر الحفظ'); return; }
    showToast('تم حفظ الإعدادات ✓');
    closeSettings();
  } catch { showToast('تعذر حفظ الإعدادات'); }
}

async function loadSettings() {
  try {
    const res  = await fetch('/api/settings', { signal: AbortSignal.timeout(10000) });
    const data = await res.json().catch(() => null);
    if (!data) return;
    const fields = settingsForm.elements;
    if (fields.defaultTarget)   fields.defaultTarget.value   = data.defaultTarget   || '';
    if (fields.ttsEnabled)      fields.ttsEnabled.checked    = !!data.ttsEnabled;
    if (fields.googleApiKey)    fields.googleApiKey.value    = data.googleApiKey    || '';
    if (fields.geminiApiKey)    fields.geminiApiKey.value    = data.geminiApiKey    || '';
    if (fields.preferredProvider) fields.preferredProvider.value = data.preferredProvider || '';
    if (fields.autoCache)       fields.autoCache.checked     = !!data.autoCache;
  } catch {}
}

export function initSettings() {
  settingsBtn.addEventListener('click',      () => { openSettings(); loadSettings(); });
  settingsCancelBtn.addEventListener('click', closeSettings);
  settingsCloseBtn.addEventListener('click',  closeSettings);
  settingsForm.addEventListener('submit',     saveSettings);
  settingsModal.addEventListener('click',     (e) => { if (e.target === settingsModal) closeSettings(); });
  document.addEventListener('keydown',        (e) => { if (e.key === 'Escape' && !settingsModal.hidden) closeSettings(); });
}

/* ========== وضع الملف ========== */
export function setupFileMode() {
  const fileInput  = document.getElementById('file-input');
  const dropZone   = document.getElementById('drop-zone');

  if (dropZone) {
    dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    dropZone.addEventListener('click', () => fileInput?.click());
  }

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });
}

// صيغ الإدخال التي يدعمها الخادم (routes-file.js → SUPPORTED_IMPORT)
const FILE_FORMAT_NAMES = {
  txt: 'نص TXT', md: 'ماركداون MD', docx: 'مستند Word DOCX', xlsx: 'جدول Excel XLSX',
  csv: 'CSV', srt: 'ترجمات SRT', vtt: 'ترجمات VTT', json: 'JSON', xml: 'XML',
  epub: 'كتاب EPUB', pptx: 'عرض PowerPoint PPTX',
};

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' بايت';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' كيلوبايت';
  return (bytes / (1024 * 1024)).toFixed(1) + ' ميغابايت';
}

function handleFile(file) {
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!FILE_FORMAT_NAMES[ext]) {
    showToast('صيغة الملف غير مدعومة — يُدعم: ' + Object.keys(FILE_FORMAT_NAMES).join('، '));
    return;
  }
  // base64 يضخّم ~33% وحدّ جسم الراوتر 15MB — نبقى تحت ~10MB للملف الخام
  if (file.size > 10 * 1024 * 1024) {
    showToast('حجم الملف يتجاوز الحد الأقصى (10 ميغابايت)');
    return;
  }
  // الخادم يتوقّع JSON: { format, content(base64), targetLang } — نقرأ الملف base64
  const reader = new FileReader();
  reader.onload = () => {
    state.file = { name: file.name, ext, base64: String(reader.result).split(',')[1] || '' };
    const fileMeta = document.getElementById('file-meta');
    if (fileMeta) {
      fileMeta.textContent = '📎 ' + file.name + ' (' + formatSize(file.size) + ') — ' + FILE_FORMAT_NAMES[ext];
      fileMeta.hidden = false;
    }
    const dropText = document.getElementById('drop-text');
    if (dropText) dropText.hidden = true;
    showToast('تم اختيار الملف: ' + file.name);
  };
  reader.onerror = () => showToast('تعذر قراءة الملف');
  reader.readAsDataURL(file);
}
