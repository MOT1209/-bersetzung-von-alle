// server/dubbing/dub-owner.js — ملكية مشروع الدبلجة (CURRENT_STATE.md §20)
//
// مشاريع الدبلجة تعيش على نظام الملفات لا في SQLite، فلا ينطبق عليها
// verifyProjectOwner الخاص بالقاعدة. المنطق نفسه (توكن قدرة + تجزئة + مقارنة
// ثابتة الزمن) يأتي من server/ownerToken.js — لا نسخ.
//
// لماذا ملف مستقل (owner.json) لا حقل في meta.json: meta.json يُعاد كتابته أثناء
// تشغيل خط الأنابيب ومن عدّة لغات، فوضع التجزئة فيه يعرّضها لسباق كتابة يمحوها —
// أي مشروع يصير بلا مالك. owner.json يُكتب مرة واحدة عند الإنشاء ولا يُلمس بعدها.
const fs = require('fs');
const path = require('path');
const { newToken, hashToken, verifyToken } = require('../ownerToken');

const OWNER_FILE = 'owner.json';

function ownerPath(projectsDir, projectId) {
  return path.join(projectsDir, String(projectId), OWNER_FILE);
}

/**
 * ينشئ توكن مالك للمشروع ويكتب تجزئته. يعيد التوكن **مرة واحدة** — لا مصدر
 * آخر له بعد هذه اللحظة.
 */
function createOwner(projectsDir, projectId) {
  const token = newToken();
  const file = ownerPath(projectsDir, projectId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ownerHash: hashToken(token), createdAt: Date.now() }));
  return token;
}

/**
 * هل يملك حاملُ هذا التوكن المشروعَ؟
 * مشروع بلا owner.json (مشاريع أُنشئت قبل §20) ⇒ false دائمًا — fail-closed.
 * الأدمن يتجاوز هذا الفحص في طبقة المسار لا هنا.
 */
function verifyOwner(projectsDir, projectId, token) {
  try {
    const raw = fs.readFileSync(ownerPath(projectsDir, projectId), 'utf8');
    return verifyToken(JSON.parse(raw).ownerHash, token);
  } catch {
    return false; // غير موجود أو تالف ⇒ لا وصول
  }
}

module.exports = { createOwner, verifyOwner, OWNER_FILE };
