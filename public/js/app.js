/* ---------- AraLink — نقطة الدخول الرئيسية ---------- */
import { state } from './utils.js';
import {
  $, populateLangSelector, filterLanguages, applyTheme, currentTheme, toggleTheme,
  translateBtn, retryBtn, targetLang, langSearch, urlInput, textInput,
  tabs, srtBtn, listenBtn, compareBtn, localBtn, copyBtn, shareBtn,
  shareCloseBtn, batchBtn, resultBody, modeBtns, smartBtn, themeToggle,
  result, clearHistoryBtn,
} from './ui.js';
import { runTranslate, runSmartTranslate, runBatch } from './translate.js';
import {
  renderResult, renderTab, renderCompareView,
  handleOcrResult, copyResult, shareResult,
} from './result.js';
import {
  downloadSrt, listenToResult, playLocalVideo,
  handleResultDblClick, teardownPlayers, stopCaptionSync,
} from './media.js';
import {
  saveToHistory, renderHistory, clearHistory, handleShareHash,
  initGlossary, initRules, initSettings, setupTashkeelButton,
  setupFileMode, getGlossary,
} from './features.js';

/* ===== تحميل اللغات ===== */
async function loadLanguages() {
  try {
    const res  = await fetch('/api/languages');
    const data = await res.json();
    if (data && data.languages) populateLangSelector(data.languages);
  } catch {
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
copyBtn.addEventListener('click', copyResult);
shareBtn.addEventListener('click', shareResult);
shareCloseBtn.addEventListener('click', () => { $('share-view').hidden = true; });
batchBtn.addEventListener('click', runBatch);
resultBody.addEventListener('dblclick', handleResultDblClick);
clearHistoryBtn.addEventListener('click', clearHistory);

/* ===== لغة الهدف ===== */
langSearch.addEventListener('input', filterLanguages);
targetLang.addEventListener('change', () => { try { localStorage.setItem('aralink-lang', targetLang.value); } catch {} });

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

/* ===== تسجيل Service Worker ===== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
