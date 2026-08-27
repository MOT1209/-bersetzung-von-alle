/* ---------- دوال مساعدة ---------- */
import { MESSAGES, LANGUAGES } from './constants.js';

export function safeGet(k)         { try { return localStorage.getItem(k); } catch { return null; } }
export function safeSet(k, v)      { try { localStorage.setItem(k, v); } catch {} }
export function mapError(c, s) {
  if (s === 503 && c === 'smart-unavailable') return MESSAGES['smart-unavailable'];
  if (s === 413) return MESSAGES['file-too-large'];
  return MESSAGES[c] || MESSAGES['server-error'];
}

export async function postJson(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000),
  });
  let d = null;
  try { d = await r.json(); } catch {}
  return { status: r.status, data: d };
}

export function langName(code) {
  if (!code) return '';
  if (LANGUAGES[code]) return LANGUAGES[code];
  const short = code.split('-')[0];
  return LANGUAGES[short] || code;
}

export function detectArabic(text) {
  return /[\u0600-\u06FF\u0750-\u077F]/.test(String(text).slice(0, 500));
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
