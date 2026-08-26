// server/pdf.js — استخراج النص من ملفات PDF بدون أي مكتبات خارجية
// الفكرة: نجد تدفقات FlateDecode (المضغوطة بـ zlib) ونفك ضغطها بـ zlib المدمج في Node،
// ثم نستخرج السلاسل النصية من عوامل عرض النص Tj و TJ في دفق المحتوى.
const zlib = require('zlib');
const MAX_DECOMPRESSED = 32 * 1024 * 1024;

// ===== فك ضغط بمحاولات متعددة (zlib / raw / gzip) — يعيد null عند الفشل =====
function tryDecompress(buf) {
  const attempts = [
    () => zlib.inflateSync(buf, { maxOutputLength: MAX_DECOMPRESSED }), // FlateDecode القياسي (غلاف zlib)
    () => zlib.inflateRawSync(buf, { maxOutputLength: MAX_DECOMPRESSED }), // بدون رأس zlib — بعض المولّدات تكتب raw
    () => zlib.gunzipSync(buf, { maxOutputLength: MAX_DECOMPRESSED }), // بعض المولّدات تستخدم gzip
  ];
  for (const fn of attempts) {
    try {
      const out = fn();
      if (out && out.length) return out;
    } catch {
      // جرّب الخوارزمية التالية
    }
  }
  return null;
}

// ===== فك تفلتة سلسلة PDF حرفية =====
function unescapePdfString(s) {
  return s
    .replace(/\\\r?\n/g, '') // سطر مستمر مفلت بخط مائل
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f');
}

// ===== تحويل نص دفق المحتوى (بايتات مفكوكة) إلى نص مقروء =====
function extractTextFromStream(decoded) {
  // latin1: تحويل بايتات 0-255 إلى محارف بدون فقدان (محتوى PDF نصي بالبايتات)
  const text = decoded.toString('latin1');
  const parts = [];

  // 1) عامل Tj: (نص) Tj — يلتقط السلاسل الحرفية البسيطة
  const tjRe = /\(((?:\\.|[^()\\])*)\)\s*Tj/g;
  let m;
  while ((m = tjRe.exec(text))) {
    const s = unescapePdfString(m[1]);
    if (s.trim()) parts.push(s);
  }

  // 2) عامل TJ: [ (كلمة) -120 (أخرى) ... ] TJ — مصفوفة سلاسل مع إزاحات
  const tjArrRe = /\[([^\]]*)\]\s*TJ/g;
  while ((m = tjArrRe.exec(text))) {
    const arr = m[1];
    const strRe = /\(((?:\\.|[^()\\])*)\)\s*(-?\d+(?:\.\d+)?)?/g;
    let seg = '';
    let sm;
    while ((sm = strRe.exec(arr))) {
      // الإزاحة السالبة بين السلاسل تدل عادة على فصل كلمات (kern سالب)
      if (sm[2] && parseFloat(sm[2]) < 0) seg += ' ';
      seg += unescapePdfString(sm[1]);
    }
    if (seg.trim()) parts.push(seg);
  }

  // 3) سلاسل hex: <48656C6C6F> Tj — تُستخدم أحيانًا للنصوص غير اللاتينية
  if (!parts.length) {
    const hexRe = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
    while ((m = hexRe.exec(text))) {
      const hex = m[1].replace(/\s+/g, '');
      if (hex.length >= 2 && hex.length % 2 === 0) {
        const s = Buffer.from(hex, 'hex').toString('latin1');
        if (s.trim()) parts.push(s);
      }
    }
  }

  // 4) محاولة أخيرة: أي سلاسل حرفية وحدها (بعض المولّدات يكتبون نصًا خامًا)
  if (!parts.length) {
    const anyRe = /\(((?:\\.|[^()\\])*)\)/g;
    while ((m = anyRe.exec(text))) {
      const s = unescapePdfString(m[1]);
      if (s.trim()) parts.push(s);
    }
  }

  return parts.filter(Boolean).join(' ');
}

// ===== استخراج العنوان من قاموس معلومات PDF (إن كان غير مضغوط) =====
function extractPdfTitle(buffer) {
  if (!buffer || !buffer.length) return '';
  const data = buffer.toString('latin1');
  let m = data.match(/\/Title\s*\(([^)]*)\)/);
  if (m && m[1].trim()) return unescapePdfString(m[1]).trim();
  m = data.match(/\/Title\s*<([0-9A-Fa-f]+)>/);
  if (m && m[1].length >= 2 && m[1].length % 2 === 0) {
    const s = Buffer.from(m[1], 'hex').toString('latin1').trim();
    if (s) return s;
  }
  return '';
}

// ===== الوظيفة الرئيسية: استخراج النص من Buffer ملف PDF =====
// يعيد النص المستخرج، أو سلسلة فارغة إن كان قصيرًا جدًا (< 50 حرفًا) أو غير قابل للقراءة.
function extractPdfText(buffer) {
  if (!buffer || !buffer.length) return '';
  const data = buffer.toString('latin1');
  const texts = [];

  // البحث عن كل تدفقات stream ... endstream
  const streamRe = /stream\r?\n?([\s\S]*?)endstream/g;
  let m;
  while ((m = streamRe.exec(data))) {
    // ما قبل التدفق (حتى 2000 حرف) — نبحث فيه عن فلتر FlateDecode و /Length
    const before = data.slice(Math.max(0, m.index - 2000), m.index);
    const isFlate = /\/FlateDecode/.test(before);

    let raw;
    const lenMatch = before.match(/\/Length\s+(\d+)/);
    if (isFlate && lenMatch) {
      // القصّ الدقيق حسب /Length (أأمن من الـ regex — البيانات المضغوطة قد تحتوي "endstream" مصادفة)
      const len = parseInt(lenMatch[1], 10);
      let bodyStart = m.index + 'stream'.length;
      if (data[bodyStart] === '\r') bodyStart += 1;
      if (data[bodyStart] === '\n') bodyStart += 1;
      raw = data.slice(bodyStart, bodyStart + len);
    } else {
      raw = m[1]; // دفق نصي خام — التقاط الـ lazy regex كافٍ
    }

    let decoded = null;
    if (isFlate) decoded = tryDecompress(Buffer.from(raw, 'latin1'));
    if (!decoded) decoded = Buffer.from(raw, 'latin1'); // قد يكون النص خامًا غير مضغوط

    // فحص: هل هذا دفق محتوى نصي؟ (يحتوي عوامل عرض نص)
    const s = decoded.toString('latin1');
    if (/Tj|TJ|BT/.test(s)) {
      const extracted = extractTextFromStream(decoded);
      if (extracted && extracted.trim().length) texts.push(extracted);
    }
  }

  // دمج النصوص مع تطبيع المسافات
  const result = texts.join('\n').replace(/[ \t]+/g, ' ').trim();
  return result.length >= 50 ? result : '';
}

module.exports = { extractPdfText, extractPdfTitle };
