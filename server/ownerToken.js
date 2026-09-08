// server/ownerToken.js — توكن ملكية «قدرة» (capability) مشترك
//
// نظامان مختلفان يحتاجان الفكرة نفسها: مشاريع SQLite (server/db/projects.js) و
// مشاريع الدبلجة على نظام الملفات (server/dubbing/*). المنطق واحد، فلا يُنسخ:
// توكن عشوائي يُعاد **مرة واحدة** عند الإنشاء، ولا يُخزَّن إلا مُجزَّأً، وتُقارَن
// التجزئتان بزمن ثابت.
//
// هذه ليست مصادقة مستخدمين: من يحمل التوكن يملك المورد. تكفي لعزل الزوّار عن
// بعضهم، وتُستبدل بحسابات حقيقية دون تغيير شكل المسارات (CURRENT_STATE.md §19).
const { randomBytes, createHash, timingSafeEqual } = require('crypto');

/** توكن جديد — 32 بايت عشوائية (64 حرفًا hex) */
function newToken() {
  return randomBytes(32).toString('hex');
}

/** التجزئة المخزَّنة. تسريب المخزَن لا يمنح وصولًا. */
function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/**
 * مقارنة ثابتة الزمن بين تجزئة مخزَّنة وتوكن مقدَّم.
 * غياب أيٍّ منهما ⇒ false (fail-closed، لا انفتاح ضمني على مورد بلا مالك).
 */
function verifyToken(storedHash, given) {
  if (!storedHash || !given) return false;
  const a = Buffer.from(hashToken(given), 'hex');
  const b = Buffer.from(String(storedHash), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

module.exports = { newToken, hashToken, verifyToken };
