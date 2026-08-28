// server/files.js — استيراد/تصدير الملفات: استخراج النص + ترجمة بالدفعات + تصدير بالبنية
// يدعم 11 صيغة إدخال و8 صيغ إخراج. الترجمة تحافظ على البنية: توقيتات SRT/VTT،
// مفاتيح JSON/XML، صفوف CSV/XLSX. كل الاختبارات بلا شبكة (حقن دالة ترجمة).
//
// ⚠️ الوصول إلى محرك الترجمة عبر `require('./translate')` وقت التنفيذ (وليس تفكيك
// الخصائص عند الاستيراد) حتى تتمكن الاختبارات من تزييف `translate.translateText`.
const translate = require('./translate');
const mammoth = require('mammoth'); // قراءة DOCX
const ExcelJS = require('exceljs'); // قراءة XLSX
const { XMLParser, XMLBuilder } = require('fast-xml-parser'); // قراءة/بناء XML
const JSZip = require('jszip'); // قراءة PPTX (وEPUB احتياطيًا)

// الصيغ المدعومة للاستيراد (11) — تُكتشف من امتداد الملف
const SUPPORTED_IMPORT = ['txt', 'md', 'docx', 'xlsx', 'csv', 'srt', 'vtt', 'json', 'xml', 'epub', 'pptx'];
// الصيغ المدعومة للتصدير (8) — قيد v1: لا تصدير pptx/epub (يُخرَجان txt/md/docx فقط)
const SUPPORTED_EXPORT = ['txt', 'md', 'docx', 'srt', 'vtt', 'json', 'csv', 'xml'];
const MAX_FILE_CHARS = 300000; // حد النص المستخرج من أي ملف (حماية الذاكرة)
const MAX_CELLS = 2000; // حد الخلايا في xlsx/csv (حماية حصص الترجمة المجانية)

// ===== أدوات مساعدة عامة =====

// اقتطاع النص الطويل مع تمييز النهاية
function truncate(text) {
  const s = String(text ?? '');
  if (s.length <= MAX_FILE_CHARS) return s;
  return s.slice(0, MAX_FILE_CHARS) + '\n…';
}

// خطأ موحّد برمز (يرسمه routes-file إلى حالة HTTP)
function codeError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

// هل القيمة النصية قابلة للترجمة؟ (مرآة isUntranslatable في translate.js لكن للقيم النصية)
// تُستبعد: الفارغة، حرف واحد، الأرقام/العملات/النسب المئوية الخالصة، الروابط، الأختام الزمنية
function isSkipValue(v) {
  if (typeof v !== 'string') return true;
  const t = v.trim();
  if (!t || t.length <= 1) return true;
  if (/^https?:\/\/\S+$/i.test(t)) return true;
  if (/^\d{1,2}:\d{2}(:\d{2})?([,.]\d+)?\s*$/.test(t)) return true; // ختم زمني فقط
  if (/^[\d\s.,:;%+\-–—/()€$£¥]+$/.test(t)) return true; // أرقام/تواريخ/عملات خالصة
  return false;
}

// تنظيف اسم الملف للتحميل (إزالة الأحرف الخطرة)
function sanitizeFilename(name) {
  if (typeof name !== 'string' || !name.trim()) return '';
  return name
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

// ===== الترجمات النصية SRT / VTT =====

// تنسيق زمني: SRT بفاصلة (HH:MM:SS,mmm) وVTT بنقطة (HH:MM:SS.mmm)
function formatClock(seconds, { srt } = {}) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${srt ? ',' : '.'}${pad(ms, 3)}`;
}

// تحويل أجزاء التوقيت إلى ثوانٍ
function toSeconds(h, m, s, ms) {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(String(ms).padEnd(3, '0')) / 1000;
}

// تحليل SRT/VTT إلى مقاطع { start, end, text } (بالثواني)
function parseSubtitle(content, fmt) {
  const isVtt = fmt === 'vtt';
  const lines = String(content ?? '').replace(/\r\n/g, '\n').split('\n');
  const segments = [];
  // التوقيت قبل --> أو بعده: نحتاج فقط 8 مجموعات (يُتجاهل ما بعد المسافة من السمات)
  const timeRe = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (isVtt) {
      // رأس WEBVTT وسطور NOTE (تستمر حتى السطر الفارغ) تُتجاهل
      if (/^WEBVTT/i.test(line)) { i++; continue; }
      if (/^NOTE\b/i.test(line)) {
        i++;
        while (i < lines.length && lines[i].trim() !== '') i++;
        continue;
      }
      if (/^(STYLE|REGION|X-TIMESTAMP-MAP)\b/i.test(line)) { i++; continue; }
    }
    const m = line.match(timeRe);
    if (m) {
      const start = toSeconds(m[1], m[2], m[3], m[4]);
      const end = toSeconds(m[5], m[6], m[7], m[8]);
      i++;
      // النص قد يكون متعدد الأسطر — اجمع حتى السطر الفارغ أو التوقيت التالي
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== '' && !timeRe.test(lines[i])) {
        textLines.push(lines[i].trim());
        i++;
      }
      segments.push({ start, end, text: textLines.join('\n') });
      continue;
    }
    // سطر رقم الفهرس في SRT (أو أي سطر غريب) — تجاهل
    i++;
  }
  return { segments };
}

// بناء نص SRT/VTT كامل من المقاطع (عكس parseSubtitle)
function buildSubtitle(segments, fmt) {
  const isVtt = fmt === 'vtt';
  const blocks = segments.map((seg, idx) => {
    const start = formatClock(seg.start, { srt: !isVtt });
    const end = formatClock(seg.end, { srt: !isVtt });
    const body = `${start} --> ${end}\n${seg.text}`;
    // VTT لا يحمل رقم فهرس (صيغة SRT فقط) — التوافق مع WebVTT
    return isVtt ? body : `${idx + 1}\n${body}`;
  });
  return (isVtt ? 'WEBVTT\n\n' : '') + blocks.join('\n\n') + '\n';
}

// ===== محلل CSV يدوي (يحترم علامات الاقتباس) =====

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { cur += '"'; i++; } // علامة اقتباس مزدوجة داخل النص
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cur);
      cur = '';
      if (row.some((v) => v !== '')) rows.push(row); // تجاهل الأسطر الفارغة تمامًا
      row = [];
    } else {
      cur += c;
    }
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    if (row.some((v) => v !== '')) rows.push(row);
  }
  return rows;
}

// ترميز خلية CSV: اقتباس إذا احتوت فاصلة أو اقتباسًا أو سطرًا جديدًا
function escapeCsvCell(v) {
  const str = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(str)) return "'\"" + str.replace(/"/g, '""') + '"';
  if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function buildCsv(rows) {
  return rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n');
}

// ===== استخراج النص من الملفات =====

// PPTX: قراءة ppt/slides/slideN.xml واستخراج نصوص <a:t>
async function extractPptxText(buffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw codeError('invalid-file');
  }
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml/i)[1]) - Number(b.match(/slide(\d+)\.xml/i)[1]));
  if (!slideFiles.length) throw codeError('invalid-file');
  const parts = [];
  for (const name of slideFiles) {
    const xml = await zip.file(name).async('string');
    const texts = [];
    // \b بعد t يمنع مطابقة <a:tbl> أو <a:title> بالخطأ
    const re = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const t = m[1].trim();
      if (t) texts.push(t);
    }
    if (texts.length) parts.push(texts.join('\n')); // الشريحة = فقرة
  }
  if (!parts.length) throw codeError('invalid-file');
  return parts.join('\n\n');
}

// EPUB: قراءة الفصول عبر epub2 (يستقبل Buffer عبر adm-zip) وتنظيف HTML
async function extractEpubText(buffer) {
  const { EPub } = require('epub2'); // تحميل كسول — لا يُحمَّل إلا عند الحاجة
  let epub;
  try {
    epub = await EPub.createAsync(buffer);
  } catch {
    throw codeError('invalid-file');
  }
  if (!epub.flow || !epub.flow.length) throw codeError('invalid-file');
  const parts = [];
  for (const chapter of epub.flow) {
    const html = await new Promise((resolve) => {
      epub.getChapter(chapter.id, (err, text) => resolve(err ? '' : text));
    });
    const plain = String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .trim();
    if (plain) parts.push(plain);
  }
  if (!parts.length) throw codeError('invalid-file');
  return parts.join('\n\n');
}

// جمع كل القيم النصية القابلة للترجمة من بنية (JSON/XML) — بأي عمق
function collectStrings(obj, acc = []) {
  if (typeof obj === 'string') {
    if (!isSkipValue(obj)) acc.push(obj);
  } else if (Array.isArray(obj)) {
    for (const v of obj) collectStrings(v, acc);
  } else if (obj !== null && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('@_')) continue; // سمات XML لا تُترجم
      collectStrings(v, acc);
    }
  }
  return acc;
}

// استخراج النص من Buffer حسب الصيغة → { format, text, segments?, rows?, structure? }
async function extractText(buffer, ext) {
  ext = String(ext || '').toLowerCase();
  if (!SUPPORTED_IMPORT.includes(ext)) throw codeError('invalid-format');
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(String(buffer ?? ''), 'utf8');

  switch (ext) {
    case 'txt':
    case 'md':
      return { format: ext, text: truncate(buffer.toString('utf8')) };

    case 'docx': {
      // mammoth يرفض المخازن غير الصالحة بخطأ واضح — نعيده كـ invalid-file
      try {
        const { value } = await mammoth.extractRawText({ buffer });
        return { format: ext, text: truncate(value) };
      } catch {
        throw codeError('invalid-file');
      }
    }

    case 'srt':
    case 'vtt': {
      const { segments } = parseSubtitle(buffer.toString('utf8'), ext);
      return { format: ext, segments, text: truncate(segments.map((s) => s.text).join('\n')) };
    }

    case 'xlsx': {
      const wb = new ExcelJS.Workbook();
      try {
        await wb.xlsx.load(buffer);
      } catch {
        throw codeError('invalid-file');
      }
      const rows = [];
      let cells = 0;
      for (const ws of wb.worksheets) {
        ws.eachRow((row) => {
          const r = [];
          row.eachCell({ includeEmpty: false }, (cell) => {
            if (cells >= MAX_CELLS) return; // حماية حصص الترجمة المجانية
            cells++;
            const v = cell.value;
            r.push(v === null || v === undefined ? '' : String(v));
          });
          if (r.length) rows.push(r);
        });
      }
      return { format: ext, rows, text: truncate(rows.map((r) => r.join(' | ')).join('\n')) };
    }

    case 'csv': {
      const all = parseCsv(buffer.toString('utf8'));
      const rows = [];
      let cells = 0;
      for (const r of all) {
        if (cells >= MAX_CELLS) break;
        cells += r.length;
        rows.push(r);
      }
      return { format: ext, rows, text: truncate(rows.map((r) => r.join(' | ')).join('\n')) };
    }

    case 'json': {
      let structure;
      try {
        structure = JSON.parse(buffer.toString('utf8'));
      } catch {
        throw codeError('invalid-file');
      }
      return { format: ext, structure, text: truncate(collectStrings(structure).join('\n')) };
    }

    case 'xml': {
      let structure;
      try {
        structure = new XMLParser({ ignoreAttributes: false, trimValues: false }).parse(buffer.toString('utf8'));
      } catch {
        throw codeError('invalid-file');
      }
      return { format: ext, structure, text: truncate(collectStrings(structure).join('\n')) };
    }

    case 'epub':
      return { format: ext, text: truncate(await extractEpubText(buffer)) };

    case 'pptx':
      return { format: ext, text: truncate(await extractPptxText(buffer)) };

    default:
      throw codeError('invalid-format');
  }
}

// ===== الترجمة بالدفعات =====

// ترجمة قائمة نصوص فريدة على دفعات ≤3500 حرف مفصولة بـ \n مع تأخير 250ms
// تعيد Map: النص الأصلي → المترجم (النصوص غير القابلة للترجمة لا تدخل الخريطة)
async function translateList(uniqueTexts, targetLang, translateFn) {
  const map = new Map();
  // فك التكرار مع الاحتفاظ بالترتيب + تجاهل النصوص غير القابلة للترجمة
  const seen = new Set();
  const items = [];
  for (const t of uniqueTexts) {
    if (isSkipValue(t) || seen.has(t)) continue;
    seen.add(t);
    items.push(t);
  }
  if (!items.length) return map;

  // تجميع الدفعات: حتى 3500 حرف للدفعة
  const batches = [];
  let cur = [];
  let curLen = 0;
  for (const t of items) {
    const len = t.length + 1; // +1 لفاصل السطر
    if (curLen + len > 3500 && cur.length) {
      batches.push(cur);
      cur = [t];
      curLen = len;
    } else {
      cur.push(t);
      curLen += len;
    }
  }
  if (cur.length) batches.push(cur);

  // إعادة المحاولة لكل عنصر من الدفعة على حدة (تُستخدم عند فشل ترجمة الدفعة كاملة
  // أو عند اختلاف عدد الأسطر) — أي فشل فردي يُتجاهل ويُبقى العنصر بدون ترجمة
  async function translateBatchIndividually(batch, targetLang, translateFn, map) {
    for (const item of batch) {
      try {
        const single = await translateFn(item, targetLang, 'auto');
        const singleText =
          single && typeof single === 'object' && 'translated' in single
            ? String(single.translated || '')
            : String(single || '');
        // لا نُسجّل ترجمة فارغة — نترك العنصر بدون قيمة في الخريطة ليُحفظ كما هو
        if (singleText.trim()) map.set(item, singleText);
      } catch (e) {
        // فشل منفرد — نُبقي العنصر بدون ترجمة (translateStructured سيُبقي النص الأصلي)
      }
    }
  }

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const chunk = batch.join('\n');
    let raw;
    try {
      raw = await translateFn(chunk, targetLang, 'auto');
    } catch (e) {
      // فشل استدعاء ترجمة الدفعة بالكامل (شبكة/مزود/تحديد حصص) — لا نُجهض الملف كله؛
      // ننتقل للمعالجة المفردة أدناه (نفس مسار اختلاف عدد الأسطر)
      await translateBatchIndividually(batch, targetLang, translateFn, map);
      // تأخير بين الدفعات (حماية حصص Google المجانية)
      if (b < batches.length - 1) await new Promise((r) => setTimeout(r, 250));
      continue;
    }
    // translateFn قد يعيد نصًا أو { translated } (عند استخدام translateTextWithMeta)
    const translatedText =
      raw && typeof raw === 'object' && 'translated' in raw ? raw.translated : String(raw ?? '');
    const lines = String(translatedText).split('\n').map((l) => l.trim());
    if (lines.length === batch.length) {
      // مطابقة 1:1 — Google يحافظ على عدد الأسطر عادة
      batch.forEach((t, i) => map.set(t, lines[i]));
    } else {
      // اختلف عدد الأسطر — نُعيد المحاولة لكل عنصر منفرداً لتجنّب ربط عدة عناصر بنفس النص
      // (السلوك السابق كان يفسد كل خلية من الثانية فما فوق بنص الدفعة الكاملة)
      await translateBatchIndividually(batch, targetLang, translateFn, map);
    }
    // تأخير بين الدفعات (حماية حصص Google المجانية)
    if (b < batches.length - 1) await new Promise((r) => setTimeout(r, 250));
  }
  return map;
}

// اجتياز متكرر لأي كائن/مصفوفة: القيم النصية فقط تُترجم عبر الخريطة (بدون طلبات إضافية)
function translateStructured(obj, translateListMap) {
  if (typeof obj === 'string') {
    if (isSkipValue(obj)) return obj;
    const hit = translateListMap.get(obj);
    return hit !== undefined ? hit : obj;
  }
  if (Array.isArray(obj)) return obj.map((v) => translateStructured(v, translateListMap));
  if (obj !== null && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('@_')) { out[k] = v; continue; } // سمات XML تُحفظ كما هي
      out[k] = translateStructured(v, translateListMap);
    }
    return out;
  }
  return obj; // أرقام/بولين/null تبقى كما هي
}

// ===== ترجمة محتوى ملف كامل =====

// content: نص/سلسلة، أو Buffer (يُستخرج أولاً عبر extractText)
// translateFn: دالة الترجمة الافتراضية = translate.translateText (تُستدعى وقت التنفيذ)
async function translateFileContent(content, format, targetLang, translateFn, sourceLang) {
  format = String(format || '').toLowerCase();
  if (!SUPPORTED_IMPORT.includes(format)) throw codeError('invalid-format');

  // إحصاءات الكاش (تُملأ فقط عند استخدام المحرك الحقيقي عبر translateTextWithMeta)
  let cachedChunks = 0;
  let totalChunks = 0;
  const defaultFn = async (t, tl, sl, opts) => {
    // translateTextWithMeta تعيد نفس ناتج translateText مع إحصاءات الكاش
    if (typeof translate.translateTextWithMeta === 'function') {
      const meta = await translate.translateTextWithMeta(t, tl, sl, opts);
      if (meta && typeof meta === 'object' && 'translated' in meta) {
        cachedChunks += meta.chunksFromCache || 0;
        totalChunks += meta.chunksTotal || 0;
        return meta.translated;
      }
    }
    return translate.translateText(t, tl, sl, opts);
  };
  const fn = translateFn || defaultFn;
  // غلاف يمرر لغة المصدر الفعلية إن توفرت (وإلا 'auto' كما تفترض الدفعات)
  const wrapped = async (t, tl, sl, opts) => fn(t, tl, sourceLang || sl, opts);

  const cacheStats = () => (totalChunks > 0 ? { fromCache: cachedChunks === totalChunks } : {});

  // استخراج من Buffer إن وُجد (نمرر Buffer من الواجهة بعد فك base64)
  const ex = Buffer.isBuffer(content) ? await extractText(content, format) : null;
  const text = ex ? ex.text : String(content ?? '');

  // ===== ترجمات SRT / VTT: توقيتات محفوظة + نصوص مترجمة =====
  if (format === 'srt' || format === 'vtt') {
    const segments = ex && ex.segments ? ex.segments : parseSubtitle(text, format).segments;
    const map = await translateList(segments.map((s) => s.text), targetLang, wrapped);
    const newSegments = segments.map((s) => ({ start: s.start, end: s.end, text: map.get(s.text) ?? s.text }));
    return { format, translated: buildSubtitle(newSegments, format), segments: newSegments, stats: { items: map.size, ...cacheStats() } };
  }

  // ===== JSON / XML: بنية محفوظة + قيم نصية مترجمة فقط =====
  if (format === 'json' || format === 'xml') {
    let structure = ex && ex.structure ? ex.structure : null;
    if (!structure) {
      try {
        structure =
          format === 'json'
            ? JSON.parse(text)
            : new XMLParser({ ignoreAttributes: false, trimValues: false }).parse(text);
      } catch {
        throw codeError('invalid-file');
      }
    }
    const map = await translateList(collectStrings(structure), targetLang, wrapped);
    const newStructure = translateStructured(structure, map);
    const translated =
      format === 'json' ? JSON.stringify(newStructure, null, 2) : new XMLBuilder({ ignoreAttributes: false }).build(newStructure);
    return { format, translated, structure: newStructure, stats: { items: map.size, ...cacheStats() } };
  }

  // ===== CSV: خلايا فريدة تُترجم ثم يُعاد بناء الملف =====
  if (format === 'csv') {
    const rows = ex && ex.rows ? ex.rows : parseCsv(text);
    const map = await translateList(rows.flat(), targetLang, wrapped);
    const newRows = rows.map((r) => r.map((c) => map.get(c) ?? c)); // الخلايا غير المترجمة تبقى أصلية
    return { format, translated: buildCsv(newRows), stats: { items: map.size, ...cacheStats() } };
  }

  // ===== XLSX: خلايا فريدة تُترجم؛ الإخراج نص صفوف (لا إعادة بناء xlsx في v1) =====
  if (format === 'xlsx') {
    const rows = ex && ex.rows ? ex.rows : text.split('\n').map((l) => [l]);
    const map = await translateList(rows.flat(), targetLang, wrapped);
    const newRows = rows.map((r) => r.map((c) => map.get(c) ?? c));
    const translated = newRows.map((r) => r.join(' | ')).join('\n');
    return { format, translated, stats: { items: map.size, ...cacheStats() } };
  }

  // ===== TXT / MD / DOCX / EPUB / PPTX: النص الكامل (translateText يقسّم داخليًا) =====
  const translated = await wrapped(text, targetLang, sourceLang);
  return { format, translated, stats: { items: 1, ...cacheStats() } };
}

// ===== التصدير =====

// بناء ملف قابل للتحميل → { buffer, mime, extension }
async function buildExport(format, { text, segments, structure, filename } = {}) {
  format = String(format || '').toLowerCase();
  const extension = format;
  const name = sanitizeFilename(filename) || `translated.${extension}`;

  switch (format) {
    case 'txt':
      return { buffer: Buffer.from(String(text ?? ''), 'utf8'), mime: 'text/plain; charset=utf-8', extension, name };
    case 'md':
      return { buffer: Buffer.from(String(text ?? ''), 'utf8'), mime: 'text/markdown; charset=utf-8', extension, name };
    case 'srt':
    case 'vtt': {
      const segs = segments || parseSubtitle(String(text ?? ''), format).segments;
      const body = buildSubtitle(segs, format);
      return {
        buffer: Buffer.from(body, 'utf8'),
        mime: format === 'vtt' ? 'text/vtt; charset=utf-8' : 'text/plain; charset=utf-8',
        extension,
        name,
      };
    }
    case 'json': {
      const body = structure !== undefined ? JSON.stringify(structure, null, 2) : String(text ?? '');
      return { buffer: Buffer.from(body, 'utf8'), mime: 'application/json; charset=utf-8', extension, name };
    }
    case 'xml': {
      const body = structure !== undefined ? new XMLBuilder({ ignoreAttributes: false }).build(structure) : String(text ?? '');
      return { buffer: Buffer.from(body, 'utf8'), mime: 'application/xml; charset=utf-8', extension, name };
    }
    case 'csv': {
      const body = Array.isArray(structure) ? buildCsv(structure) : String(text ?? '');
      return { buffer: Buffer.from(body, 'utf8'), mime: 'text/csv; charset=utf-8', extension, name };
    }
    case 'docx': {
      const { Document, Packer, Paragraph, TextRun } = require('docx');
      const paragraphs = String(text ?? '')
        .split(/\n{1,}/)
        .map((p) => new Paragraph({ children: [new TextRun({ text: p })] }));
      const doc = new Document({ sections: [{ children: paragraphs }] });
      const buffer = await Packer.toBuffer(doc);
      return {
        buffer,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension,
        name,
      };
    }
    default:
      throw codeError('invalid-format');
  }
}

module.exports = {
  SUPPORTED_IMPORT,
  SUPPORTED_EXPORT,
  MAX_FILE_CHARS,
  MAX_CELLS,
  parseSubtitle,
  buildSubtitle,
  formatClock,
  extractText,
  translateList,
  translateStructured,
  translateFileContent,
  buildExport,
  sanitizeFilename,
  parseCsv,
  buildCsv,
};
