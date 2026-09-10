/* ---------- دوال مساعدة ---------- */
import { MESSAGES, LANGUAGES } from './constants.js';
import { isRtlText } from './localEngine.mjs';

export function safeGet(k)         { try { return localStorage.getItem(k); } catch { return null; } }
export function safeSet(k, v)      { try { localStorage.setItem(k, v); } catch {} }
export function mapError(c, s) {
  if (s === 503 && c === 'smart-unavailable') return MESSAGES['smart-unavailable'];
  if (s === 413) return MESSAGES['file-too-large'];
  if (MESSAGES[c]) return MESSAGES[c];
  // 404 بلا رمز خطأ = المسار غير موجود أصلًا، و0 = تعذّر الوصول للشبكة. كلاهما
  // يعني «لا خادم» لا «خطأ في الخادم» — الرسالة العامة كانت تُخفي السبب.
  if (s === 404 || s === 0) return MESSAGES['backend-unreachable'];
  return MESSAGES['server-error'];
}

export async function postJson(url, body, headers) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000),
  });
  let d = null;
  try { d = await r.json(); } catch {}
  return { status: r.status, data: d };
}

/* --- اسم اللغة بالعربي — المصدر الوحيد للحقيقة (يُغطّي أكواد الإقليم) --- */
export function langName(code) {
  if (!code) return '';
  if (LANGUAGES[code]) return LANGUAGES[code];
  const short = code.split('-')[0];
  return LANGUAGES[short] || code;
}

/* --- تسمية نوع المحتوى مع إيموجي (مُوحّدة ل improves UX) --- */
export function getContentTypeLabel(type) {
  const labels = { technical: '📝 تقني', code: '💻 كود', medical: '🏥 طبي', legal: '⚖️ قانوني', news: '📰 إخباري', academic: '🎓 أكاديمي', general: '📄 عام' };
  return labels[type] || '📄 عام';
}

export function detectArabic(text) {
  return /[\u0600-\u06FF\u0750-\u077F]/.test(String(text).slice(0, 500));
}

/* --- عرض الفقرات في result-body --- */
export function renderParagraphs(text) {
  const body = document.getElementById('result-body');
  if (!body) return;
  body.innerHTML = '';
  String(text || '').split(/\n{2,}/).forEach((p) => {
    const el = document.createElement('p');
    el.className = 'blk';
    el.dir = isRtlText(p) ? 'rtl' : 'ltr';
    el.textContent = p;
    body.appendChild(el);
  });
}

export function buildTranslationState(defaults) {
  return {
    current:      null,
    activeTab:    'translated',
    theme:        safeGet('aralink-theme') || 'dark',
    mode:         'url',
    compare:      false,
    file:         null,
    running:      false,
    batchRunning: false,
    abortCtrl:    null,
    resultForExport: null,
    cache:        defaults && defaults.cache || null,
    ...defaults,
  };
}

// حالة تطبيق مفردة تتقاسمها كل الوحدات (app/translate/result/media/features)
export const state = buildTranslationState({});
