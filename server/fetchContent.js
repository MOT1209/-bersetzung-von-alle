// server/fetchContent.js — جلب المقالات والمواقع واستخراج النص الأساسي
const http = require('node:http');
const https = require('node:https');
const cheerio = require('cheerio');
const { validatePublicUrl } = require('./ssrf'); // حماية SSRF قبل أي جلب
const { extractPdfText, extractPdfTitle } = require('./pdf'); // مستخرج نصوص PDF (بدون مكتبات)
const { getRuleForUrl } = require('./extractionRules'); // قواعد استخراج مخصصة للمواقع الصعبة

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Redirect-safe fetch: walk each redirect hop manually and re-validate it against
// the same SSRF rules as the original URL, so a public URL cannot bounce us onto
// an internal / private / link-local / cloud-metadata address.
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
const MAX_REDIRECTS = 5;
const FETCH_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
};

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_HTML_BYTES = 10 * 1024 * 1024; // 10 MB — hard cap for HTML/text responses

const fetchFailed = () => {
  const err = new Error('fetch-failed');
  err.code = 'fetch-failed';
  return err;
};
const tooLarge = () => {
  const err = new Error('input-too-large');
  err.code = 'input-too-large';
  return err;
};

// ===== جلب مثبّت على عنوان مُتحقَّق منه (يُغلق ثغرة TOCTOU/DNS-rebinding) =====
// لا ندع Node يحلّ DNS إطلاقًا وقت الاتصال: نمرّر القائمة التي أعادها validatePublicUrl
// (حلّ + فحص في خطوة واحدة) ونفتح المقبس على عنوان منها تحديدًا. القرار الوحيد لـ DNS
// وقع قبل الفتح، فلا وجود لقرار ثانٍ يقلبه المهاجم بين الفحص والاتصال، والمقبس لا يمكن
// أن يلامس عنوانًا داخليًا حتى لو انقلب سجل النطاق بعد الفحص.
// `u` كائن URL مارّ بالفحص، وaddresses عناوينه العامة. يعيد IncomingMessage للاستجابة.
function requestPinned(u, addresses, timeoutMs) {
  return new Promise((resolve, reject) => {
    const isHttps = u.protocol === 'https:';
    const mod = isHttps ? https : http;
    const base = {
      method: 'GET',
      port: Number(u.port) || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      // Host الأصلي (الاسم لا الـ IP) — تُخدم المواقع الافتراضية المشتركة على نفس العنوان
      headers: { ...FETCH_HEADERS, Host: u.host },
      signal: AbortSignal.timeout(timeoutMs),
    };
    // SNI الأصلي للـ https — الشهادة تُتحقَّق مقابل اسم المضيف الحقيقي لا مقابل الـ IP
    if (isHttps) base.servername = u.hostname;

    let lastErr = null;
    const tryAddress = (i) => {
      if (i >= addresses.length) {
        const err = fetchFailed();
        err.cause = lastErr;
        return reject(err);
      }
      const req = mod.request({ ...base, hostname: addresses[i].address }, (res) => {
        // نال المقبس استجابة من هذا العنوان — لا نعيد المحاولة بعد وصول الرأس
        resolve(res);
      });
      req.on('error', (e) => {
        lastErr = e;
        tryAddress(i + 1); // نجرب عنوانًا آخر من قائمة من فُحصت سلفًا (غير ممنوع أصلًا)
      });
      req.end();
    };
    tryAddress(0);
  });
}

/**
 * Read an HTTP response body as text with a streaming byte cap.
 * Uses Content-Length for early rejection when present, then streams chunks
 * via the async iterator and aborts immediately if the accumulated size
 * exceeds `maxBytes`. Throws an error with `code = 'input-too-large'`
 * (→ HTTP 413) on overflow so callers can map it uniformly.
 */
async function readBodyLimited(res, maxBytes) {
  const lenHeader = res.headers['content-length'];
  if (lenHeader && Number(lenHeader) > maxBytes) throw tooLarge();
  const chunks = [];
  let totalBytes = 0;
  try {
    for await (const chunk of res) {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) throw tooLarge();
      chunks.push(chunk);
    }
  } finally {
    // حرّر المقبس دائمًا — حتى عند التجاوز/الانقطاع لا يظل التنزيل مستمرًا في الخلفية
    res.destroy();
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function readPdfBufferLimited(res) {
  const lenHeader = res.headers['content-length'];
  if (lenHeader && Number(lenHeader) > MAX_PDF_BYTES) throw tooLarge();
  const chunks = [];
  let totalBytes = 0;
  try {
    for await (const chunk of res) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_PDF_BYTES) throw tooLarge();
      chunks.push(chunk);
    }
  } finally {
    res.destroy();
  }
  return Buffer.concat(chunks);
}

// ===== fetch آمن ضد القفزات: كل قفزة (بما فيها الأولى) تُفحص وتُحلّ قبل فتح المقبس =====
async function fetchWithSafeRedirects(startUrl, timeoutMs = 15000) {
  let currentUrl = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // تحليل + فحص + حلّ DNS في خطوة واحدة (يرمي invalid-url / blocked-url قبل أي اتصال)
    const validated = await validatePublicUrl(currentUrl);
    const addresses = validated.addresses || [{ address: validated.address, family: 0 }];

    const u = new URL(currentUrl);
    const res = await requestPinned(u, addresses, timeoutMs);

    if (!REDIRECT_STATUSES.includes(res.statusCode)) return res;

    const location = res.headers.location;
    if (!location) {
      // Redirect status without a Location header — treat as a failed fetch (matches old behavior)
      throw fetchFailed();
    }

    let nextUrl;
    try {
      nextUrl = new URL(location, currentUrl).href;
    } catch (e) {
      throw fetchFailed();
    }

    // القفزة التالية تُفحص في بداية الدورة الجديدة قبل فتح أي مقبس عليها
    currentUrl = nextUrl;
  }

  // Too many redirects — fail closed
  throw fetchFailed();
}

// ===== جلب المقال من رابط =====
async function fetchArticleContent(url) {
  if (!/^https?:\/\//i.test(url)) {
    const err = new Error('invalid-url');
    err.code = 'invalid-url';
    throw err;
  }

  // SSRF-safe fetch: كل قفزة (بما فيها الأولى) تُفحص وتُحلّ قبل فتح المقبس، والمقبس
  // يُثبَّت على عنوان مُتحقَّق منه لا DNS ثانٍ — فينغلق مسار rebinding (invalid-url / blocked-url / fetch-failed)
  const res = await fetchWithSafeRedirects(url);

  if (res.statusCode < 200 || res.statusCode >= 300) {
    const err = new Error('fetch-failed');
    err.code = 'fetch-failed';
    throw err;
  }

  const contentType = res.headers['content-type'] || '';
  // الكشف عن ملف PDF: امتداد .pdf في الرابط أو نوع المحتوى application/pdf
  const isPdfUrl = /\.pdf($|\?)/i.test(url);
  if (isPdfUrl || contentType.includes('pdf')) {
    try {
      const buf = await readPdfBufferLimited(res);
      const text = await extractPdfText(buf); // يعيد '' إن كان النص قصيرًا جدًا أو غير قابل للقراءة
      if (!text) {
        const err = new Error('pdf-unsupported');
        err.code = 'pdf-unsupported';
        throw err;
      }
      const title = extractPdfTitle(buf) || 'PDF';
      // تقسيم النص إلى فقرات (كتل) بنفس صيغة المقالات حتى تمر عبر خط الترجمة نفسه
      const blocks = text
        .split(/\n{2,}/)
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter((p) => p.length >= 3)
        .map((p) => ({ type: 'text', content: p.slice(0, 20000) }));
      if (!blocks.length) blocks.push({ type: 'text', content: text.slice(0, 20000) });
      return { title, text, blocks, source: 'pdf' };
    } catch (e) {
      if (e.code === 'pdf-unsupported') throw e;
      if (e.code === 'input-too-large') throw e;
      const err = new Error('pdf-unsupported');
      err.code = 'pdf-unsupported';
      throw err;
    }
  }

  const html = await readBodyLimited(res, MAX_HTML_BYTES);

  // قاعدة استخراج مخصصة لهذا النطاق؟ (مواقع لا تلتقطها الأداة العامة)
  const rule = await getRuleForUrl(url);
  if (rule) {
    try {
      return extractWithSelectors(html, rule);
    } catch (e) {
      if (e.code === 'content-empty') {
        // القاعدة لم تطابق شيئًا — نعود للاستخراج العام بدل الفشل
        return extractMainText(html);
      }
      throw e;
    }
  }

  return extractMainText(html);
}

// ===== استخراج النص عبر محددات CSS مخصصة (قواعد المستخدم للمواقع الصعبة) =====
function extractWithSelectors(html, rule) {
  const $ = cheerio.load(html);
  const title = $(rule.titleSelector || 'h1').first().text().replace(/\s+/g, ' ').trim() || '';

  // أزل العناصر المزعجة قبل الجمع
  $('script, style, nav, footer, header, aside, iframe, form, button, svg, noscript').remove();

  const blocks = [];
  const selectors = Array.isArray(rule.contentSelectors) ? rule.contentSelectors : ['article'];
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      // استخرج العناوين داخل الحاوية ثم الفقرات
      $(el).find('h1, h2, h3').each((_, h) => {
        const t = $(h).text().replace(/\s+/g, ' ').trim();
        if (t.length >= 2) blocks.push({ type: 'heading', content: t });
      });
      $(el).find('p, blockquote, li').each((_, p) => {
        const t = $(p).text().replace(/\s+/g, ' ').trim();
        if (t.length >= 3) blocks.push({ type: 'text', content: t });
      });
      // نص مباشر داخل الحاوية (عناوين/فقرات بمستوى واحد بدون وسائط)
      const direct = $(el)
        .contents()
        .filter(function () { return this.type === 'text'; })
        .text().replace(/\s+/g, ' ').trim();
      if (direct.length >= 3) blocks.push({ type: 'text', content: direct });
    });
  }

  if (!blocks.length) {
    const err = new Error('content-empty');
    err.code = 'content-empty';
    throw err;
  }

  return { title, blocks };
}

// ===== استخراج النص الأساسي من HTML =====
function extractMainText(html) {
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim() || $('h1').first().text().trim() || '';

  // إزالة العناصر غير المرغوب فيها (محددات دقيقة — لا تطابق html/body أبدًا)
  $('script, style, nav, footer, header, aside, iframe, form, button, svg, noscript, canvas, video, audio').remove();
  $('[aria-hidden="true"], [role="navigation"], .cookie, .popup, .modal, .share, .social, .related, .recommended').remove();
  // إزالة الإعلانات بأنماط آمنة فقط (تتجنب كلاسات الصفحة العامة مثل "disabled")
  $('[class*="advert"], [id*="advert"], [class*="banner-ad"], [id*="banner-ad"], [class*="-ads"], [id*="-ads"], [class^="ad-"], [id^="ad-"], [class*="ad-container"], [id*="ad-container"]').remove();

  // اختيار الحاوية الرئيسية
  let container = $('article').first();
  if (!container.length) container = $('main').first();
  if (!container.length) container = $('body').first();

  const blocks = [];
  const walk = (el) => {
    $(el).children().each((_, child) => {
      const tag = child.tagName ? child.tagName.toLowerCase() : '';
      if (['h1', 'h2', 'h3'].includes(tag)) {
        const text = $(child).text().trim();
        if (text.length >= 2) blocks.push({ type: 'heading', content: text });
      } else if (tag === 'p' || tag === 'blockquote' || tag === 'li') {
        const text = $(child).text().replace(/\s+/g, ' ').trim();
        if (text.length >= 3) blocks.push({ type: 'text', content: text });
      } else if (tag === 'div' || tag === 'section' || tag === 'ul' || tag === 'ol' || tag === 'article' || tag === 'main') {
        walk(child);
      }
    });
  };
  walk(container);

  if (!blocks.length) {
    // محاولة أخيرة: كل النص
    const text = $(container).text().replace(/\s+/g, ' ').trim();
    if (text.length >= 3) {
      blocks.push({ type: 'text', content: text.slice(0, 50000) });
    }
  }

  if (!blocks.length) {
    const err = new Error('content-empty');
    err.code = 'content-empty';
    throw err;
  }

  return { title, blocks };
}

module.exports = { fetchArticleContent, extractMainText, extractWithSelectors, requestPinned };
