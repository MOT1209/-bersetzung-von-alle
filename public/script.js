/* ===== أرا لينك — منطق الواجهة ===== */
'use strict';

/* ---------- مراجع العناصر ---------- */
const urlInput = document.getElementById('url-input');
const textInput = document.getElementById('text-input');
const targetLang = document.getElementById('target-lang');
const translateBtn = document.getElementById('translate-btn');
const smartBtn = document.getElementById('smart-btn');
const retryBtn = document.getElementById('retry-btn');
const modeBtns = document.querySelectorAll('.mode-btn');
const urlModeEl = document.getElementById('url-mode');
const textModeEl = document.getElementById('text-mode');
const fileModeEl = document.getElementById('file-mode');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const dropText = document.getElementById('drop-text');
const fileMeta = document.getElementById('file-meta');
const fileFormatLine = document.getElementById('file-format-line');
const exportRow = document.getElementById('export-row');
const preferredProvider = document.getElementById('preferred-provider');
const progress = document.getElementById('progress');
const progressLabel = document.getElementById('progress-label');
const result = document.getElementById('result');
const resultEmbed = document.getElementById('result-embed');
const resultBody = document.getElementById('result-body');
const metaTitle = document.getElementById('meta-title');
const metaLine = document.getElementById('meta-line');
const tabs = document.querySelectorAll('.tab');
const srtBtn = document.getElementById('srt-btn');
const listenBtn = document.getElementById('listen-btn');
const sourceNotice = document.getElementById('source-notice');
const ttsPlayer = document.getElementById('tts-player');
const langSearch = document.getElementById('lang-search');
const localBtn = document.getElementById('local-btn');
const cacheBadge = document.getElementById('cache-badge');
const capBar = document.getElementById('cap-bar');
const capPanel = document.getElementById('cap-panel');
const capPanelList = document.getElementById('cap-panel-list');
const localPlayer = document.getElementById('local-player');
const errorEl = document.getElementById('error');
const errorMessage = document.getElementById('error-message');
const copyBtn = document.getElementById('copy-btn');
const shareBtn = document.getElementById('share-btn');
const tashkeelBtn = document.getElementById('tashkeel-btn');
const shareView = document.getElementById('share-view');
const shareBody = document.getElementById('share-body');
const shareCloseBtn = document.getElementById('share-close-btn');
const historyEl = document.getElementById('history');
const historyListEl = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const toast = document.getElementById('toast');
const themeToggle = document.getElementById('theme-toggle');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsForm = document.getElementById('settings-form');
const settingsGeminiKey = document.getElementById('settings-gemini-key');
const settingsApiKey = document.getElementById('settings-api-key');
const ADMIN_TOKEN_STORAGE = 'aralinkAdminToken';
const settingsMyMemoryEmail = document.getElementById('settings-mymemory-email');
const settingsLibreUrl = document.getElementById('settings-libre-url');
const settingsDeeplKey = document.getElementById('settings-deepl-key');
const settingsOpenaiKey = document.getElementById('settings-openai-key');
const settingsOpenaiBaseUrl = document.getElementById('settings-openai-base-url');
const settingsOpenaiModel = document.getElementById('settings-openai-model');
const settingsProviderOrder = document.getElementById('settings-provider-order');
const settingsCancelBtn = document.getElementById('settings-cancel-btn');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const glossaryListEl = document.getElementById('glossary-list');
const glossaryFrom = document.getElementById('glossary-from');
const glossaryTo = document.getElementById('glossary-to');
const glossaryAddBtn = document.getElementById('glossary-add-btn');
const ruleDomain = document.getElementById('rule-domain');
const ruleSelector = document.getElementById('rule-selector');
const ruleAddBtn = document.getElementById('rule-add-btn');
const ruleListEl = document.getElementById('rule-list');
const compareBtn = document.getElementById('compare-btn');
const batchInput = document.getElementById('batch-input');
const batchBtn = document.getElementById('batch-btn');
const batchStatus = document.getElementById('batch-status');
const batchResults = document.getElementById('batch-results');

/* ---------- الحالة (آلة الحالات: idle → fetching → translating → done | error) ---------- */
const state = {
  mode: 'url',            // 'url' | 'text' | 'file'
  running: false,         // حارس ضد الضغط المزدوج
  current: null,          // آخر نتيجة معروضة
  activeTab: 'translated',// 'translated' | 'original'
  compare: false,         // وضع المقارنة جنبًا إلى جنب
  batchRunning: false,    // حارس ترجمة الدفعات
  file: null,             // { name, ext, base64 } — الملف المختار في وضع الملف
  resultForExport: null   // آخر نتيجة ترجمة ملف (لأزرار التصدير)
};

/* ---------- أسماء اللغات (الرمز → الاسم العربي) ---------- */
const LANG_NAMES = {
  ar: 'العربية', en: 'الإنجليزية', fr: 'الفرنسية', es: 'الإسبانية',
  de: 'الألمانية', it: 'الإيطالية', pt: 'البرتغالية', ru: 'الروسية',
  zh: 'الصينية', ja: 'اليابانية', ko: 'الكورية', tr: 'التركية',
  fa: 'الفارسية', ur: 'الأردية', hi: 'الهندية', id: 'الإندونيسية',
  sv: 'السويدية', nl: 'الهولندية', pl: 'البولندية', el: 'اليونانية',
  he: 'العبرية', th: 'التايلاندية', vi: 'الفيتنامية',
  uk: 'الأوكرانية', cs: 'التشيكية', da: 'الدنماركية', fi: 'الفنلندية',
  no: 'النرويجية', ro: 'الرومانية', hu: 'المجرية', bn: 'البنغالية',
  ms: 'الماليزية', sr: 'الصربية', hr: 'الكرواتية', sk: 'السلوفاكية',
  bg: 'البلغارية', lt: 'الليتوانية', lv: 'اللاتفية', et: 'الإستونية',
  sq: 'الألبانية', az: 'الأذرية', kk: 'الكازاخية', uz: 'الأوزبكية',
  sw: 'السواحلية', af: 'الأفريقانية', tl: 'الفلبينية', mn: 'المنغولية',
  ka: 'الجورجية', hy: 'الأرمنية', ta: 'التاميلية', te: 'التيلوغوية',
  ml: 'المالايالامية', si: 'السنهالية', ne: 'النيبالية', km: 'الخميرية',
  lo: 'اللاوية', my: 'البورمية', bo: 'التبتية', zu: 'الزولوية',
  is: 'الأيسلندية', ga: 'الأيرلندية', mt: 'المالطية', mk: 'المقدونية',
  bs: 'البوسنية', sl: 'السلوفينية', be: 'البيلاروسية', tg: 'الطاجيكية',
  tk: 'التركمانية', am: 'الأمهرية', ceb: 'السبوانية'
};

/* ---------- خريطة رسائل الخطأ (رمز → نص عربي) ---------- */
const ERROR_MESSAGES = {
  'invalid-url': 'الرابط غير صالح — تأكد من كتابته بشكل صحيح',
  'invalid-text': 'الرجاء إدخال نص للترجمة',
  'fetch-failed': 'تعذر الوصول إلى الصفحة — قد تكون محمية أو غير متاحة',
  'no-transcript': 'هذا الفيديو لا يحتوي على ترجمة نصية متاحة — جرّب فيديو آخر يظهر فيه زر الترجمة النصية (CC) في يوتيوب',
  'audio-empty': 'تعذر تفريغ الصوت — قد لا يحتوي الفيديو على كلام واضح',
  'translate-failed': 'فشلت الترجمة — حاول مجددًا بعد قليل',
  'content-empty': 'لم نتمكن من استخراج محتوى من هذه الصفحة',
  'pdf-unsupported': 'تعذر قراءة هذا الملف PDF',
  'blocked-url': 'هذا الرابط مرفوض لأسباب أمنية',
  'rate-limited': 'كثرة الطلبات — انتظر قليلاً ثم حاول مجددًا',
  'input-too-large': 'المدخلات كبيرة جدًا — قسّم النص أو الرابط وعد المحاولة',
  'smart-unavailable': 'الترجمة الذكية تحتاج مفتاح Gemini — أضِفه من الإعدادات أو استخدم الترجمة العادية',
  'server-error': 'حدث خطأ غير متوقع',
  'tts-failed': 'تعذر توليد الصوت — حاول مجددًا بعد قليل',
  'text-too-long': 'النص طويل جدًا للقراءة الصوتية',
  'video-download-failed': 'تعذر تنزيل الفيديو — جرّب العرض المضمّن بدلاً منه',
  'invalid-format': 'صيغة الملف غير مدعومة',
  'invalid-file': 'تعذر قراءة الملف — قد يكون تالفًا أو كبيرًا جدًا',
  'invalid-export': 'تعذر تصدير النتيجة بهذه الصيغة',
  'video-too-long': 'الفيديو أطول من الحد المسموح — هذا الحد لحماية سرعة المعالجة على هذا الجهاز',
  'ocr-not-ready': 'محرك OCR غير جاهز بعد — أعد المحاولة خلال دقيقة',
  'ocr-empty': 'لم يُستخرج نص من الصورة — جرّب صورة أوضح أو أكبر'
};

/* ---------- خريطة الخطأ ---------- */
function mapError(code, status) {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (status === 400) return ERROR_MESSAGES['invalid-url'];
  if (status === 422) return ERROR_MESSAGES['fetch-failed'];
  if (status === 502) return ERROR_MESSAGES['translate-failed'];
  if (status === 500) return ERROR_MESSAGES['server-error'];
  return ERROR_MESSAGES['server-error'];
}

function langName(code) {
  if (!code) return 'اللغة الأصلية';
  const key = String(code).toLowerCase().split('-')[0].split('_')[0];
  return LANG_NAMES[key] || 'اللغة الأصلية';
}

/* ---------- سجل الترجمات (localStorage — متسامح مع غياب التخزين) ---------- */
const HISTORY_KEY = 'aralink-history';
const GLOSSARY_KEY = 'aralink-glossary';
const HISTORY_MAX = 20;
const TYPE_NAMES = { text: 'نص', youtube: 'يوتيوب', article: 'مقال' };

/* ---------- وضع الملف: أسماء الصيغ المدعومة + صيغ التصدير ---------- */
const FILE_FORMAT_NAMES = {
  txt: 'نص TXT', md: 'ماركداون MD', docx: 'مستند Word DOCX', xlsx: 'جدول Excel XLSX',
  csv: 'CSV', srt: 'ترجمات SRT', vtt: 'ترجمات VTT', json: 'JSON', xml: 'XML',
  epub: 'كتاب EPUB', pptx: 'عرض PowerPoint PPTX',
  mp4: 'فيديو MP4', webm: 'فيديو WebM', mov: 'فيديو MOV', mkv: 'فيديو MKV',
  avi: 'فيديو AVI', m4v: 'فيديو M4V', '3gp': 'فيديو 3GP',
  mp3: 'صوت MP3', wav: 'صوت WAV', m4a: 'صوت M4A', ogg: 'صوت OGG',
  png: 'صورة PNG', jpg: 'صورة JPG', jpeg: 'صورة JPEG', webp: 'صورة WebP', bmp: 'صورة BMP'
};
// صيغ الفيديو/الصوت (تُرسل إلى /api/video-local) وصيغ الصور (تُرسل إلى /api/ocr)
const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', '3gp', 'mp3', 'wav', 'm4a', 'ogg'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'bmp'];
const EXPORT_FORMATS = [
  { fmt: 'txt', label: 'TXT' },
  { fmt: 'md', label: 'MD' },
  { fmt: 'docx', label: 'DOCX' },
  { fmt: 'srt', label: 'SRT' },
  { fmt: 'vtt', label: 'VTT' },
  { fmt: 'json', label: 'JSON' },
  { fmt: 'csv', label: 'CSV' },
  { fmt: 'xml', label: 'XML' }
];

function safeGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
}

function safeRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* تجاهل */ }
}

function loadHistoryRaw() {
  const raw = safeGet(HISTORY_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function saveHistoryRaw(list) {
  safeSet(HISTORY_KEY, JSON.stringify(list));
}

/* استخراج النص (مترجم/أصلي) حسب نوع النتيجة */
function extractResultText(data, which) {
  if (!data) return '';
  if (data.type === 'youtube') {
    return (data.captions || []).map((c) => c[which] || c.original || '').join('\n');
  }
  if (data.type === 'article') {
    const blocks = which === 'translated' ? data.translatedBlocks : data.originalBlocks;
    return (blocks || []).map((b) => (b && b.content) || '').join('\n');
  }
  return which === 'translated' ? (data.translated || '') : (data.original || '');
}

function saveToHistory(data, targetLangCode) {
  if (!data || !data.type) return;
  const rec = {
    id: Date.now(),
    type: data.type,
    original: extractResultText(data, 'original'),
    translated: extractResultText(data, 'translated'),
    targetLang: targetLangCode,
    date: new Date().toISOString(),
    data: data // الحمولة الكاملة لإعادة فتح دقيقة للنتيجة
  };
  const list = loadHistoryRaw();
  list.unshift(rec);
  if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
  saveHistoryRaw(list);
  renderHistory();
}

function formatHistoryDate(iso) {
  try {
    return new Date(iso).toLocaleString('ar', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch (e) { return ''; }
}

function renderHistory() {
  const list = loadHistoryRaw();
  historyEl.hidden = list.length === 0;
  historyListEl.innerHTML = '';
  list.forEach((rec, index) => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const badge = document.createElement('span');
    badge.className = 'history-badge badge-' + (rec.type || 'text');
    badge.textContent = TYPE_NAMES[rec.type] || 'نص';

    const preview = document.createElement('span');
    preview.className = 'history-preview';
    const previewText = (rec.translated || rec.original || '').trim().replace(/\s+/g, ' ');
    preview.textContent = previewText ? previewText.slice(0, 120) : '—';

    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.textContent = langName(rec.targetLang) + ' · ' + formatHistoryDate(rec.date);

    const reopen = document.createElement('button');
    reopen.type = 'button';
    reopen.className = 'btn-reopen';
    reopen.textContent = 'إعادة فتح';
    reopen.addEventListener('click', () => reopenHistory(list[index]));

    item.appendChild(badge);
    item.appendChild(preview);
    item.appendChild(meta);
    item.appendChild(reopen);
    historyListEl.appendChild(item);
  });
}

function clearHistory() {
  safeRemove(HISTORY_KEY);
  renderHistory();
  showToast('تم مسح السجل');
}

/* ---------- مسرد المصطلحات (localStorage — يُرسل مع كل ترجمة) ---------- */
function loadGlossary() {
  try {
    const raw = safeGet(GLOSSARY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((g) => g && typeof g.from === 'string' && typeof g.to === 'string') : [];
  } catch (e) {
    return [];
  }
}

function saveGlossary(list) {
  safeSet(GLOSSARY_KEY, JSON.stringify(list.slice(0, 100)));
}

function getGlossary() {
  return loadGlossary();
}

function renderGlossaryList() {
  const list = loadGlossary();
  glossaryListEl.innerHTML = '';
  if (!list.length) {
    glossaryListEl.innerHTML = '<p class="field-hint">لا توجد مصطلحات بعد — أضف زوجًا مثل cloud → سحابة</p>';
    return;
  }
  list.forEach((g, i) => {
    const row = document.createElement('div');
    row.className = 'glossary-item';
    row.innerHTML = '<span dir="ltr" class="glossary-from">' + escapeHtml(g.from) + '</span><span class="glossary-arrow">←</span><span class="glossary-to">' + escapeHtml(g.to) + '</span>';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'glossary-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'حذف ' + g.from);
    del.addEventListener('click', () => {
      const next = loadGlossary();
      next.splice(i, 1);
      saveGlossary(next);
      renderGlossaryList();
      showToast('حُذفت من المسرد');
    });
    row.appendChild(del);
    glossaryListEl.appendChild(row);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function reopenHistory(rec) {
  if (!rec || !rec.data) return;
  hideError();
  shareView.hidden = true;
  teardownPlayers();
  // استعادة اللغة المستخدمة في تلك الترجمة لعرض ملخص دقيق
  if (rec.targetLang) targetLang.value = rec.targetLang;
  state.current = rec.data;
  state.activeTab = 'translated';
  renderResult(rec.data);
}

/* ---------- نسخ ومشاركة النتيجة ---------- */
function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodeBase64(b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function currentResultText() {
  return extractResultText(state.current, state.activeTab);
}

function copyTextToClipboard(text) {
  return new Promise((resolve) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => resolve(true), () => resolve(false));
    } else {
      resolve(false);
    }
  }).then((ok) => {
    if (ok) return true;
    // بديل: textarea خفي + execCommand('copy')
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const copied = document.execCommand('copy');
      ta.remove();
      return copied;
    } catch (e) {
      return false;
    }
  });
}

async function copyResult() {
  const text = currentResultText();
  if (!text) return;
  const ok = await copyTextToClipboard(text);
  showToast(ok ? 'تم النسخ ✓' : 'تعذر النسخ — انسخ النص يدويًا');
}

async function shareResult() {
  const data = state.current;
  if (!data) return;
  const text = extractResultText(data, 'translated');
  if (!text) return;
  const url = location.origin + location.pathname + '#share=' + encodeBase64(text);
  const ok = await copyTextToClipboard(url);
  showToast(ok ? 'تم نسخ رابط المشاركة ✓' : 'تعذر نسخ الرابط — انسخه يدويًا من شريط العنوان');
}

/* عرض النص المترجم المشارَك (يُستدعى عند فتح رابط #share=…) */
function appendParagraphs(container, text) {
  const parts = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) parts.push(text);
  for (const part of parts) {
    const el = document.createElement('p');
    el.className = 'blk';
    el.textContent = part;
    container.appendChild(el);
  }
}

function renderShareView(text) {
  shareBody.innerHTML = '';
  appendParagraphs(shareBody, text);
  shareView.hidden = false;
  shareView.classList.remove('reveal');
  void shareView.offsetWidth;
  shareView.classList.add('reveal');
  shareView.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function handleShareHash() {
  const m = location.hash.match(/^#share=(.+)$/);
  if (!m || !m[1]) return;
  let text = '';
  try { text = decodeBase64(m[1]); } catch (e) { return; }
  if (!text.trim()) return;
  renderShareView(text.trim());
}

/* ---------- إشعار منبثق ---------- */
let toastTimer = null;
function showToast(message, ms = 2000) {
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    toast.hidden = true;
  }, ms);
}

/* ---------- تحميل قائمة اللغات (~130) من الخادم + بحث ---------- */
async function loadLanguages() {
  try {
    const res = await fetch('/api/languages', { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    if (data && Array.isArray(data.languages) && data.languages.length >= 10) {
      targetLang.innerHTML = '';
      for (const l of data.languages) {
        const opt = document.createElement('option');
        opt.value = l.code;
        opt.textContent = l.nameAr;
        targetLang.appendChild(opt);
        // تعزيز أسماء اللغات للعرض (langName)
        LANG_NAMES[String(l.code).toLowerCase().split('-')[0]] = l.nameAr;
      }
      // استعادة آخر اختيار للمستخدم
      const saved = safeGet('aralink-lang');
      if (saved && Array.from(targetLang.options).some((o) => o.value === saved)) targetLang.value = saved;
    }
  } catch (e) {
    /* فشل الجلب — القائمة المدمجة المختصرة تبقى احتياطًا */
  }
}

function filterLanguages() {
  const q = langSearch.value.trim().toLowerCase();
  let firstVisible = null;
  for (const opt of targetLang.options) {
    const match = !q || opt.textContent.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q);
    opt.hidden = !match;
    if (match && !firstVisible) firstVisible = opt;
  }
  if (q && firstVisible) targetLang.value = firstVisible.value;
}

/* ---------- إظهار / إخفاء المقاطع ---------- */
function showProgress(label) {
  result.hidden = true;
  errorEl.hidden = true;
  progressLabel.textContent = label;
  progress.hidden = false;
}

function hideProgress() {
  progress.hidden = true;
}

function showError(code, status) {
  progress.hidden = true;
  result.hidden = true;
  errorMessage.textContent = mapError(code, status);
  errorEl.hidden = false;
  errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
  errorEl.hidden = true;
}

/* ---------- الوضع الفاتح/الداكن (data-theme على <html> + localStorage) ---------- */
const THEME_KEY = 'aralink-theme';

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function applyTheme(theme, persist = true) {
  document.documentElement.setAttribute('data-theme', theme);
  if (persist) safeSet(THEME_KEY, theme);
  // مزامنة أيقونة الزر مع السمة الحالية
  if (themeToggle) {
    const isLight = theme === 'light';
    themeToggle.textContent = isLight ? '☀️' : '🌙';
    themeToggle.setAttribute('aria-label', isLight ? 'التبديل إلى الوضع الداكن' : 'التبديل إلى الوضع الفاتح');
    themeToggle.title = isLight ? 'التبديل إلى الوضع الداكن' : 'التبديل إلى الوضع الفاتح';
  }
}

function toggleTheme() {
  applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
}

/* ---------- نافذة الإعدادات (GET/POST /api/settings) ---------- */
let settingsLoaded = false; // هل نجح جلب الإعدادات الحالية؟ (يقرر ما إذا كان إرسال حقل فارغ يعني مسحه)

/* ---------- قائمة المزوّدين المتاحين (GET /api/providers) ---------- */
async function loadProviders() {
  try {
    const res = await fetch('/api/providers', { signal: AbortSignal.timeout(10000) });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !Array.isArray(data.providers)) return;
    const cur = preferredProvider.value || safeGet('preferredProvider') || '';
    preferredProvider.innerHTML = '<option value="">تلقائي (سلسلة الاحتياط)</option>';
    for (const p of data.providers) {
      const opt = document.createElement('option');
      opt.value = p.id;
      const stateTxt = p.available ? '✓ متاح' : 'يتطلب مفتاحاً';
      opt.textContent = p.label + ' — ' + stateTxt;
      preferredProvider.appendChild(opt);
    }
    // استعادة اختيار المستخدم المحفوظ إن ما يزال موجودًا
    if (cur && Array.from(preferredProvider.options).some((o) => o.value === cur)) {
      preferredProvider.value = cur;
    }
  } catch (e) {
    /* الخادم غير متاح — تبقى القائمة الافتراضية */
  }
}

async function openSettings() {
  // إعادة تعيين الحقول عند كل فتح
  settingsGeminiKey.value = '';
  settingsApiKey.value = safeGet(ADMIN_TOKEN_STORAGE) || '';
  settingsMyMemoryEmail.value = '';
  settingsLibreUrl.value = '';
  settingsDeeplKey.value = '';
  settingsOpenaiKey.value = '';
  settingsOpenaiBaseUrl.value = '';
  settingsOpenaiModel.value = '';
  settingsProviderOrder.value = '';
  settingsGeminiKey.placeholder = 'أدخل مفتاح Gemini API';
  settingsDeeplKey.placeholder = 'أدخل مفتاح DeepL API';
  settingsOpenaiKey.placeholder = 'أدخل مفتاح OpenAI API';
  settingsLoaded = false;

  settingsModal.hidden = false;
  renderGlossaryList();
  loadRules().then(renderRules);
  loadProviders();
  try {
    const res = await fetch('/api/settings', { signal: AbortSignal.timeout(10000) });
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      settingsLoaded = true;
      settingsGeminiKey.placeholder = data.hasGeminiKey ? 'مضبوط ✓' : 'أدخل مفتاح Gemini API';
      settingsMyMemoryEmail.value = data.myMemoryEmail || '';
      settingsLibreUrl.value = data.libreUrl || '';
      settingsDeeplKey.placeholder = data.hasDeeplKey ? 'مضبوط ✓' : 'أدخل مفتاح DeepL API';
      settingsOpenaiKey.placeholder = data.hasOpenaiKey ? 'مضبوط ✓' : 'أدخل مفتاح OpenAI API';
      settingsOpenaiBaseUrl.value = data.openaiBaseUrl || '';
      settingsOpenaiModel.value = data.openaiModel || '';
      settingsProviderOrder.value = data.providerOrder || '';
    }
  } catch (e) {
    /* الخادم غير متاح (أو الإعدادات غير مفعّلة) — تبقى الحقول فارغة، الحفظ سيُحاول مجددًا */
  }
  settingsGeminiKey.focus();
}

function closeSettings() {
  settingsModal.hidden = true;
}

async function saveSettings(e) {
  e.preventDefault();
  const payload = {};
  // ملاحظة: الخادم يقبل أسماء المفاتيح الكبيرة فقط (GEMINI_API_KEY …) —
  // كانت الواجهة ترسل camelCase سابقًا فكان الحفظ يُتجاهل صامتًا.
  if (settingsGeminiKey.value.trim()) payload.GEMINI_API_KEY = settingsGeminiKey.value.trim();

  // الحقول غير الأساسية: تُرسل فقط لو كتب المستخدم قيمة، أو لو حمّلنا الإعدادات الحالية (حتى يمكن مسحها)
  if (settingsLoaded) {
    payload.MYMEMORY_EMAIL = settingsMyMemoryEmail.value.trim();
    payload.LIBRE_URL = settingsLibreUrl.value.trim();
  } else {
    if (settingsMyMemoryEmail.value.trim()) payload.MYMEMORY_EMAIL = settingsMyMemoryEmail.value.trim();
    if (settingsLibreUrl.value.trim()) payload.LIBRE_URL = settingsLibreUrl.value.trim();
  }

  // المزوّد المفضّل: يُحفظ محليًا في المتصفح ويُرسل مع كل طلب ترجمة
  if (preferredProvider.value) safeSet('preferredProvider', preferredProvider.value);
  else safeRemove('preferredProvider');

  // حقول المزوّدين الجديدة (DeepL / OpenAI / ترتيب الاحتياط) — بأسماء المفاتيح الكبيرة
  if (settingsDeeplKey.value.trim()) payload.DEEPL_API_KEY = settingsDeeplKey.value.trim();
  if (settingsOpenaiKey.value.trim()) payload.OPENAI_API_KEY = settingsOpenaiKey.value.trim();
  if (settingsLoaded) {
    payload.OPENAI_BASE_URL = settingsOpenaiBaseUrl.value.trim();
    payload.OPENAI_MODEL = settingsOpenaiModel.value.trim();
    payload.PROVIDER_ORDER = settingsProviderOrder.value.trim();
  } else {
    if (settingsOpenaiBaseUrl.value.trim()) payload.OPENAI_BASE_URL = settingsOpenaiBaseUrl.value.trim();
    if (settingsOpenaiModel.value.trim()) payload.OPENAI_MODEL = settingsOpenaiModel.value.trim();
    if (settingsProviderOrder.value.trim()) payload.PROVIDER_ORDER = settingsProviderOrder.value.trim();
  }

  const saveBtn = document.getElementById('settings-save-btn');
  saveBtn.disabled = true;

  // مفتاح إدارة الإعدادات (ADMIN_TOKEN) — يُحفظ محليًا ويُرسل كـ x-admin-token
  const adminToken = settingsApiKey.value.trim();
  if (adminToken) safeSet(ADMIN_TOKEN_STORAGE, adminToken);
  else safeRemove(ADMIN_TOKEN_STORAGE);
  const headers = { 'Content-Type': 'application/json' };
  if (adminToken) headers['x-admin-token'] = adminToken;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    if (res.ok) {
      closeSettings();
      showToast('تم حفظ الإعدادات ✓');
    } else {
      let msg = 'تعذر حفظ الإعدادات — حاول مجددًا';
      try {
        const err = await res.json();
        if (err && err.error === 'settings-disabled') {
          msg = 'إدارة الإعدادات معطّلة على الخادم — اضبط ADMIN_TOKEN في البيئة لتفعيلها';
        } else if (err && err.error === 'unauthorized') {
          msg = 'مفتاح الإدارة غير صحيح — أدخل ADMIN_TOKEN الصحيح';
        } else if (err && err.error === 'invalid-settings') {
          msg = 'بيانات غير صالحة — راجع الحقول';
        }
      } catch (e2) { /* تجاهل */ }
      showToast(msg);
    }
  } catch (e) {
    showToast('تعذر حفظ الإعدادات — تحقق من اتصال الخادم');
  } finally {
    saveBtn.disabled = false;
  }
}

/* ---------- إنشاء وإرسال الطلبات ---------- */
async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(1800000) // 30 دقيقة: التفريغ الصوتي للفيديوهات الطويلة قد يستغرق وقتًا
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  return { status: res.status, data };
}

/* ---------- تنظيف المشغلات من عرض سابق ---------- */
function teardownPlayers() {
  stopCaptionSync();
  if (ytPlayer && typeof ytPlayer.destroy === 'function') { try { ytPlayer.destroy(); } catch (e) { /* تجاهل */ } }
  ytPlayer = null;
  if (localPlayer.src) { localPlayer.pause(); localPlayer.removeAttribute('src'); localPlayer.load(); }
  localPlayer.hidden = true;
  capBar.hidden = true;
  capBar.textContent = '';
  capPanel.hidden = true;
  capPanelList.innerHTML = '';
  capPanelItems = [];
  cacheBadge.hidden = true;
  resultEmbed.hidden = true;
  resultEmbed.innerHTML = '';
}

/* ---------- سير العمل الرئيسي ---------- */
async function runTranslate() {
  if (state.running) return; // حارس ضد الضغط المزدوج
  hideError();
  shareView.hidden = true;

  const target = targetLang.value;
  const glossary = getGlossary();
  const provider = safeGet('preferredProvider') || undefined; // المزوّد المفضّل (إن وُجد)

  let payload;
  let endpoint;

  if (state.mode === 'url') {
    const url = urlInput.value.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      showError('invalid-url', 400);
      return;
    }
    payload = { url, targetLang: target, glossary, provider };
    endpoint = '/api/translate';
  } else if (state.mode === 'text') {
    const text = textInput.value.trim();
    if (!text) {
      showError('invalid-text', 400);
      return;
    }
    payload = { text, targetLang: target, glossary, provider };
    endpoint = '/api/translate-text';
  } else {
    // وضع الملف: يجب اختيار ملف وقراءته أولاً (base64)
    if (!state.file || !state.file.base64) {
      showToast('اختر ملفاً أولاً');
      return;
    }
    const ext = state.file.ext;
    if (IMAGE_EXTS.includes(ext)) {
      // صورة → استخراج نص عبر OCR ثم ترجمة
      payload = { content: state.file.base64, ext };
      endpoint = '/api/ocr';
    } else if (VIDEO_EXTS.includes(ext)) {
      // فيديو/صوت محلي → تفريغ صوتي محلي + ترجمة
      payload = { format: ext, content: state.file.base64, targetLang: target, provider };
      endpoint = '/api/video-local';
    } else {
      payload = { format: ext, content: state.file.base64, targetLang: target, provider };
      endpoint = '/api/translate-file';
    }
  }

  // تشغيل آلة الحالات
  state.running = true;
  translateBtn.disabled = true;

  if (state.mode === 'text') {
    showProgress('جاري الترجمة…');
  } else if (state.mode === 'file') {
    const isVideo = state.file && VIDEO_EXTS.includes(state.file.ext);
    const isImage = state.file && IMAGE_EXTS.includes(state.file.ext);
    showProgress(isVideo ? 'جاري تفريغ الصوت محلياً (قد يستغرق ~5.5× مدة الفيديو)…' : (isImage ? 'جاري استخراج النص من الصورة…' : 'جاري فتح الملف…'));
    setTimeout(() => {
      if (state.running) showProgress(isVideo ? 'جاري الترجمة…' : 'جاري الترجمة…');
    }, 2500);
  } else {
    showProgress('جاري جلب المحتوى…');
    // بعد قليل انتقل إلى مرحلة الترجمة (الخادم يجلب ثم يترجم في طلب واحد)
    setTimeout(() => {
      if (state.running) showProgress('جاري الترجمة…');
    }, 2500);
    // الفيديوهات بدون ترجمات تحتاج تفريغًا صوتيًا قد يستغرق دقائق
    setTimeout(() => {
      if (state.running) showProgress('جاري الترجمة… الفيديوهات الطويلة بدون ترجمات قد تستغرق عدة دقائق');
    }, 20000);
  }

  try {
    const { status, data } = await postJson(endpoint, payload);

    if (data && data.error) {
      showError(data.error, status);
      return;
    }

    // تنظيف أي عرض سابق
    teardownPlayers();
    state.current = data;
    state.activeTab = 'translated';

    if (state.mode === 'file') {
      if (data && data.type === 'local-video') {
        // فيديو محلي مترجم: مشغل + ترجمات متزامنة
        renderLocalVideo(data);
      } else if (data && data.text && !data.translated) {
        // نتيجة OCR: انقل النص المستخرج إلى وضع النص للترجمة
        handleOcrResult(data);
      } else if (!data || !data.translated) {
        showError('server-error', 500);
        return;
      } else {
        renderFileResult(data);
      }
    } else {
      if (!data || !data.type) {
        showError('server-error', 500);
        return;
      }
      // حفظ الترجمة الناجحة في السجل (آخر 20)
      saveToHistory(data, target);
      renderResult(data);
    }
  } catch (e) {
    showError('server-error', 500);
  } finally {
    hideProgress();
    state.running = false;
    translateBtn.disabled = false;
  }
}

/* ---------- عرض النتيجة ---------- */
function renderResult(data) {
  // عنوان / ملخص
  metaTitle.textContent = (data.meta && data.meta.title) ? data.meta.title : '';
  cacheBadge.hidden = !(data.meta && data.meta.cached === true);
  exportRow.hidden = true; // أزرار التصدير تظهر في وضع الملف فقط
  metaLine.textContent = 'تمت الترجمة من ' + langName(data.sourceLang) + ' إلى ' + langName(targetLang.value);

  // مشغل يوتيوب + شريط الترجمة المتزامن
  if (data.type === 'youtube') {
    resultEmbed.hidden = false;
    buildCaptionPanel();
    setupYtPlayer(data.videoId);
  } else {
    resultEmbed.hidden = true;
    resultEmbed.innerHTML = '';
    capPanel.hidden = true;
    capPanelList.innerHTML = '';
  }

  // أزرار SRT والتشغيل المدمج للفيديو فقط
  srtBtn.hidden = data.type !== 'youtube';
  localBtn.hidden = data.type !== 'youtube';

  // زر الاستماع متاح لجميع أنواع النتائج
  listenBtn.hidden = false;

  // النسخ والمشاركة متاحان لجميع أنواع النتائج
  copyBtn.hidden = false;
  shareBtn.hidden = false;

  // زر التشكيل: يظهر فقط إذا كان النص المترجم عربيًا
  const translatedText = (state.current && state.current.translated) || '';
  tashkeelBtn.hidden = !/[\u0600-\u06FF]/.test(translatedText);

  // زر المقارنة جنبًا إلى جنب للمقالات فقط
  compareBtn.hidden = data.type !== 'article';
  state.compare = false;
  compareBtn.classList.remove('active');

  // إشعار مصدر الترجمة: فيديو بدون ترجمات نصية (تفريغ صوتي تلقائي)
  if (data.type === 'youtube' && data.meta && data.meta.source === 'audio') {
    sourceNotice.textContent = 'تم التفريغ من الصوت تلقائيًا — لا توجد ترجمات نصية';
    sourceNotice.hidden = false;
  } else {
    sourceNotice.textContent = '';
    sourceNotice.hidden = true;
  }

  // التبويبات
  tabs.forEach((t) => {
    const active = t.dataset.tab === 'translated';
    t.hidden = false; // إظهار تبويب «النص الأصلي» (يُخفى في وضع الملف فقط)
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });

  renderTab('translated');
  result.hidden = false;
  result.classList.remove('reveal');
  void result.offsetWidth; // إعادة تشغيل حركة الظهور
  result.classList.add('reveal');
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderTab(tab) {
  state.activeTab = tab;
  const data = state.current;
  if (!data) return;

  // وضع المقارنة جنبًا إلى جنب (مقالات فقط) يتجاوز التبويب
  if (state.compare && data.type === 'article') {
    renderCompareView(data);
    return;
  }

  resultBody.innerHTML = '';
  if (data.type === 'youtube') {
    const original = tab === 'original';
    const captions = data.captions || [];
    for (const cap of captions) {
      const row = document.createElement('div');
      row.className = 'cap cap-clickable';
      row.title = 'اضغط للانتقال إلى هذه اللحظة في الفيديو';

      const time = document.createElement('span');
      time.className = 'cap-time';
      time.textContent = '[' + formatClock(cap.start || 0) + ']';

      const text = document.createElement('span');
      text.className = 'cap-text';
      text.textContent = original ? (cap.original || '') : (cap.translated || cap.original || '');

      row.appendChild(time);
      row.appendChild(text);
      row.addEventListener('click', () => {
        if (!original && ytPlayer && typeof ytPlayer.seekTo === 'function') {
          try { ytPlayer.seekTo(cap.start || 0, true); } catch (e) { /* تجاهل */ }
        }
      });
      resultBody.appendChild(row);
    }
  } else if (data.type === 'article') {
    const blocks = tab === 'translated' ? data.translatedBlocks : data.originalBlocks;
    renderBlocks(blocks || []);
  } else {
    // نوع نص مباشر
    const content = tab === 'translated' ? data.translated : data.original;
    renderParagraphs(String(content || ''));
  }
}

/* ---------- عرض كتل المقال ---------- */
function blockTag(type) {
  switch (type) {
    case 'h1': return 'h1';
    case 'h2': return 'h2';
    case 'h3':
    case 'heading': return 'h3';
    case 'blockquote': return 'blockquote';
    default: return 'p'; // 'text' و 'p' و 'li'
  }
}

function renderBlocks(blocks) {
  for (const b of blocks) {
    if (!b || typeof b.content !== 'string') continue;
    const tag = blockTag(b.type);
    const el = document.createElement(tag);

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') el.className = 'blk blk-heading';
    else if (tag === 'blockquote') el.className = 'blk blk-quote';
    else el.className = 'blk';

    el.textContent = b.content;
    resultBody.appendChild(el);
  }
}

/* ---------- عرض نص عادي (فقرات) ---------- */
function renderParagraphs(text) {
  appendParagraphs(resultBody, text);
}

/* ---------- وضع الملف: اختيار/إفلات + ترجمة + تصدير ---------- */
function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' بايت';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' كيلوبايت';
  return (bytes / (1024 * 1024)).toFixed(1) + ' ميغابايت';
}

function handleFile(file) {
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!FILE_FORMAT_NAMES[ext]) {
    showToast('صيغة الملف غير مدعومة');
    return;
  }
  state.file = { name: file.name, ext, base64: '' };
  // قراءة الملف كـ base64 (DataURL → الجزء بعد الفاصلة)
  const reader = new FileReader();
  reader.onload = () => {
    state.file.base64 = String(reader.result).split(',')[1] || '';
    fileMeta.textContent = file.name + ' (' + formatSize(file.size) + ')';
    fileMeta.hidden = false;
    fileFormatLine.textContent = 'الصيغة المكتشفة: ' + FILE_FORMAT_NAMES[ext];
    fileFormatLine.hidden = false;
    dropText.hidden = true;
  };
  reader.onerror = () => showToast('تعذر قراءة الملف');
  reader.readAsDataURL(file);
}

function setupFileMode() {
  // نقر على منطقة الإفلات يفتح اختيار الملف (ودعم لوحة المفاتيح: Enter/Space)
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  // سحب/إفلات: تمييز بصري أثناء السحب + استقبال الملف عند الإفلات
  ['dragenter', 'dragover'].forEach((ev) => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });
  dropZone.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) handleFile(f);
    fileInput.value = ''; // يتيح إعادة اختيار الملف نفسه مرة أخرى
  });
}

/* ---------- عرض نتيجة ترجمة ملف + صف أزرار التصدير ---------- */
function renderFileResult(data) {
  // وضع الملف لا يعيد «نصًا أصليًا» منفصلًا — نخفي تبويبه
  const origTab = document.querySelector('.tab[data-tab="original"]');
  if (origTab) origTab.hidden = true;

  // العنوان والملخص
  const fname = (state.file && state.file.name) ? state.file.name : '';
  metaTitle.textContent = fname ? ('📄 ' + fname) : 'الملف المترجم';
  cacheBadge.hidden = !(data.stats && data.stats.fromCache === true);
  const fmtName = (state.file && FILE_FORMAT_NAMES[state.file.ext]) || String(data.format || '').toUpperCase();
  let line = 'تمت ترجمة الملف' + (fmtName ? ' (' + fmtName + ')' : '') + ' إلى ' + langName(targetLang.value);
  if (data.stats && data.stats.items) line += ' · ' + data.stats.items + ' قطعة';
  metaLine.textContent = line;
  sourceNotice.hidden = true;

  // أزرار: وضع الملف لا يملك فيديو/مقارنة/استماع، ويحتفظ بالنسخ والمشاركة
  srtBtn.hidden = true;
  localBtn.hidden = true;
  listenBtn.hidden = true;
  compareBtn.hidden = true;
  state.compare = false;
  compareBtn.classList.remove('active');
  copyBtn.hidden = false;
  shareBtn.hidden = false;
  // وضع الملف: التشكيل يظهر إن كانت الترجمة عربية
  tashkeelBtn.hidden = !/[\u0600-\u06FF]/.test(String(data.translated || ''));

  // التبويبات: الترجمة نشطة
  tabs.forEach((t) => {
    const active = t.dataset.tab === 'translated';
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });
  state.activeTab = 'translated';

  // المحتوى: مقاطع مترجمة (SRT/VTT) بتوقيتاتها، أو نص عادي
  resultBody.innerHTML = '';
  if (Array.isArray(data.segments) && data.segments.length) {
    for (const seg of data.segments) {
      const row = document.createElement('div');
      row.className = 'cap';
      const time = document.createElement('span');
      time.className = 'cap-time';
      time.textContent = '[' + formatTime(seg.start || 0) + ']';
      const text = document.createElement('span');
      text.className = 'cap-text';
      text.textContent = seg.text || '';
      row.appendChild(time);
      row.appendChild(text);
      resultBody.appendChild(row);
    }
  } else {
    renderParagraphs(String(data.translated || ''));
  }

  // تخزين النتيجة لأزرار التصدير + بناء الأزرار المناسبة
  state.resultForExport = data;
  renderExportRow(data);

  result.hidden = false;
  result.classList.remove('reveal');
  void result.offsetWidth; // إعادة تشغيل حركة الظهور
  result.classList.add('reveal');
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- نتيجة OCR: نقل النص المستخرج إلى وضع النص للترجمة ---------- */
function handleOcrResult(data) {
  const text = String(data.text || '').trim();
  if (!text) {
    showError('ocr-empty', 422);
    return;
  }
  // بدّل إلى وضع النص واملأ الحقل بالنص المستخرج
  const btn = document.querySelector('.mode-btn[data-mode="text"]');
  if (btn) btn.click();
  textInput.value = text;
  state.file = null;
  showToast('تم استخراج النص من الصورة — اضغط «ترجمة» الآن');
}

/* ---------- فيديو محلي مترجم: مشغل + ترجمات WebVTT متزامنة + لوحة المقاطع ---------- */
function buildWebVtt(captions) {
  // captions: [{ start, duration, translated }] → نص WebVTT كامل
  let out = 'WEBVTT\n\n';
  (captions || []).forEach((c, i) => {
    const s = c.start || 0;
    const e = s + (c.duration || 2000);
    out += (i + 1) + '\n';
    out += vttClock(s) + ' --> ' + vttClock(e) + '\n';
    out += (c.translated || c.original || '') + '\n\n';
  });
  return out;
}

function vttClock(sec) {
  let value = Math.max(0, sec || 0);
  let ms = Math.round((value - Math.floor(value)) * 1000);
  if (ms === 1000) { value += 1; ms = 0; }
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = Math.floor(value % 60);
  const p = (n) => String(n).padStart(2, '0');
  return p(h) + ':' + p(m) + ':' + p(s) + '.' + String(ms).padStart(3, '0');
}

function renderLocalVideo(data) {
  // الفيديو المحلي لا يملك «نصًا أصليًا» منفصلًا — نخفي تبويبه
  const origTab = document.querySelector('.tab[data-tab="original"]');
  if (origTab) origTab.hidden = true;

  const fname = (state.file && state.file.name) ? state.file.name : '';
  metaTitle.textContent = fname ? ('🎬 ' + fname) : 'الفيديو المترجم';
  cacheBadge.hidden = !(data.meta && data.meta.cached === true);
  let line = 'تمت ترجمة الفيديو من ' + langName(data.sourceLang) + ' إلى ' + langName(targetLang.value);
  if (data.captions) line += ' · ' + data.captions.length + ' مقطع';
  metaLine.textContent = line;
  sourceNotice.hidden = true;

  // أزرار: نسخ/مشاركة/تصدير فقط (لا استماع ولا مقارنة للفيديو المترجم)
  srtBtn.hidden = true;
  localBtn.hidden = true;
  listenBtn.hidden = true;
  compareBtn.hidden = true;
  state.compare = false;
  compareBtn.classList.remove('active');
  copyBtn.hidden = false;
  shareBtn.hidden = false;
  tashkeelBtn.hidden = true;

  tabs.forEach((t) => {
    const active = t.dataset.tab === 'translated';
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });
  state.activeTab = 'translated';

  // المشغل: الفيديو من كائن المتصفح + مسار ترجمات WebVTT (بلا إعادة بث من الخادم)
  resultEmbed.hidden = false;
  resultEmbed.innerHTML = '';
  const video = document.createElement('video');
  video.controls = true;
  video.preload = 'metadata';
  video.style.width = '100%';
  video.style.maxHeight = '360px';
  video.style.borderRadius = '12px';
  video.style.background = '#000';
  if (state.file && state.file.file) {
    video.src = URL.createObjectURL(state.file.file);
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = 'العربية';
    track.srclang = 'ar';
    track.default = true;
    track.src = URL.createObjectURL(new Blob([buildWebVtt(data.captions || [])], { type: 'text/vtt' }));
    video.appendChild(track);
  }
  resultEmbed.appendChild(video);

  // لوحة المقاطع المترجمة (نمط لوحة يوتيوب)
  capPanel.hidden = false;
  capPanelList.innerHTML = '';
  for (const c of data.captions || []) {
    const row = document.createElement('div');
    row.className = 'cap';
    const time = document.createElement('span');
    time.className = 'cap-time';
    time.textContent = '[' + formatTime(c.start || 0) + ']';
    const text = document.createElement('span');
    text.className = 'cap-text';
    text.textContent = c.translated || c.original || '';
    row.appendChild(time);
    row.appendChild(text);
    capPanelList.appendChild(row);
  }

  // تبويب الترجمة: النص الكامل المترجم
  resultBody.innerHTML = '';
  renderParagraphs((data.captions || []).map((c) => c.translated || c.original || '').join('\n'));

  // أزرار التصدير: SRT/VTT من المقاطع + النص الكامل للبقية
  state.resultForExport = {
    format: 'vtt',
    segments: (data.captions || []).map((c) => ({
      start: c.start || 0,
      end: (c.start || 0) + (c.duration || 2000),
      text: c.translated || c.original || '',
    })),
    translated: (data.captions || []).map((c) => c.translated || c.original || '').join('\n'),
  };
  renderExportRow(state.resultForExport);

  result.hidden = false;
  result.classList.remove('reveal');
  void result.offsetWidth;
  result.classList.add('reveal');
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- زر التشكيل: إضافة حركات للنص العربي المترجم ---------- */
function setupTashkeelButton() {
  tashkeelBtn.addEventListener('click', async () => {
    if (state.running) return;
    const text = (state.current && (state.current.translated || '')) || '';
    if (!text || !/[\u0600-\u06FF]/.test(text)) {
      showToast('النص لا يحتوي على حروف عربية');
      return;
    }
    state.running = true;
    tashkeelBtn.disabled = true;
    try {
      showProgress('جاري التشكيل (إضافة الحركات)…');
      const { status, data } = await postJson('/api/tashkeel', { text });
      hideProgress();
      if (data && data.error) {
        showError(data.error, status);
        return;
      }
      if (data && data.diacritized) {
        if (state.current) state.current.translated = data.diacritized;
        state.activeTab = 'translated';
        resultBody.innerHTML = '';
        renderParagraphs(data.diacritized);
        showToast(data.engine === 'gemini' ? 'تم التشكيل (Gemini) ✓' : 'تم التشكيل (قواعدي — سكون/شدة) ✓');
      }
    } catch (e) {
      hideProgress();
      showError('server-error', 500);
    } finally {
      state.running = false;
      tashkeelBtn.disabled = false;
    }
  });
}

/* ---------- صف أزرار التصدير (حسب نوع النتيجة) ---------- */
function renderExportRow(data) {
  const buttons = document.getElementById('export-buttons');
  buttons.innerHTML = '';
  const hasSegs = Array.isArray(data.segments) && data.segments.length > 0;
  const hasStruct = !!data.structure;
  for (const f of EXPORT_FORMATS) {
    // SRT/VTT فقط عند وجود مقاطع؛ JSON/XML فقط عند وجود بنية
    if ((f.fmt === 'srt' || f.fmt === 'vtt') && !hasSegs) continue;
    if ((f.fmt === 'json' || f.fmt === 'xml') && !hasStruct) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-action';
    b.textContent = f.label;
    b.setAttribute('aria-label', 'تنزيل النتيجة بصيغة ' + f.label);
    b.addEventListener('click', () => exportResult(f.fmt));
    buttons.appendChild(b);
  }
  exportRow.hidden = buttons.childElementCount === 0;
}

/* ---------- تصدير النتيجة (POST /api/export → تنزيل ملف) ---------- */
async function exportResult(fmt) {
  const r = state.resultForExport;
  if (!r || !r.translated) return;
  const body = { format: fmt };
  if (r.segments && (fmt === 'srt' || fmt === 'vtt')) body.segments = r.segments;
  else if (r.structure && (fmt === 'json' || fmt === 'xml')) body.structure = r.structure;
  else body.text = r.translated;
  // اسم الملف: اسم المصدر (بدون الامتداد) + الصيغة الجديدة
  let base = 'translated';
  if (state.file && state.file.name) {
    base = state.file.name.replace(/\.[^.]+$/, '') || 'translated';
  }
  body.filename = base + '.' + fmt;
  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) {
      showToast('تعذر تصدير الملف — حاول مجددًا');
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = body.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast('تم تنزيل الملف ✓');
  } catch (e) {
    showToast('تعذر تصدير الملف — تحقق من اتصال الخادم');
  }
}

/* ---------- أدوات الوقت وSRT ---------- */
function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}

function formatSrtTime(seconds) {
  const s = Math.max(0, seconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 1000);
  const pad = (n, w) => String(n).padStart(w, '0');
  return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(sec, 2) + ',' + pad(ms, 3);
}

function buildSrt(captions) {
  return captions.map((c, i) => {
    const start = formatSrtTime(c.start);
    const end = formatSrtTime(c.start + (c.duration || 2));
    return (i + 1) + '\n' + start + ' --> ' + end + '\n' + (c.translated || c.original) + '\n';
  }).join('\n');
}

function downloadSrt() {
  const data = state.current;
  if (!data || data.type !== 'youtube' || !Array.isArray(data.captions)) return;
  const srt = buildSrt(data.captions);
  const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'translation.srt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- الاستماع إلى النص المترجم (TTS) ---------- */
async function listenToResult() {
  const data = state.current;
  if (!data || listenBtn.disabled) return;

  // بناء النص حسب نوع النتيجة (يُقرأ دائمًا النص المترجم)
  let text = '';
  if (data.type === 'youtube') {
    text = (data.captions || []).map((c) => c.translated || c.original || '').join(' ');
  } else if (data.type === 'article') {
    text = (data.translatedBlocks || []).map((b) => (b && b.content) || '').join(' ');
  } else {
    text = data.translated || '';
  }
  text = text.trim();
  if (!text) return;

  // حارس ضد الضغط المزدوج
  listenBtn.disabled = true;
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang: targetLang.value }),
      signal: AbortSignal.timeout(60000)
    });

    if (!res.ok) {
      let code = 'tts-failed';
      try {
        const err = await res.json();
        if (err && err.error) code = err.error;
      } catch (e) { /* تجاهل */ }
      showError(code, res.status);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    ttsPlayer.src = url;
    ttsPlayer.onended = () => URL.revokeObjectURL(url);
    ttsPlayer.onerror = () => URL.revokeObjectURL(url);
    ttsPlayer.play().catch(() => { /* أخطاء التشغيل لا تُظهر رسالة — الصوت جاهز */ });
  } catch (e) {
    showError('tts-failed', 502);
  } finally {
    listenBtn.disabled = false;
  }
}

/* ---------- مشغل يوتيوب + شريط الترجمة المتزامن ---------- */
let ytPlayer = null;          // كائن YT.Player الحالي
let capSyncTimer = null;      // مؤقت مزامنة الشريط
let localVideoUrl = null;     // رابط blob للفيديو المحلي

// تحميل YouTube IFrame API مرة واحدة (مع انتظار أقصاه 8 ثوانٍ)
function loadYouTubeApi() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve(true);
    if (window.__ytApiLoading) {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (window.YT && window.YT.Player) { clearInterval(iv); resolve(true); }
        else if (Date.now() - t0 > 8000) { clearInterval(iv); resolve(false); }
      }, 100);
      return;
    }
    window.__ytApiLoading = true;
    window.onYouTubeIframeAPIReady = () => resolve(true);
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    setTimeout(() => resolve(false), 8000);
  });
}

// إعداد المشغل المضمّن (خيار أ) — إن فشل الـAPI: iframe عادي بلا شريط متزامن
async function setupYtPlayer(videoId) {
  const wrap = document.getElementById('player-embed');
  wrap.innerHTML = '';
  localPlayer.hidden = true;
  capBar.hidden = true;
  capBar.textContent = '';
  stopCaptionSync();

  const ok = await loadYouTubeApi();
  if (!ok || !window.YT || !window.YT.Player) {
    const frame = document.createElement('iframe');
    frame.src = 'https://www.youtube.com/embed/' + encodeURIComponent(videoId) + '?rel=0&playsinline=1';
    frame.title = 'مشغل فيديو يوتيوب';
    frame.loading = 'lazy';
    frame.allowFullscreen = true;
    frame.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    wrap.appendChild(frame);
    return;
  }

  try {
    ytPlayer = new YT.Player(wrap, {
      videoId: String(videoId),
      playerVars: { rel: 0, playsinline: 1 },
      events: {
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) startCaptionSync();
          else if (e.data !== YT.PlayerState.BUFFERING) stopCaptionSync();
        }
      }
    });
  } catch (e) {
    /* تجاهل — يبقى حاوية فارغة */
  }
}

// مزامنة شريط الترجمة المترجمة مع لحظة التشغيل
function startCaptionSync() {
  if (capSyncTimer) return;
  const data = state.current;
  const caps = (data && data.captions) || [];
  if (!caps.length) return;
  capBar.hidden = false;
  capSyncTimer = setInterval(() => {
    if (!ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;
    let t = 0;
    try { t = ytPlayer.getCurrentTime() || 0; } catch (e) { return; }
    let shown = false;
    for (let i = 0; i < caps.length; i++) {
      const c = caps[i];
      if (t >= (c.start || 0) && t < (c.start || 0) + (c.duration || 2)) {
        const txt = c.translated || c.original || '';
        if (capBar.textContent !== txt) capBar.textContent = txt;
        highlightCaptionPanel(i);
        shown = true;
        break;
      }
    }
    if (!shown) {
      if (capBar.textContent) capBar.textContent = '';
      highlightCaptionPanel(-1);
    }
  }, 250);
}

function stopCaptionSync() {
  if (capSyncTimer) { clearInterval(capSyncTimer); capSyncTimer = null; }
}

/* ---------- لوحة الترجمة المتزامنة: قائمة كاملة مع تمييز السطر الحالي ---------- */
let capPanelItems = [];
function buildCaptionPanel() {
  const data = state.current;
  const caps = (data && data.captions) || [];
  capPanelList.innerHTML = '';
  capPanelItems = [];
  if (!caps.length) { capPanel.hidden = true; return; }
  caps.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'cap-item';
    const t = document.createElement('span');
    t.className = 'cap-time';
    t.dir = 'ltr';
    t.textContent = formatTime(c.start || 0);
    const s = document.createElement('span');
    s.className = 'cap-text';
    s.textContent = c.translated || c.original || '';
    row.appendChild(t);
    row.appendChild(s);
    capPanelList.appendChild(row);
    capPanelItems.push(row);
  });
  capPanel.hidden = false;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function highlightCaptionPanel(idx) {
  capPanelItems.forEach((el, i) => el.classList.toggle('active', i === idx));
  if (idx >= 0 && capPanelItems[idx]) {
    const el = capPanelItems[idx];
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}

/* ---------- التشغيل بترجمات مدمجة (خيار ب: فيديو محلي + WebVTT) ---------- */
async function playLocalVideo() {
  const data = state.current;
  if (!data || data.type !== 'youtube' || localBtn.disabled) return;

  localBtn.disabled = true;
  const oldLabel = localBtn.textContent;
  localBtn.textContent = '⏳ جاري تنزيل الفيديو…';
  try {
    const res = await fetch('/api/video/' + encodeURIComponent(data.videoId), {
      signal: AbortSignal.timeout(300000)
    });
    if (!res.ok) {
      let code = 'video-download-failed';
      try { const err = await res.json(); if (err && err.error) code = err.error; } catch (e) { /* تجاهل */ }
      showError(code, res.status);
      return;
    }

    const blob = await res.blob();
    if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    localVideoUrl = URL.createObjectURL(blob);

    // بناء مسار WebVTT من الترجمة المترجمة (blob)
    const vttBlob = new Blob([buildWebVtt(data.captions)], { type: 'text/vtt;charset=utf-8' });
    const vttUrl = URL.createObjectURL(vttBlob);
    const oldTrack = localPlayer.querySelector('track');
    if (oldTrack) oldTrack.remove();
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.src = vttUrl;
    track.srclang = 'ar';
    track.label = 'العربية';
    track.default = true;
    localPlayer.appendChild(track);

    localPlayer.src = localVideoUrl;
    localPlayer.hidden = false;
    stopCaptionSync();
    capBar.hidden = true;
    localPlayer.play().catch(() => { /* المستخدم قد يشغّل يدويًا */ });
  } catch (e) {
    showError('video-download-failed', 422);
  } finally {
    localBtn.disabled = false;
    localBtn.textContent = oldLabel;
  }
}

/* ---------- عرض المقارنة جنبًا إلى جنب (مقالات فقط) ---------- */
function renderCompareView(data) {
  resultBody.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'compare-wrap';

  const colA = document.createElement('div');
  colA.className = 'compare-col';
  const colB = document.createElement('div');
  colB.className = 'compare-col';

  const hA = document.createElement('h3');
  hA.className = 'compare-head';
  hA.textContent = 'النص الأصلي';
  const hB = document.createElement('h3');
  hB.className = 'compare-head';
  hB.textContent = 'الترجمة';
  colA.appendChild(hA);
  colB.appendChild(hB);

  const originals = data.originalBlocks || [];
  const translated = data.translatedBlocks || [];
  const max = Math.max(originals.length, translated.length);
  for (let i = 0; i < max; i++) {
    const ob = originals[i];
    const tb = translated[i];
    if (ob) {
      const el = document.createElement('p');
      el.className = 'blk' + (ob.type === 'heading' ? ' blk-heading' : '');
      el.textContent = ob.content;
      colA.appendChild(el);
    }
    if (tb) {
      const el = document.createElement('p');
      el.className = 'blk' + (tb.type === 'heading' ? ' blk-heading' : '');
      el.textContent = tb.content;
      colB.appendChild(el);
    }
  }
  wrap.appendChild(colA);
  wrap.appendChild(colB);
  resultBody.appendChild(wrap);
}

/* ---------- ترجمة دفعات (روابط متعددة) ---------- */
async function runBatch() {
  if (state.batchRunning) return;
  const lines = batchInput.value.split(/\n+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s));
  if (!lines.length) {
    showToast('أدخل رابطًا واحدًا صالحًا على الأقل');
    return;
  }
  state.batchRunning = true;
  batchBtn.disabled = true;
  batchResults.innerHTML = '';
  const target = targetLang.value;
  const glossary = getGlossary();
  const provider = safeGet('preferredProvider') || undefined;

  for (let i = 0; i < lines.length; i++) {
    batchStatus.textContent = 'جاري الترجمة (' + (i + 1) + '/' + lines.length + '): ' + lines[i];
    const card = document.createElement('div');
    card.className = 'batch-item';
    const linkEl = document.createElement('div');
    linkEl.className = 'batch-link';
    linkEl.dir = 'ltr';
    linkEl.textContent = lines[i];
    card.appendChild(linkEl);
    const bodyEl = document.createElement('div');
    bodyEl.className = 'batch-body';
    bodyEl.textContent = 'قيد الترجمة…';
    card.appendChild(bodyEl);
    batchResults.appendChild(card);
    batchResults.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      const { status, data } = await postJson('/api/translate', { url: lines[i], targetLang: target, glossary, provider });
      if (data && data.error) {
        bodyEl.textContent = '❌ ' + mapError(data.error, status);
        bodyEl.classList.add('batch-err');
      } else if (data && data.type === 'youtube') {
        const caps = data.captions || [];
        bodyEl.textContent = '✅ ' + caps.length + ' سطرًا مترجمًا';
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'btn-secondary';
        open.textContent = 'فتح النتيجة';
        open.addEventListener('click', () => {
          state.current = data;
          state.activeTab = 'translated';
          teardownPlayers();
          saveToHistory(data, target);
          renderResult(data);
        });
        bodyEl.appendChild(open);
      } else if (data && data.translatedBlocks) {
        bodyEl.textContent = '✅ ' + data.translatedBlocks.length + ' كتلة مترجمة';
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'btn-secondary';
        open.textContent = 'فتح النتيجة';
        open.addEventListener('click', () => {
          state.current = data;
          state.activeTab = 'translated';
          teardownPlayers();
          saveToHistory(data, target);
          renderResult(data);
        });
        bodyEl.appendChild(open);
      } else {
        bodyEl.textContent = '❌ استجابة غير متوقعة';
        bodyEl.classList.add('batch-err');
      }
    } catch (e) {
      bodyEl.textContent = '❌ ' + mapError('server-error', 500);
      bodyEl.classList.add('batch-err');
    }
    // فاصل قصير بين الروابط لتفادي حجب الحصص
    await new Promise((r) => setTimeout(r, 600));
  }

  batchStatus.textContent = 'اكتملت ترجمة ' + lines.length + ' رابطًا ✓';
  state.batchRunning = false;
  batchBtn.disabled = false;
}

/* ---------- نطق الكلمة عند النقر المزدوج ---------- */
let wordAudioUrl = null;
async function pronounceWord(word) {
  if (!word) return;
  try {
    // /api/tts يُعيد blob صوتي (وليس JSON) — نطلب الصوت مباشرة مثل listenToResult
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: word, lang: targetLang.value }),
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) {
      showToast('تعذر نطق الكلمة');
      return;
    }
    const blob = await res.blob();
    if (!blob || !blob.size) {
      showToast('تعذر نطق الكلمة');
      return;
    }
    if (wordAudioUrl) URL.revokeObjectURL(wordAudioUrl);
    wordAudioUrl = URL.createObjectURL(blob);
    ttsPlayer.src = wordAudioUrl;
    ttsPlayer.play().catch(() => { /* المتصفح قد يمنع — تجاهل */ });
  } catch (e) {
    showToast('تعذر نطق الكلمة');
  }
}

function handleResultDblClick(e) {
  if (!state.current || state.activeTab !== 'translated') return;
  const sel = window.getSelection && window.getSelection().toString();
  if (sel && sel.trim().length <= 180) {
    pronounceWord(sel.trim());
    return;
  }
  // نقر مزدوج على كلمة واحدة
  if (e.target && e.target.closest && e.target.closest('.result-body, .blk, .compare-col')) {
    const text = e.target.textContent || '';
    const word = (text.split(/[\s\n،.،!؟]+/).filter(Boolean).pop() || '').replace(/[^\p{L}\p{N}'_-]/gu, '');
    if (word && word.length <= 180) pronounceWord(word);
  }
}

/* ---------- التفاعلات ---------- */
translateBtn.addEventListener('click', runTranslate);
retryBtn.addEventListener('click', runTranslate);

// الترجمة الذكية (Gemini: تلخيص/إعادة صياغة) — لنص سريع
async function runSmartTranslate() {
  const text = textInput.value.trim();
  if (!text) {
    showToast('اكتب أو الصق النص أولاً');
    textInput.focus();
    return;
  }
  if (state.running) return;
  state.running = true;
  smartBtn.disabled = true;
  try {
    hideError();
    result.hidden = true;
    showProgress('🧠 جاري الترجمة الذكية (قد تستغرق دقيقة)…');
    const { status, data } = await postJson('/api/translate-smart', { text, targetLang: targetLang.value });
    hideProgress();
    if (status === 503 && data && data.error === 'smart-unavailable') {
      state.running = false;
      smartBtn.disabled = false;
      showError('smart-unavailable', 503);
      return;
    }
    if (!data || data.error) {
      state.running = false;
      smartBtn.disabled = false;
      showError((data && data.error) || 'server-error', status);
      return;
    }
    state.current = { type: 'text', sourceLang: data.sourceLang || 'auto', translated: data.translated, original: text, meta: { title: 'ترجمة ذكية' } };
    state.activeTab = 'translated';
    result.hidden = false;
    cacheBadge.hidden = true;
    sourceNotice.hidden = true;
    renderTab('translated');
    smartBtn.disabled = false;
    state.running = false;
  } catch (e) {
    hideProgress();
    state.running = false;
    smartBtn.disabled = false;
    showError('server-error', 500);
  }
}
smartBtn.addEventListener('click', runSmartTranslate);

// زر المقارنة جنبًا إلى جنب
compareBtn.addEventListener('click', () => {
  state.compare = !state.compare;
  compareBtn.classList.toggle('active', state.compare);
  if (state.compare) {
    tabs.forEach((t) => t.classList.remove('active'));
  } else {
    renderTab('translated');
  }
  renderTab(state.compare ? state.compare : state.activeTab);
});

// ترجمة الدفعات
batchBtn.addEventListener('click', runBatch);

// نطق الكلمة عند النقر المزدوج
resultBody.addEventListener('dblclick', handleResultDblClick);

// المسرد: إضافة زوج جديد
function addGlossaryPair() {
  const from = glossaryFrom.value.trim();
  const to = glossaryTo.value.trim();
  if (!from || !to) {
    showToast('أدخل الكلمتين معًا');
    return;
  }
  const list = loadGlossary();
  list.push({ from, to });
  saveGlossary(list);
  glossaryFrom.value = '';
  glossaryTo.value = '';
  renderGlossaryList();
  showToast('أُضيف إلى المسرد ✓');
}
glossaryAddBtn.addEventListener('click', addGlossaryPair);
glossaryFrom.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); glossaryTo.focus(); } });
glossaryTo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addGlossaryPair(); } });

/* ---------- قواعد الاستخراج (المواقع الصعبة) ---------- */
async function loadRules() {
  try {
    const res = await fetch('/api/settings/rules', { signal: AbortSignal.timeout(10000) });
    const data = await res.json().catch(() => null);
    return (data && Array.isArray(data.rules)) ? data.rules : [];
  } catch (e) {
    return [];
  }
}

function renderRules(rules) {
  ruleListEl.innerHTML = '';
  if (!rules.length) {
    ruleListEl.innerHTML = '<p class="field-hint">لا توجد قواعد بعد — أضف نطاقًا مثل news.google.com مع المحدد article</p>';
    return;
  }
  rules.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'glossary-item';
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
      try {
        await fetch('/api/settings/rules/' + encodeURIComponent(r.domain), { method: 'DELETE' });
      } catch (e) { /* تجاهل */ }
      const rules2 = await loadRules();
      renderRules(rules2);
      showToast('حُذفت القاعدة');
    });
    row.appendChild(dom);
    row.appendChild(sel);
    row.appendChild(del);
    ruleListEl.appendChild(row);
  });
}

async function addRule() {
  const domain = ruleDomain.value.trim();
  const selector = ruleSelector.value.trim();
  if (!domain || !selector) {
    showToast('أدخل النطاق والمحدد معًا');
    return;
  }
  const contentSelectors = selector.split(',').map((s) => s.trim()).filter(Boolean);
  try {
    const res = await fetch('/api/settings/rules', {
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
    ruleDomain.value = '';
    ruleSelector.value = '';
    renderRules((data && data.rules) || await loadRules());
    showToast('أُضيفت القاعدة ✓');
  } catch (e) {
    showToast('تعذر حفظ القاعدة');
  }
}
ruleAddBtn.addEventListener('click', addRule);
ruleDomain.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ruleSelector.focus(); } });
ruleSelector.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addRule(); } });

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runTranslate();
});

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runTranslate();
});

modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.mode === state.mode) return;
    state.mode = btn.dataset.mode;
    modeBtns.forEach((b) => {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    urlModeEl.hidden = state.mode !== 'url';
    textModeEl.hidden = state.mode !== 'text';
    fileModeEl.hidden = state.mode !== 'file';
    smartBtn.hidden = state.mode !== 'text'; // الترجمة الذكية لنص سريع فقط
    // إخفاء النتائج والأخطاء عند تغيير الوضع
    result.hidden = true;
    hideError();
    state.current = null;
    srtBtn.hidden = true;
    listenBtn.hidden = true;
    localBtn.hidden = true;
    copyBtn.hidden = true;
    shareBtn.hidden = true;
    compareBtn.hidden = true;
    shareView.hidden = true;
    sourceNotice.hidden = true;
    cacheBadge.hidden = true;
    exportRow.hidden = true;
    state.resultForExport = null;
    stopCaptionSync();
    capBar.hidden = true;
    capBar.textContent = '';
    if (localPlayer.src) { localPlayer.pause(); localPlayer.removeAttribute('src'); localPlayer.load(); }
    localPlayer.hidden = true;
  });
});

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === state.activeTab) return;
    tabs.forEach((t) => {
      const active = t === tab;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
    });
    renderTab(tab.dataset.tab);
  });
});

srtBtn.addEventListener('click', downloadSrt);
listenBtn.addEventListener('click', listenToResult);
localBtn.addEventListener('click', playLocalVideo);
copyBtn.addEventListener('click', copyResult);
shareBtn.addEventListener('click', shareResult);
shareCloseBtn.addEventListener('click', () => { shareView.hidden = true; });
clearHistoryBtn.addEventListener('click', clearHistory);
langSearch.addEventListener('input', filterLanguages);
targetLang.addEventListener('change', () => safeSet('aralink-lang', targetLang.value));

// الوضع الفاتح/الداكن
applyTheme(currentTheme(), false); // مزامنة أيقونة الزر مع السمة المطبقة مسبقًا في <head>
themeToggle.addEventListener('click', toggleTheme);

// نافذة الإعدادات
settingsBtn.addEventListener('click', openSettings);
settingsCancelBtn.addEventListener('click', closeSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
settingsForm.addEventListener('submit', saveSettings);
// إغلاق بالنقر على الخلفية أو بزر Escape
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettings();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !settingsModal.hidden) closeSettings();
});

// تحميل قائمة اللغات الكاملة عند فتح الصفحة
loadLanguages();

// تهيئة وضع الملف (سحب/إفلات + اختيار ملف)
setupFileMode();
setupTashkeelButton();

// عرض سجل الترجمات + معالجة رابط المشاركة (#share=…) عند فتح الصفحة
renderHistory();
handleShareHash();

// ===== فتح عبر رابط خارجي: ?url=… (إضافة المتصفح) أو ?mode=text (اختصار PWA) =====
(function bootstrapFromQuery() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('mode') === 'text') {
      // بدّل إلى وضع النص
      const btn = document.querySelector('.mode-btn[data-mode="text"]');
      if (btn) btn.click();
    }
    const targetUrl = params.get('url');
    if (targetUrl && /^https?:\/\//i.test(targetUrl)) {
      urlInput.value = targetUrl;
      // انتظر اكتمال قائمة اللغات إن لم تكن جاهزة بعد (يُختار الهدف الصحيح)
      const start = () => runTranslate();
      if (targetLang.options.length <= 1) {
        loadLanguages().then(start).catch(start);
      } else {
        start();
      }
    }
  } catch (e) { /* تجاهل */ }
})();

// ===== تسجيل Service Worker (PWA — تثبيت + استخدام أوفلاين) =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* أوفلاين/خاص — لا يكسر شيئًا */ });
  });
}
