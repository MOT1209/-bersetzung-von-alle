/* ---------- ميزات إضافية: سجل + مسرد + إعدادات + قواعد + تشكيل + ملف ---------- */
import { state, safeGet, safeSet, postJson, detectArabic } from './utils.js';
import {
  tashkeelBtn,
  glossaryFrom, glossaryTo, glossaryAddBtn, glossaryListEl,
  glossaryImportBtn, glossaryImportInput, glossaryImportStatus,
  glossaryLoadEn, glossaryLoadAr,
  ruleDomain, ruleSelector, ruleAddBtn, ruleListEl,
  settingsBtn, settingsModal, settingsForm, settingsCancelBtn, settingsCloseBtn,
  historyListEl,
  showToast, showError, hideProgress, showProgress,
} from './ui.js';
import {
  normalizeDictionary, translateWithDictionary, isRtlText, setDebug,
} from './localEngine.mjs';

/* ========== سجل الترجمات ========== */
function loadHistory() {
  try { return JSON.parse(safeGet('aralink-history') || '[]'); } catch { return []; }
}
function saveHistory(list) { safeSet('aralink-history', JSON.stringify(list.slice(0, 30))); }

export function saveToHistory(data, lang) {
  if (!data) return;
  const list = loadHistory();
  const snippet = (data.type === 'youtube' || data.type === 'local-video')
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

/* ========== المسرد ==========
 * مخزنان في localStorage:
 *  - 'aralink-glossary': أزواج يدوية يضيفها المستخدم زوجًا زوجًا (حد 100)
 *  - 'aralink-glossary-imported': قاموس كامل مُستورد من ملف JSON (حد 20000 —
 *    نفس maxEntries في localEngine.mjs). تخزين منفصل لأن حد الأزواج اليدوية
 *    كان سيقتطع القاموس المستورد بصمت.
 * getGlossary() يجمعهما — الأزواج اليدوية أولاً — فيُرسلان مع كل ترجمة.
 */
function loadGlossary() {
  try { return JSON.parse(safeGet('aralink-glossary') || '[]'); } catch { return []; }
}
function saveGlossary(list) { safeSet('aralink-glossary', JSON.stringify(list.slice(0, 100))); }

function loadImportedDict() {
  try { return JSON.parse(safeGet('aralink-glossary-imported') || '{}'); } catch { return {}; }
}
function saveImportedDict(dict) { safeSet('aralink-glossary-imported', JSON.stringify(dict)); }

export function getGlossary() {
  const imported = Object.entries(loadImportedDict()).map(([from, to]) => ({ from, to }));
  return loadGlossary().concat(imported);
}

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
  setupGlossaryImport();
}

/* ========== استيراد قاموس JSON مخصص ==========
 * يُرفع ملف JSON، يُتحقق من سلامته (نوع، مفاتيح نصية، حجم معقول)، ثم يُدمج
 * في الذاكرة — كأزواج مسرد في localStorage تُرسل مع كل ترجمة، وبوصف محلي
 * يترجم النص في المتصفح فورًا دون إعادة تحميل الصفحة.
 */
const GLOSSARY_IMPORT_MAX_BYTES = 2 * 1024 * 1024; // 2MB — قاموس كامل بلا مشقة

// أزواج المسرد تُخزّن كقائمة؛ نجمعها هنا لدمج القاموس المرفوع فوقها
function glossaryPairsToDict(list) {
  const dict = {};
  for (const p of list) {
    if (p && typeof p.from === 'string' && typeof p.to === 'string') dict[p.from] = p.to;
  }
  return dict;
}

function dictToGlossaryPairs(dict) {
  return Object.entries(dict).map(([from, to]) => ({ from, to }));
}

function setImportStatus(text, isError) {
  glossaryImportStatus.textContent = text;
  glossaryImportStatus.classList.toggle('import-err', !!isError);
  glossaryImportStatus.hidden = !text;
}

// ترجمة محلية فورية للنتيجة المعروضة (إن وُجدت) — يرى المستخدم أثر القاموس حالًا
function applyLocalDictToCurrentResult(dict) {
  const data = state.current;
  if (!data) return;
  const src = data.type === 'youtube'
    ? (data.captions || []).map((c) => c.original || '').join('\n')
    : (data.translatedBlocks || []).map((b) => (b && b.content) || '').join('\n\n') || data.translated || '';
  if (!src) return;
  const out = translateWithDictionary(src, dict);
  if (data.type === 'youtube') {
    (data.captions || []).forEach((c) => { c.translated = c.original || ''; });
  }
  const body = document.getElementById('result-body');
  if (body) {
    body.innerHTML = '';
    String(out).split(/\n{2,}/).forEach((p) => {
      const el = document.createElement('p');
      el.className = 'blk';
      el.dir = isRtlText(p) ? 'rtl' : 'ltr';
      el.textContent = p;
      body.appendChild(el);
    });
  }
}

async function loadSampleDictionary(which) {
  const file = which === 'ar' ? 'ar.json' : 'en.json';
  setImportStatus('جاري تحميل القاموس النموذجي…', false);
  glossaryImportBtn.disabled = true;
  try {
    const res = await fetch('/locales/' + file, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    mergeImportedDictionary(json, file);
  } catch (e) {
    console.error('[glossary-import] فشل تحميل القاموس النموذجي:', e);
    setImportStatus('تعذر تحميل القاموس النموذجي — تحقق من اتصال الخادم', true);
  } finally {
    glossaryImportBtn.disabled = false;
  }
}

// الدمج: القاموس المرفوع يُطبَّع (lowercase) ثم يُحفظ في مخزن المستوردات،
// ويُدمج فوق الأزواج اليدوية عند الإرسال (الأزواج اليدوية لها الأولوية)
function mergeImportedDictionary(raw, name) {
  let dict;
  try {
    dict = normalizeDictionary(raw); // يرمي invalid-dictionary إن لم يصلح
  } catch {
    setImportStatus('ملف غير صالح: يجب أن يكون JSON كائنًا بمفاتيح نصية وقيم نصية غير فارغة', true);
    return;
  }
  const entries = Object.keys(dict).length;
  saveImportedDict(dict);
  setImportStatus('تم استيراد ' + entries + ' مدخلة من ' + name + ' ✓', false);
  showToast('تم استيراد القاموس (' + entries + ' مدخلة) ✓');
  applyLocalDictToCurrentResult({ ...dict, ...glossaryPairsToDict(loadGlossary()) });
}

function setupGlossaryImport() {
  glossaryImportBtn.addEventListener('click', () => glossaryImportInput.click());

  glossaryImportInput.addEventListener('change', () => {
    const file = glossaryImportInput.files && glossaryImportInput.files[0];
    glossaryImportInput.value = ''; // نفس الملف قابل لإعادة الرفع
    if (!file) return;
    if (file.size > GLOSSARY_IMPORT_MAX_BYTES) {
      setImportStatus('الملف أكبر من الحد المسموح (2 ميغابايت)', true);
      return;
    }
    setImportStatus('جاري التحقق من الملف…', false);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        mergeImportedDictionary(JSON.parse(String(reader.result)), file.name);
      } catch (e) {
        console.error('[glossary-import] JSON غير صالح في ' + file.name + ':', e);
        setImportStatus('تعذر قراءة الملف — ليس ملف JSON صالحًا', true);
      }
    };
    reader.onerror = () => {
      console.error('[glossary-import] فشل قراءة الملف', reader.error);
      setImportStatus('تعذر قراءة الملف', true);
    };
    reader.readAsText(file);
  });

  glossaryLoadEn.addEventListener('click', (e) => { e.preventDefault(); loadSampleDictionary('en'); });
  glossaryLoadAr.addEventListener('click', (e) => { e.preventDefault(); loadSampleDictionary('ar'); });
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
    el.dir = isRtlText(p) ? 'rtl' : 'ltr';
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
  // المحرك المفضّل: يُحفظ محليًا أيضًا حتى تلتقطه منطق الترجمة (translate.js)
  try { localStorage.setItem('preferredProvider', body.preferredProvider || ''); } catch {}
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
    try { localStorage.setItem('preferredProvider', data.preferredProvider || ''); } catch {}
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

// صيغ المستندات (routes-file.js → SUPPORTED_IMPORT) — المسار الفوري /api/translate-file
const DOC_FORMAT_NAMES = {
  txt: 'نص TXT', md: 'ماركداون MD', docx: 'مستند Word DOCX', xlsx: 'جدول Excel XLSX',
  csv: 'CSV', srt: 'ترجمات SRT', vtt: 'ترجمات VTT', json: 'JSON', xml: 'XML',
  epub: 'كتاب EPUB', pptx: 'عرض PowerPoint PPTX',
};
// صيغ الفيديو/الصوت (routes-local-video.js → SUPPORTED_EXT) — مسار المشاريع
// (رفع → تفريغ صوتي → ترجمة، بتقدّم حيّ عبر server/projectPipeline.js)
const MEDIA_FORMAT_NAMES = {
  mp4: 'فيديو MP4', webm: 'فيديو WebM', mov: 'فيديو MOV', mkv: 'فيديو MKV',
  avi: 'فيديو AVI', m4v: 'فيديو M4V', '3gp': 'فيديو 3GP',
  mp3: 'صوت MP3', wav: 'صوت WAV', m4a: 'صوت M4A', ogg: 'صوت OGG',
};
const FILE_FORMAT_NAMES = { ...DOC_FORMAT_NAMES, ...MEDIA_FORMAT_NAMES };

// حد المستندات يطابق حدّ /api/translate-file (base64 يضخّم ~33%، حدّ الراوتر 15MB)
const MAX_DOC_BYTES = 10 * 1024 * 1024;
// حد الفيديو/الصوت يطابق MAX_BASE64 في routes-local-video.js (~40MB بعد الترميز)
const MAX_MEDIA_BYTES = 30 * 1024 * 1024;

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
  const kind = MEDIA_FORMAT_NAMES[ext] ? 'media' : 'document';
  const maxBytes = kind === 'media' ? MAX_MEDIA_BYTES : MAX_DOC_BYTES;
  if (file.size > maxBytes) {
    showToast('حجم الملف يتجاوز الحد الأقصى (' + formatSize(maxBytes) + ')');
    return;
  }
  // الخادم يتوقّع JSON: { format, content(base64), targetLang } — نقرأ الملف base64
  const reader = new FileReader();
  reader.onload = () => {
    state.file = { name: file.name, ext, kind, mime: file.type || null, base64: String(reader.result).split(',')[1] || '' };
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
