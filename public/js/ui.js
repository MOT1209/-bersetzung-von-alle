/* ---------- عناصر DOM + واجهة المستخدم ---------- */
import { safeGet, safeSet } from './utils.js';
import { MESSAGES } from './constants.js';

/* ===== عناصر DOM ===== */
export const $ = (id) => document.getElementById(id);
export const urlInput        = $('url-input');
export const textInput        = $('text-input');
export const targetLang       = $('target-lang');
export const langSearch       = $('lang-search');
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
export const shareCloseBtn    = $('share-close-btn');
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
export const errorMessage     = $('error-message');
export const progress         = $('progress');
export const progressLabel    = $('progress-label');
export const themeToggle      = $('theme-toggle');
export const settingsBtn      = $('settings-btn');
export const settingsCancelBtn = $('settings-cancel-btn');
export const settingsCloseBtn = $('settings-close-btn');
export const settingsModal    = $('settings-modal');
export const settingsForm     = $('settings-form');
export const glossaryFrom     = $('glossary-from');
export const glossaryTo       = $('glossary-to');
export const glossaryAddBtn   = $('glossary-add-btn');
export const glossaryListEl   = $('glossary-list');
export const clearHistoryBtn  = $('clear-history-btn');
export const historyListEl    = $('history-list');
export const tashkeelBtn      = $('tashkeel-btn');
export const ruleDomain       = $('rule-domain');
export const ruleSelector     = $('rule-selector');
export const ruleAddBtn       = $('rule-add-btn');
export const ruleListEl       = $('rule-list');

/* ===== قائمة اللغات ===== */
export function populateLangSelector(languages) {
  // الخادم يرسل مصفوفة [{code,nameAr},...] أو خريطة {code:name} — نوحّدها لخريطة.
  const map = Array.isArray(languages)
    ? Object.fromEntries(languages.map((l) => [l.code, l.nameAr]))
    : (languages || {});
  targetLang.innerHTML = '';
  const sorted = Object.entries(map).sort((a, b) => a[1].localeCompare(b[1], 'ar'));
  for (const [code, name] of sorted) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = name;
    targetLang.appendChild(opt);
  }
  const saved = safeGet('aralink-lang');
  if (saved && map[saved]) targetLang.value = saved;
  else if (map['ar'])      targetLang.value = 'ar';
}

export function filterLanguages() {
  const q = (langSearch.value || '').trim().toLowerCase();
  let firstVisible = null;
  for (const opt of targetLang.options) {
    const match = !q || opt.textContent.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q);
    opt.hidden = !match;
    if (match && !firstVisible) firstVisible = opt;
  }
  if (q && firstVisible) targetLang.value = firstVisible.value;
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
  result.hidden = true;
  errorEl.hidden = true;
  progressLabel.textContent = text || '';
  progress.hidden = false;
}
export function hideProgress() { progress.hidden = true; }

export function showError(code, status) {
  progress.hidden = true;
  result.hidden = true;
  errorMessage.textContent = mapErrorLocal(code, status);
  errorEl.hidden = false;
  errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
