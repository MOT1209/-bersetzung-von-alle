// server/fetchContent.js — جلب المقالات والمواقع واستخراج النص الأساسي
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ===== جلب المقال من رابط =====
async function fetchArticleContent(url) {
  if (!/^https?:\/\//i.test(url)) {
    const err = new Error('invalid-url');
    err.code = 'invalid-url';
    throw err;
  }

  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    const err = new Error('fetch-failed');
    err.code = 'fetch-failed';
    throw err;
  }

  if (!res.ok) {
    const err = new Error('fetch-failed');
    err.code = 'fetch-failed';
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('pdf')) {
    // محاولة استخراج نص بسيطة من PDF نصي
    try {
      const buf = Buffer.from(await res.arrayBuffer());
      const txt = buf.toString('utf8');
      const clean = txt.replace(/[^\x20-\x7E\u0600-\u06FF\u0621-\u064A\n\r\t]/g, ' ');
      if (clean.length > 200) {
        return { title: 'PDF Document', blocks: [{ type: 'text', content: clean.slice(0, 50000) }] };
      }
      const err = new Error('pdf-unsupported');
      err.code = 'pdf-unsupported';
      throw err;
    } catch (e) {
      if (e.code === 'pdf-unsupported') throw e;
      const err = new Error('pdf-unsupported');
      err.code = 'pdf-unsupported';
      throw err;
    }
  }

  const html = await res.text();
  return extractMainText(html);
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

module.exports = { fetchArticleContent, extractMainText };
