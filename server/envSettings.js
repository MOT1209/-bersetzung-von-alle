// server/envSettings.js — قراءة وحفظ إعدادات المفاتيح في ملف .env
// الحفظ يطبَّق فورًا (process.env + كائن config) دون الحاجة لإعادة تشغيل الخادم،
// لأن translate.js يقرأ config.* وقت الاستدعاء.
const fs = require('fs/promises');
const path = require('path');
const config = require('./config');

// مسار ملف .env — قابل للتجاوز عبر ENV_FILE (تستخدمه الاختبارات مع ملف مؤقت، ولا يلمس .env الحقيقي)
// دالة تُقيَّم وقت الاستدعاء حتى يتمكن التطبيق من تغيير المسار ديناميكيًا أثناء التشغيل
function getEnvFilePath() {
  return process.env.ENV_FILE || path.join(__dirname, '..', '.env');
}

// المفاتيح المسموح بعرضها/حفظها من الإعدادات
const SETTING_KEYS = [
  'GEMINI_API_KEY',
  'MYMEMORY_EMAIL',
  'LIBRE_URL',
  // ===== المزوّدات الاختيارية (مجانية) =====
  'DEEPL_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'PROVIDER_ORDER',
];

// ===== قراءة ملف .env: يعيد المحتوى الخام + خريطة المفاتيح =====
async function readEnvFile() {
  try {
    const raw = await fs.readFile(getEnvFilePath(), 'utf8');
    const map = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) map[m[1]] = m[2].trim();
    }
    return { raw, map };
  } catch {
    return { raw: '', map: {} };
  }
}

// ===== إخفاء المفتاح: أول 6 أحرف + ... (لا نكشف المفتاح الكامل أبدًا) =====
function maskKey(key) {
  if (!key) return '';
  return key.length <= 6 ? key[0] + '...' : key.slice(0, 6) + '...';
}

// ===== عرض الإعدادات الحالية (المفاتيح مقنّعة) =====
// تعكس محتوى ملف .env فقط (ما يديره saveSettings) مع قيم افتراضية منطقية
async function getSettings() {
  const { map } = await readEnvFile();
  const gemini = map.GEMINI_API_KEY || '';
  const deepl = map.DEEPL_API_KEY || '';
  const openaiKey = map.OPENAI_API_KEY || '';
  return {
    geminiKey: gemini ? maskKey(gemini) : '',
    hasGeminiKey: Boolean(gemini),
    myMemoryEmail: map.MYMEMORY_EMAIL || '',
    libreUrl: map.LIBRE_URL || 'https://libretranslate.com',
    geminiModel: map.GEMINI_MODEL || config.GEMINI_MODEL || '',
    rateLimitMax: Number(map.RATE_LIMIT_MAX) || config.RATE_LIMIT_MAX,
    // ===== المزوّدات الاختيارية (المفاتيح مقنّعة) =====
    deeplKey: deepl ? maskKey(deepl) : '',
    hasDeeplKey: Boolean(deepl),
    openaiKey: openaiKey ? maskKey(openaiKey) : '',
    hasOpenaiKey: Boolean(openaiKey),
    openaiBaseUrl: map.OPENAI_BASE_URL || '',
    openaiModel: map.OPENAI_MODEL || '',
    providerOrder: map.PROVIDER_ORDER || '',
  };
}

// ===== إدراج أو استبدال سطر KEY=value مع الحفاظ على بقية السطور والتعليقات =====
function upsertEnvLine(raw, key, value) {
  const lineRe = new RegExp(`^${key}\\s*=.*$`, 'm');
  const line = `${key}=${value}`;
  if (lineRe.test(raw)) return raw.replace(lineRe, line);
  return raw ? raw.replace(/\s*$/, '\n') + line + '\n' : line + '\n';
}

// ===== حفظ الإعدادات: كتابة .env + تطبيق فوري بدون إعادة تشغيل =====
async function saveSettings(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const err = new Error('invalid-settings');
    err.code = 'invalid-settings';
    throw err;
  }

  // تصفية القيم المسموحة فقط، مع تجاهل الحقول غير المعروفة
  const allowed = {};
  for (const key of SETTING_KEYS) {
    if (body[key] === undefined || body[key] === null) continue;
    const value = String(body[key]).trim();
    // قيمة فارغة = لا تغيير (لا نمسح المفتاح القديم أبدًا)
    if (value === '') continue;
    // منع حقن أسطر جديدة في ملف .env
    if (/[\r\n]/.test(value)) {
      const err = new Error('invalid-settings');
      err.code = 'invalid-settings';
      throw err;
    }
    // تحقق خفيف من صيغة رابط LibreTranslate
    if (key === 'LIBRE_URL' && !/^https?:\/\//i.test(value)) {
      const err = new Error('invalid-settings');
      err.code = 'invalid-settings';
      throw err;
    }
    // تحقق من صيغة عنوان خادم OpenAI المتوافق (Ollama / LM Studio…)
    if (key === 'OPENAI_BASE_URL' && !/^https?:\/\//i.test(value)) {
      const err = new Error('invalid-settings');
      err.code = 'invalid-settings';
      throw err;
    }
    // ترتيب المزوّدين: حروف/أرقام/فواصل/شرطات فقط (لا رموز ولا مسافات)
    if (key === 'PROVIDER_ORDER' && !/^[a-z0-9_,-]+$/i.test(value)) {
      const err = new Error('invalid-settings');
      err.code = 'invalid-settings';
      throw err;
    }
    allowed[key] = value;
  }

  // كتابة الملف: استبدال/إضافة سطور القيم المطلوبة فقط
  const { raw } = await readEnvFile();
  let next = raw;
  for (const [key, value] of Object.entries(allowed)) {
    next = upsertEnvLine(next, key, value);
  }
  await fs.writeFile(getEnvFilePath(), next, 'utf8');

  // تطبيق فوري: process.env + كائن config (يُقرأ وقت الاستدعاء في translate.js)
  for (const [key, value] of Object.entries(allowed)) {
    process.env[key] = value;
    if (key === 'GEMINI_API_KEY') config.GEMINI_API_KEY = value;
    if (key === 'MYMEMORY_EMAIL') config.MYMEMORY_EMAIL = value;
    if (key === 'LIBRE_URL') config.LIBRE_URL = value;
    // ===== المزوّدات الاختيارية — تطبيق فوري على config =====
    if (key === 'DEEPL_API_KEY') config.DEEPL_API_KEY = value;
    if (key === 'OPENAI_API_KEY') config.OPENAI_API_KEY = value;
    if (key === 'OPENAI_BASE_URL') config.OPENAI_BASE_URL = value;
    if (key === 'OPENAI_MODEL') config.OPENAI_MODEL = value;
    if (key === 'PROVIDER_ORDER') config.PROVIDER_ORDER = value;
  }

  return { ok: true };
}

module.exports = { getSettings, saveSettings };
