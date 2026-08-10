/* ===== أرا لينك — منطق الواجهة ===== */
'use strict';

/* ---------- مراجع العناصر ---------- */
const urlInput = document.getElementById('url-input');
const textInput = document.getElementById('text-input');
const targetLang = document.getElementById('target-lang');
const translateBtn = document.getElementById('translate-btn');
const retryBtn = document.getElementById('retry-btn');
const modeBtns = document.querySelectorAll('.mode-btn');
const urlModeEl = document.getElementById('url-mode');
const textModeEl = document.getElementById('text-mode');
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
const localPlayer = document.getElementById('local-player');
const errorEl = document.getElementById('error');
const errorMessage = document.getElementById('error-message');
const copyBtn = document.getElementById('copy-btn');
const shareBtn = document.getElementById('share-btn');
const shareView = document.getElementById('share-view');
const shareBody = document.getElementById('share-body');
const shareCloseBtn = document.getElementById('share-close-btn');
const historyEl = document.getElementById('history');
const historyListEl = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const toast = document.getElementById('toast');

/* ---------- الحالة (آلة الحالات: idle → fetching → translating → done | error) ---------- */
const state = {
  mode: 'url',            // 'url' | 'text'
  running: false,         // حارس ضد الضغط المزدوج
  current: null,          // آخر نتيجة معروضة
  activeTab: 'translated' // 'translated' | 'original'
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
  'server-error': 'حدث خطأ غير متوقع',
  'tts-failed': 'تعذر توليد الصوت — حاول مجددًا بعد قليل',
  'text-too-long': 'النص طويل جدًا للقراءة الصوتية',
  'video-download-failed': 'تعذر تنزيل الفيديو — جرّب العرض المضمّن بدلاً منه'
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
const HISTORY_MAX = 20;
const TYPE_NAMES = { text: 'نص', youtube: 'يوتيوب', article: 'مقال' };

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
  let payload;

  if (state.mode === 'url') {
    const url = urlInput.value.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      showError('invalid-url', 400);
      return;
    }
    payload = { url, targetLang: target };
  } else {
    const text = textInput.value.trim();
    if (!text) {
      showError('invalid-text', 400);
      return;
    }
    payload = { text, targetLang: target };
  }

  // تشغيل آلة الحالات
  state.running = true;
  translateBtn.disabled = true;

  if (state.mode === 'text') {
    showProgress('جاري الترجمة…');
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
    const endpoint = state.mode === 'url' ? '/api/translate' : '/api/translate-text';
    const { status, data } = await postJson(endpoint, payload);

    if (data && data.error) {
      showError(data.error, status);
      return;
    }
    if (!data || !data.type) {
      showError('server-error', 500);
      return;
    }

    // تنظيف أي عرض سابق
    teardownPlayers();
    state.current = data;
    state.activeTab = 'translated';

    // حفظ الترجمة الناجحة في السجل (آخر 20)
    saveToHistory(data, target);

    renderResult(data);
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
  metaLine.textContent = 'تمت الترجمة من ' + langName(data.sourceLang) + ' إلى ' + langName(targetLang.value);

  // مشغل يوتيوب + شريط الترجمة المتزامن
  if (data.type === 'youtube') {
    resultEmbed.hidden = false;
    setupYtPlayer(data.videoId);
  } else {
    resultEmbed.hidden = true;
    resultEmbed.innerHTML = '';
  }

  // أزرار SRT والتشغيل المدمج للفيديو فقط
  srtBtn.hidden = data.type !== 'youtube';
  localBtn.hidden = data.type !== 'youtube';

  // زر الاستماع متاح لجميع أنواع النتائج
  listenBtn.hidden = false;

  // النسخ والمشاركة متاحان لجميع أنواع النتائج
  copyBtn.hidden = false;
  shareBtn.hidden = false;

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
    for (const c of caps) {
      if (t >= (c.start || 0) && t < (c.start || 0) + (c.duration || 2)) {
        const txt = c.translated || c.original || '';
        if (capBar.textContent !== txt) capBar.textContent = txt;
        shown = true;
        break;
      }
    }
    if (!shown && capBar.textContent) capBar.textContent = '';
  }, 250);
}

function stopCaptionSync() {
  if (capSyncTimer) { clearInterval(capSyncTimer); capSyncTimer = null; }
}

/* ---------- التشغيل بترجمات مدمجة (خيار ب: فيديو محلي + WebVTT) ---------- */
function buildWebVtt(captions) {
  const lines = ['WEBVTT', ''];
  (captions || []).forEach((c, i) => {
    const start = formatSrtTime(c.start || 0);
    const end = formatSrtTime((c.start || 0) + (c.duration || 2));
    lines.push(String(i + 1), start + ' --> ' + end, (c.translated || c.original || ''), '');
  });
  return lines.join('\n');
}

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

/* ---------- التفاعلات ---------- */
translateBtn.addEventListener('click', runTranslate);
retryBtn.addEventListener('click', runTranslate);

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
    // إخفاء النتائج والأخطاء عند تغيير الوضع
    result.hidden = true;
    hideError();
    state.current = null;
    srtBtn.hidden = true;
    listenBtn.hidden = true;
    localBtn.hidden = true;
    copyBtn.hidden = true;
    shareBtn.hidden = true;
    shareView.hidden = true;
    sourceNotice.hidden = true;
    cacheBadge.hidden = true;
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

// تحميل قائمة اللغات الكاملة عند فتح الصفحة
loadLanguages();

// عرض سجل الترجمات + معالجة رابط المشاركة (#share=…) عند فتح الصفحة
renderHistory();
handleShareHash();
