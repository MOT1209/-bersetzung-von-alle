/* ---------- عناصر DOM + واجهة المستخدم ---------- */
import { safeGet, safeSet } from './utils.js';
import { MESSAGES } from './constants.js';

/* ===== عناصر DOM ===== */
export const $ = (id) => document.getElementById(id);
export const urlInput        = $('url-input');
export const textInput        = $('text-input');
export const targetLang       = $('target-lang');
export const langSearch       = $('lang-search');
export const langList         = $('lang-list');
export const translateBtn     = $('translate-btn');
export const retryBtn         = $('retry-btn');
export const result           = $('result');
export const resultEmbed      = $('result-embed');
export const resultBody       = $('result-body');
export const metaTitle        = $('meta-title');
export const metaLine         = $('meta-line');
export const sourceNotice     = $('source-notice');
export const cacheBadge       = $('cache-badge');
export const copyBtn          = $('copy-btn');
export const shareBtn         = $('share-btn');
export const shareView        = $('share-view');
export const shareCloseBtn    = $('share-close');
export const shareLink        = $('share-link');
export const exportRow        = $('export-row');
export const ttsPlayer        = $('tts-player');
export const tabs             = document.querySelectorAll('.tab');
export const srtBtn           = $('srt-btn');
export const listenBtn        = $('listen-btn');
export const compareBtn       = $('compare-btn');
export const localBtn         = $('local-btn');
export const localPlayer      = $('local-player');
export const capBar           = $('cap-bar');
export const capPanel         = $('cap-panel');
export const capPanelList     = $('cap-panel-list');
export const batchInput       = $('batch-input');
export const batchBtn         = $('batch-btn');
export const batchStatus      = $('batch-status');
export const batchResults     = $('batch-results');
export const modeBtns         = document.querySelectorAll('.mode-btn');
export const urlModeEl        = $('url-mode');
export const textModeEl       = $('text-mode');
export const fileModeEl       = $('file-mode');
export const smartBtn         = $('smart-btn');
export const errorEl          = $('error');
export const errorMsg         = $('error-msg');
export const errorDetail      = $('error-detail');
export const retryWrap        = $('retry-wrap');
export const progressWrap     = $('progress-wrap');
export const progressBar      = $('progress-bar');
export const progressText     = $('progress-text');
export const themeToggle      = $('theme-toggle');
export const settingsBtn      = $('settings-btn');
export const settingsCancelBtn = $('settings-cancel-btn');
export const settingsCloseBtn = $('settings-close-btn');
export const settingsModal    = $('settings-modal');
export const settingsForm     = $('settings-form');
export const glossaryFrom     = $('glossary-from');
export const glossaryTo       = $('glossary-to');
export const glossaryAddBtn   = $('glossary-add');
export const glossaryListEl   = $('glossary-list');
export const clearHistoryBtn  = $('clear-history');
export const historyListEl    = $('history-list');
export const tashkeelBtn      = $('tashkeel-btn');
export const ruleDomain       = $('rule-domain');
export const ruleSelector     = $('rule-selector');
export const ruleAddBtn       = $('rule-add');
export const ruleListEl       = $('rule-list');

/* ===== قائمة اللغات ===== */
export function populateLangSelector(languages) {
  targetLang.innerHTML = '';
  const sorted = Object.entries(languages).sort((a, b) => a[1].localeCompare(b[1], 'ar'));
  for (const [code, name] of sorted) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = name;
    targetLang.appendChild(opt);
  }
  const saved = safeGet('aralink-lang');
  if (saved && languages[saved]) targetLang.value = saved;
  else if (languages['ar'])      targetLang.value = 'ar';
}

export function filterLanguages(languages) {
  const q = (langSearch.value || '').trim().toLowerCase();
  const items = langList.querySelectorAll('.lang-item');
  let anyVisible = false;
  items.forEach((el) => {
    const match = !q || el.dataset.name.toLowerCase().includes(q) || el.dataset.code.includes(q);
    el.hidden = !match;
    if (match) anyVisible = true;
  });
  if (langList.firstChild) langList.firstChild.remove?.();
  if (!anyVisible && q) {
    const d = document.createElement('div');
    d.className = 'lang-hint';
    d.textContent = 'لا توجد نتائج';
    langList.prepend(d);
  }
}

/* ===== الثيم ===== */
export function applyTheme(theme, save) {
  document.documentElement.setAttribute('data-theme', theme);
  if (save !== false) safeSet('aralink-theme', theme);
  const icon = themeToggle.querySelector('.icon');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

export function currentTheme() {
  return safeGet('aralink-theme') || 'dark';
}

export function toggleTheme() {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

/* ===== عرض/إخفاء ===== */
export function showProgress(text) {
  progressWrap.hidden = false;
  progressBar.style.width = '0%';
  progressText.textContent = text || '';
  requestAnimationFrame(() => { progressBar.style.width = '100%'; });
}
export function hideProgress() { progressWrap.hidden = true; }

export function showError(code, status) {
  const msg = mapErrorLocal(code, status);
  errorMsg.textContent = msg;
  errorDetail.textContent = (status ? 'الكود: ' + status : '') + (code ? ' [' + code + ']' : '');
  errorEl.hidden = false;
  retryWrap.hidden = false;
  result.hidden = true;
}
export function hideError() { errorEl.hidden = true; }

export function showToast(msg, ms) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms || 2800);
}

function mapErrorLocal(code, status) {
  if (status === 503 && code === 'smart-unavailable')
    return 'الترجمة الذكية غير متوفرة حاليًا — تحقق من إعدادات Gemini في ملف .env';
  if (status === 413) return 'حجم الملف يتجاوز الحد الأقصى (50 ميغابايت)';
  return MESSAGES[code] || 'خطأ غير متوقع — حاول لاحقًا';
}
