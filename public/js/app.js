/* ---------- AraLink — نقطة الدخول الرئيسية ---------- */
import { state } from './utils.js';
import {
  $, populateLangSelector, filterLanguages, applyTheme, currentTheme, toggleTheme,
  translateBtn, retryBtn, targetLang, langSearch, urlInput, textInput,
  tabs, srtBtn, listenBtn, compareBtn, localBtn, dubBtn, copyBtn, shareBtn,
  shareCloseBtn, batchBtn, resultBody, modeBtns, smartBtn, themeToggle,
  result, clearHistoryBtn, isTtsLang, hideError,
} from './ui.js';
import { runTranslate, runSmartTranslate, runBatch } from './translate.js';
import {
  renderResult, renderTab, renderCompare,
  handleOcrResult, copyResult, shareResult,
} from './result.js';
import {
  downloadSrt, listenToResult, playLocalVideo,
  handleResultDblClick, teardownPlayers, stopCaptionSync,
} from './media.js';
import { toggleDubbing, stopDubbing } from './dub.js';
import {
  saveToHistory, renderHistory, clearHistory, handleShareHash,
  initGlossary, initRules, initSettings, setupTashkeelButton,
  setupFileMode, getGlossary,
} from './features.js';

/* ===== فحص توفّر الخادم =====
   يُفتح التطبيق أحيانًا كملفات ثابتة (Live Server، أو نقرًا على index.html)،
   فيفشل كل /api/* بينما تبدو الواجهة سليمة: قائمة اللغات تسقط إلى قائمة مضمّنة،
   وكل الأخطاء تنهار إلى «خطأ غير متوقع». الفحص يجعل السبب ظاهرًا فورًا. */
let backendOk = true;

async function checkBackend() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const data = await res.json();
    backendOk = !!(data && data.ok);
  } catch {
    backendOk = false;
  }
  const banner = $('offline-banner');
  if (banner) banner.hidden = backendOk;
  return backendOk;
}

/* ===== تحميل اللغات ===== */
async function loadLanguages() {
  try {
    const res  = await fetch('/api/languages');
    const data = await res.json();
    if (data && data.languages) return populateLangSelector(data.languages);
    throw new Error('no-languages');
  } catch {
    // قائمة مصغّرة حتى تبقى الواجهة قابلة للتصفّح — لكن الشريط أعلاه يوضّح
    // أن الخادم غائب، فلا تُخفي هذه الحيلةُ العطلَ كما كانت تفعل سابقًا.
    populateLangSelector({
      ar:'العربية', en:'English', fr:'Français', es:'Español',
      de:'Deutsch', tr:'Türkçe', ur:'اردو',
    });
  }
}

/* ===== تهيئة الثيم ===== */
applyTheme(currentTheme(), false);

/* ===== تهيئة الميزات ===== */
initGlossary();
initRules();
initSettings();
setupTashkeelButton();
setupFileMode();

/* ===== أحداث الترجمة ===== */
translateBtn.addEventListener('click', runTranslate);
retryBtn.addEventListener('click', runTranslate);
smartBtn.addEventListener('click', runSmartTranslate);

/* ===== أحداث الوضع ===== */
modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.mode === state.mode) return;
    state.mode = btn.dataset.mode;
    modeBtns.forEach((b) => {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    $('url-mode').hidden  = state.mode !== 'url';
    $('text-mode').hidden = state.mode !== 'text';
    $('file-mode').hidden = state.mode !== 'file';
    smartBtn.hidden = state.mode !== 'text';
    result.hidden = true;
    hideError();
    state.current = null;
    srtBtn.hidden     = true;
    listenBtn.hidden  = true;
    localBtn.hidden   = true;
    copyBtn.hidden    = true;
    shareBtn.hidden   = true;
    compareBtn.hidden = true;
    $('share-view').hidden    = true;
    $('source-notice').hidden = true;
    $('cache-badge').hidden   = true;
    $('export-row').hidden    = true;
    state.resultForExport = null;
    stopCaptionSync();
    $('cap-bar').hidden = true;
    $('cap-bar').textContent = '';
    if ($('local-player').src) { $('local-player').pause(); $('local-player').removeAttribute('src'); $('local-player').load(); }
    $('local-player').hidden = true;
  });
});

/* ===== أحداث التبويبات ===== */
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

/* ===== أحداث الأزرار ===== */
srtBtn.addEventListener('click', downloadSrt);
listenBtn.addEventListener('click', listenToResult);
localBtn.addEventListener('click', playLocalVideo);
if (dubBtn) dubBtn.addEventListener('click', toggleDubbing);
copyBtn.addEventListener('click', copyResult);
shareBtn.addEventListener('click', shareResult);
shareCloseBtn.addEventListener('click', () => { $('share-view').hidden = true; });
batchBtn.addEventListener('click', runBatch);
resultBody.addEventListener('dblclick', handleResultDblClick);
clearHistoryBtn.addEventListener('click', clearHistory);

/* ===== لغة الهدف ===== */
langSearch.addEventListener('input', filterLanguages);
targetLang.addEventListener('change', () => {
  try { localStorage.setItem('aralink-lang', targetLang.value); } catch {}
  // النتيجة المعروضة تخصّ اللغة السابقة، لكن الدبلجة تُولَّد باللغة الحالية —
  // فالزر يتبع اللغة المختارة الآن، ويختفي إن كان محرّك النطق لا يعرفها.
  if (dubBtn && !dubBtn.hidden && !isTtsLang(targetLang.value)) {
    stopDubbing();
    dubBtn.hidden = true;
  }
});

/* ===== الثيم ===== */
themeToggle.addEventListener('click', toggleTheme);

/* ===== إدخال الرابط / النص ===== */
urlInput.addEventListener('keydown',  (e) => { if (e.key === 'Enter') runTranslate(); });
textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runTranslate(); });

/* ===== المقارنة ===== */
compareBtn.addEventListener('click', () => {
  state.compare = !state.compare;
  compareBtn.classList.toggle('active', state.compare);
  if (state.compare) tabs.forEach((t) => t.classList.remove('active'));
  else renderTab('translated');
  renderTab(state.compare ? state.compare : state.activeTab);
});

/* ===== تحميلLangs + سجل + مشاركة ===== */
checkBackend();
loadLanguages();
renderHistory();
handleShareHash();

/* ===== فتح عبر الرابط外部 ===== */
(function bootstrapFromQuery() {
  try {
    const params    = new URLSearchParams(location.search);
    const targetUrl = params.get('url');
    if (params.get('mode') === 'text') {
      const btn = document.querySelector('.mode-btn[data-mode="text"]');
      if (btn) btn.click();
    }
    if (targetUrl && /^https?:\/\//i.test(targetUrl)) {
      urlInput.value = targetUrl;
      const start = () => runTranslate();
      if (targetLang.options.length <= 1) loadLanguages().then(start).catch(start);
      else start();
    }
  } catch {}
})();

/* ===== تسجيل Service Worker =====
   مشروط بنجاح فحص الخادم: تسجيله على أصل بلا خادم (Live Server مثلًا) يخزّن
   نسخة مكسورة تظلّ تُقدَّم بعد تشغيل الخادم الحقيقي — وهو سبب «لم يتغير شيء». */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    if (!(await checkBackend())) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
