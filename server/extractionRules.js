// server/extractionRules.js — قواعد استخراج مخصصة للمواقع الصعبة
// بعض المواقع (مثل جوجل نيوز) لا تلتقطها أداة الاستخراج العامة — هذه القواعد تحدد
// محددات CSS يدوية لكل نطاق. تُخزن في cache/extraction-rules.json (خارج git).
const fs = require('fs/promises');
const path = require('path');

// مسار ملف القواعد — قابل للتجاوز عبر RULES_FILE (تستخدمه الاختبارات مع ملف مؤقت)
function getRulesFile() {
  return process.env.RULES_FILE || path.join(__dirname, '..', 'cache', 'extraction-rules.json');
}

const MAX_RULES = 20;

// ===== قراءة القواعد =====
async function getRules() {
  try {
    const raw = await fs.readFile(getRulesFile(), 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// ===== حفظ القواعد =====
async function saveRules(rules) {
  const file = getRulesFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(rules, null, 2), 'utf8');
}

// ===== البحث عن قاعدة لنطاق الرابط =====
async function getRuleForUrl(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  const rules = await getRules();
  // تطابق أطول نطاق أولاً (مثال: news.google.com قبل google.com)
  const sorted = rules.slice().sort((a, b) => (b.domain || '').length - (a.domain || '').length);
  const rule = sorted.find((r) => host === r.domain || host.endsWith('.' + r.domain));
  return rule || null;
}

// ===== التحقق من قاعدة جديدة =====
function validateRule(body) {
  if (!body || typeof body !== 'object') return null;
  const domain = String(body.domain || '').trim().toLowerCase();
  const titleSelector = String(body.titleSelector || 'h1').trim().slice(0, 100);
  let contentSelectors = Array.isArray(body.contentSelectors)
    ? body.contentSelectors.map((s) => String(s).trim()).filter(Boolean).slice(0, 5)
    : [];

  // نطاق صالح: أجزاء مفصولة بنقاط، بلا مخطط أو مسار أو رموز خطرة
  if (!domain || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) return null;
  if (domain.length > 253) return null;

  // محددات آمنة: بلا أقواس أو شرطات مائلة — نمنع حقن محددات خطرة
  const safeSelector = (s) => s && s.length <= 100 && !/[()[\]{},]/.test(s) && !s.startsWith('#') && !/^\s*$/.test(s);
  if (!safeSelector(titleSelector)) return null;
  if (!contentSelectors.length) contentSelectors = ['article', 'main'];
  if (!contentSelectors.every(safeSelector)) return null;

  return { domain, titleSelector, contentSelectors };
}

// ===== إضافة قاعدة =====
async function addRule(body) {
  const rule = validateRule(body);
  if (!rule) {
    const err = new Error('invalid-rule');
    err.code = 'invalid-rule';
    throw err;
  }
  const rules = await getRules();
  // تحديث القاعدة إن وُجدت لنفس النطاق
  const idx = rules.findIndex((r) => r.domain === rule.domain);
  if (idx >= 0) rules[idx] = rule;
  else {
    if (rules.length >= MAX_RULES) {
      const err = new Error('too-many-rules');
      err.code = 'too-many-rules';
      throw err;
    }
    rules.push(rule);
  }
  await saveRules(rules);
  return { ok: true, rules };
}

// ===== حذف قاعدة =====
async function removeRule(domain) {
  const d = String(domain || '').trim().toLowerCase();
  const rules = await getRules();
  const next = rules.filter((r) => r.domain !== d);
  await saveRules(next);
  return { ok: true };
}

module.exports = { getRules, getRuleForUrl, addRule, removeRule, validateRule };
