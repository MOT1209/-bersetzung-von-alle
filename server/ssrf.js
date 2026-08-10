// server/ssrf.js — حماية SSRF: منع الوصول إلى العناوين الداخلية/المحظورة عند جلب الروابط
// لا مكتبات خارجية — وحدات Node المدمجة فقط (dns, net)
const dns = require('dns');
const net = require('net');

// ===== النطاقات الممنوعة (IPv4) بصيغة عدد صحيح غير مُوقّع 32-بت =====
const BLOCKED_V4 = [
  [0x00000000, 0x00FFFFFF], // 0.0.0.0/8 (غير محدد)
  [0x0A000000, 0x0AFFFFFF], // 10.0.0.0/8 (خاص)
  [0x64400000, 0x647FFFFF], // 100.64.0.0/10 (CGNAT)
  [0x7F000000, 0x7FFFFFFF], // 127.0.0.0/8 (حلقي loopback)
  [0xA9FE0000, 0xA9FEFFFF], // 169.254.0.0/16 (link-local)
  [0xAC100000, 0xAC1FFFFF], // 172.16.0.0/12 (خاص)
  [0xC0A80000, 0xC0A8FFFF], // 192.168.0.0/16 (خاص)
  [0xE0000000, 0xEFFFFFFF], // 224.0.0.0/4 (multicast)
  [0xF0000000, 0xFFFFFFFF], // 240.0.0.0/4 (محجوز)
];

// تحويل عنوان IPv4 نصي إلى عدد صحيح غير مُوقّع
// (حسابيًا وليس بعمليات البت — لأن << يعمل بـ int32 المُوقّع ويكسر القيم فوق 2^31)
function ipv4ToInt(addr) {
  const parts = addr.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return parts[0] * 16777216 + parts[1] * 65536 + parts[2] * 256 + parts[3];
}

// تحويل عنوان IPv6 نصي إلى مصفوفة من 8 مجموعات (16-بت لكل مجموعة) أو null إن كان غير صالح
function ipv6ToGroups(addr) {
  if (!net.isIPv6(addr)) return null;
  let s = addr.toLowerCase();

  // نهاية بصيغة IPv4 مضمّن (مثل ::ffff:192.168.0.1) — افصلها وعالجها بعدًا
  let v4tail = null;
  if (s.includes('.')) {
    const i = s.lastIndexOf(':');
    v4tail = s.slice(i + 1);
    s = s.slice(0, i);
    if (!net.isIPv4(v4tail)) return null;
  }

  const parts = s.split('::');
  if (parts.length > 2) return null;

  let groups;
  if (parts.length === 2) {
    // انضغاط "::" — املأ الفجوة بالأصفار
    const left = parts[0] ? parts[0].split(':').map((h) => parseInt(h, 16)) : [];
    const right = parts[1] ? parts[1].split(':').map((h) => parseInt(h, 16)) : [];
    const missing = 8 - left.length - right.length - (v4tail ? 2 : 0);
    if (missing < 1) return null; // "::" تستلزم مجموعة أصفار واحدة على الأقل
    groups = [...left, ...Array(missing).fill(0), ...right];
  } else {
    const all = s.split(':').map((h) => parseInt(h, 16));
    if (all.length !== 8 - (v4tail ? 2 : 0)) return null;
    groups = all;
  }

  if (v4tail) {
    const b = v4tail.split('.').map(Number);
    groups.push(b[0] * 256 + b[1], b[2] * 256 + b[3]);
  }

  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) return null;
  return groups;
}

// تحقق من نطاقات IPv6 الممنوعة — تعيد true إذا كان العنوان محظورًا
function isBlockedV6(groups) {
  // :: (غير محدد)
  if (groups.every((g) => g === 0)) return true;
  // ::1 (حلقي loopback)
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true;
  // fc00::/7 (unique local) — أول 7 بت = 1111110
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  // fe80::/10 (link-local) — أول 10 بت = 1111111010
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  // ::ffff:0:0/96 (IPv4-mapped) — فكّها وتحقق من عنوان IPv4 الداخلي
  if (
    groups[0] === 0 && groups[1] === 0 && groups[2] === 0 &&
    groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff
  ) {
    const inner = groups[6] * 65536 + groups[7];
    return BLOCKED_V4.some(([lo, hi]) => inner >= lo && inner <= hi);
  }
  return false;
}

// هل العنوان نصي عام (غير محظور)؟ — أي عنوان غير قابل للتحليل يُعتبر محظورًا (إغلاق آمن)
function isPublicAddress(addr) {
  const family = net.isIP(addr);
  if (family === 4) {
    const n = ipv4ToInt(addr);
    if (n === null) return false;
    return !BLOCKED_V4.some(([lo, hi]) => n >= lo && n <= hi);
  }
  if (family === 6) {
    const groups = ipv6ToGroups(addr);
    if (!groups) return false;
    return !isBlockedV6(groups);
  }
  return false;
}

// تحقق من أن الرابط عام وآمن للجلب — ترمي خطأ code='invalid-url' أو code='blocked-url'
async function validatePublicUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    const err = new Error('invalid-url');
    err.code = 'invalid-url';
    throw err;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const err = new Error('invalid-url');
    err.code = 'invalid-url';
    throw err;
  }

  // hostname في URL قد يأتي بأقواس لـ IPv6 (مثل [::1]) — أزل الأقواس
  let host = parsed.hostname;
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (!host) {
    const err = new Error('invalid-url');
    err.code = 'invalid-url';
    throw err;
  }

  const throwBlocked = () => {
    const err = new Error('blocked-url');
    err.code = 'blocked-url';
    throw err;
  };

  // hostname عنوان IP حرفي؟ تحقق منه مباشرة دون DNS
  if (net.isIP(host)) {
    if (!isPublicAddress(host)) throwBlocked();
    return { address: host };
  }

  // وإلا حلّ DNS وافحص كل عنوان يعيده (يشمل إعادة التوجيه CNAME → عنوان داخلي)
  let addresses;
  try {
    addresses = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch (e) {
    const err = new Error('invalid-url');
    err.code = 'invalid-url';
    throw err;
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    const err = new Error('invalid-url');
    err.code = 'invalid-url';
    throw err;
  }

  for (const rec of addresses) {
    if (!isPublicAddress(rec.address)) throwBlocked();
  }

  return { addresses };
}

module.exports = { validatePublicUrl };
