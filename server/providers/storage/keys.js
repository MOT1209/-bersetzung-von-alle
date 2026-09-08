// server/providers/storage/keys.js — تطبيع مفاتيح التخزين والتحقق منها
//
// المفتاح شبيه بمسار ('projects/<id>/media/<uuid>.mp4') لكنه **ليس مسارًا من
// المستخدم**. أي سائق محلي يحوّله إلى مسار ملف فعلي، فالتطبيع هنا هو خط الدفاع
// الوحيد ضد اجتياز المسار (path traversal) والكتابة خارج جذر التخزين.
// يُطبَّق في الطبقة المشتركة لا في كل سائق، حتى لا ينسى سائق جديد تطبيقه.

const MAX_KEY_LEN = 512;

function invalidKey(reason) {
  const e = new Error('invalid-storage-key: ' + reason);
  e.code = 'invalid-storage-key';
  return e;
}

/**
 * يعيد مفتاحًا مُطبَّعًا آمنًا أو يرمي invalid-storage-key.
 * القواعد: لا فراغ، لا بايت صفري، لا جذر مطلق، لا '..'، ولا مقاطع فارغة.
 */
function normalizeKey(key) {
  const raw = String(key === undefined || key === null ? '' : key);
  if (!raw.trim()) throw invalidKey('فارغ');
  if (raw.length > MAX_KEY_LEN) throw invalidKey('أطول من الحد');
  if (raw.includes('\0')) throw invalidKey('يحتوي بايتًا صفريًا');
  // نوحّد فواصل ويندوز حتى لا يمرّ '..\\' من فحص '../'
  const unified = raw.replace(/\\/g, '/');
  if (unified.startsWith('/')) throw invalidKey('مسار مطلق');
  // حرف سواقة ويندوز (C:) — مسار مطلق بصيغة أخرى
  if (/^[a-zA-Z]:/.test(unified)) throw invalidKey('مسار مطلق');

  const parts = [];
  for (const seg of unified.split('/')) {
    if (seg === '' || seg === '.') continue; // مقاطع زائدة لا ضرر منها
    if (seg === '..') throw invalidKey('يحتوي ..');
    parts.push(seg);
  }
  if (!parts.length) throw invalidKey('لا يحوي مقاطع صالحة');
  return parts.join('/');
}

module.exports = { normalizeKey, MAX_KEY_LEN };
