// server/adminAuth.js — التحقق من صلاحية الأدمن (رأس أو كوكي httpOnly)
//
// كان هذا الفحص مدفونًا في server.js ويقبل الرأس وحده، فاضطرّت لوحة التحكم إلى
// حفظ التوكن في localStorage — أي أن أي ثغرة XSS تقرأه وتسرّبه (دين تقني §8.6).
// الكوكي httpOnly لا يقرأه جافاسكربت إطلاقًا، فالتسريب يتطلّب اختراق الخادم لا
// حقن سكربت. يبقى الرأس مقبولًا: الاختبارات وأي عميل آلي لا يملك جرّة كوكيز.
const crypto = require('crypto');

const COOKIE_NAME = 'aralink_admin';

// تحليل ترويسة الكوكي يدويًا — إضافة cookie-parser تبعية كاملة لقراءة مفتاح واحد
function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return ''; }
    }
  }
  return '';
}

// مقارنة ثابتة الزمن — timingSafeEqual يرمي عند اختلاف الطول، لذا نفحصه أولًا
function tokenMatches(given, expected) {
  if (!given || !expected) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  return tokenMatches(req.get('x-admin-token') || readCookie(req, COOKIE_NAME), expected);
}

// الافتراضي الآمن: بلا ADMIN_TOKEN ⇒ المسار معطّل بالكامل (503) لا مفتوح.
function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_TOKEN) return res.status(503).json({ error: 'settings-disabled' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

function adminCookieHeader(token, { clear = false } = {}) {
  const parts = [
    `${COOKIE_NAME}=${clear ? '' : encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    // Strict يمنع CSRF: المتصفح لا يرسل الكوكي مع أي طلب قادم من موقع آخر
    'SameSite=Strict',
    clear ? 'Max-Age=0' : 'Max-Age=43200', // 12 ساعة
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

module.exports = { requireAdmin, isAdmin, tokenMatches, adminCookieHeader, COOKIE_NAME };
