/* ---------- عرض النتائج + التصدير ---------- */
import { EXPORT_FORMATS } from './constants.js';
import { state, postJson, mapError } from './utils.js';
import {
  result, resultEmbed, resultBody, metaTitle, metaLine, sourceNotice, cacheBadge,
  copyBtn, shareBtn, shareView, shareLink, shareCloseBtn, exportRow,
  srtBtn, listenBtn, localBtn, dubBtn, compareBtn, tashkeelBtn, tabs, targetLang,
  showToast, showError, hideProgress, showProgress,
} from './ui.js';
import {
  buildWebVtt, vttClock, setupYtPlayer, buildCaptionPanel,
  startCaptionSync, teardownPlayers,
} from './media.js';
import { stopDubbing } from './dub.js';

/* ---------- عرض النتيجة حسب النوع ---------- */
export function renderResult(data) {
  if (!data || data.error) return showError(data && data.error, 400);
  state.current = data;

  // نتيجة جديدة: أوقف أي دبلجة سارية وأخفِ زرّها — مقاطعها تخصّ الفيديو السابق
  stopDubbing();
  if (dubBtn) dubBtn.hidden = true;

  const origTab = document.querySelector('.tab[data-tab="original"]');
  if (origTab) origTab.hidden = (data.type === 'localvideo');

  if (data.type === 'youtube')   return renderYouTubeResult(data);
  if (data.type === 'article')   return renderArticleResult(data);
  if (data.type === 'localvideo') return renderLocalVideo(data);
  renderTextResult(data);
}

function renderYouTubeResult(data) {
  metaTitle.textContent = data.meta?.title || data.videoId;
  cacheBadge.hidden     = !(data.meta?.cached);
  let line = 'تمت ترجمة الفيديو من ' + langName(data.sourceLang) + ' إلى ' + langName(targetLang.value);
  if (data.captions) line += ' · ' + data.captions.length + ' مقطع';
  metaLine.textContent     = line;
  sourceNotice.hidden      = true;

  srtBtn.hidden    = false;
  listenBtn.hidden = false;
  if (dubBtn) dubBtn.hidden = !(data.captions && data.captions.length);
  compareBtn.hidden = true;
  state.compare    = false;
  compareBtn.classList.remove('active');
  copyBtn.hidden   = false;
  shareBtn.hidden  = false;
  tashkeelBtn.hidden = false;

  resultEmbed.hidden = false;
  resultEmbed.innerHTML = '';
  if (data.videoId) setupYtPlayer(data.videoId);
  buildCaptionPanel();
  startCaptionSync();

  resultBody.innerHTML = '';
  renderParagraphs((data.captions || []).map((c) => c.translated || c.original || '').join('\n'));

  state.resultForExport = { format: 'srt', segments: (data.captions || []).map((c) => ({ start: c.start || 0, end: (c.start || 0) + (c.duration || 2000), text: c.translated || c.original || '' })), translated: (data.captions || []).map((c) => c.translated || c.original || '').join('\n') };
  renderExportRow(state.resultForExport);
  revealResult();
}

function renderArticleResult(data) {
  metaTitle.textContent = data.meta?.title || 'مقال';
  cacheBadge.hidden     = !(data.meta?.cached);
  let line = 'تمت ترجمة المقال من ' + langName(data.sourceLang) + ' إلى ' + langName(targetLang.value);
  if (data.meta?.wordCount) line += ' · ' + data.meta.wordCount + ' كلمة';
  metaLine.textContent     = line;
  sourceNotice.hidden      = !(data.sourceUrl);

  srtBtn.hidden    = true;
  listenBtn.hidden = false;
  compareBtn.hidden = false;
  copyBtn.hidden   = false;
  shareBtn.hidden  = false;
  tashkeelBtn.hidden = false;

  resultEmbed.hidden = true;
  resultEmbed.innerHTML = '';
  state.activeTab = 'translated';
  resultBody.innerHTML = '';
  if (state.compare) renderCompareView(data);
  else renderParagraphs((data.translatedBlocks || []).map((b) => (b && b.content) || '').join('\n\n'));

  state.resultForExport = { format: 'txt', translated: (data.translatedBlocks || []).map((b) => (b && b.content) || '').join('\n\n'), structure: data.translatedBlocks ? data.translatedBlocks.map((b) => ({ type: (b && b.type) || 'paragraph', content: (b && b.content) || '' })) : null };
  renderExportRow(state.resultForExport);
  revealResult();
}

function renderTextResult(data) {
  metaTitle.textContent = data.meta?.title || 'ترجمة نص';
  cacheBadge.hidden     = true;
  const srcName = langName(data.sourceLang);
  metaLine.textContent     = 'تمت الترجمة من ' + srcName + ' إلى ' + langName(targetLang.value);
  sourceNotice.hidden      = true;

  srtBtn.hidden    = true;
  listenBtn.hidden = false;
  compareBtn.hidden = true;
  state.compare    = false;
  compareBtn.classList.remove('active');
  copyBtn.hidden   = false;
  shareBtn.hidden  = false;
  tashkeelBtn.hidden = false;

  resultEmbed.hidden = true;
  resultEmbed.innerHTML = '';
  state.activeTab = 'translated';
  renderTab('translated');
  resultBody.innerHTML = '';
  renderParagraphs(data.translated || '');

  state.resultForExport = { format: 'txt', translated: data.translated || '' };
  renderExportRow(state.resultForExport);
  revealResult();
}

function revealResult() {
  result.hidden = false;
  result.classList.remove('reveal');
  void result.offsetWidth;
  result.classList.add('reveal');
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- لوحات التبويب ---------- */
export function renderTab(tab) {
  const data = state.current;
  if (!data) return;
  if (tab === 'original') {
    const text = data.type === 'youtube'
      ? (data.captions || []).map((c) => c.original || '').join('\n')
      : (data.originalBlocks || []).map((b) => (b && b.content) || '').join('\n\n');
    renderParagraphs(text);
  } else {
    const text = data.type === 'youtube'
      ? (data.captions || []).map((c) => c.translated || c.original || '').join('\n')
      : (data.translatedBlocks || []).map((b) => (b && b.content) || '').join('\n\n');
    renderParagraphs(text);
  }
  resultBody.innerHTML = '';
  const t = tab === 'original'
    ? (data.type === 'youtube'
        ? (data.captions || []).map((c) => c.original || '').join('\n')
        : (data.originalBlocks || []).map((b) => (b && b.content) || '').join('\n\n'))
    : (data.type === 'youtube'
        ? (data.captions || []).map((c) => c.translated || c.original || '').join('\n')
        : (data.translatedBlocks || []).map((b) => (b && b.content) || '').join('\n\n'));
  renderParagraphs(t);
}

function renderParagraphs(text) {
  resultBody.innerHTML = '';
  String(text || '').split(/\n{2,}/).forEach((p) => {
    const el = document.createElement('p');
    el.className = 'blk';
    el.textContent = p;
    resultBody.appendChild(el);
  });
}

function renderCompareView(data) {
  resultBody.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'compare-wrap';
  const colA = document.createElement('div');
  colA.className = 'compare-col';
  const colB = document.createElement('div');
  colB.className = 'compare-col';
  const hA = document.createElement('h3');
  hA.className = 'compare-head';
  hA.textContent = 'النص الأصلي';
  const hB = document.createElement('h3');
  hB.className = 'compare-head';
  hB.textContent = 'الترجمة';
  colA.appendChild(hA);
  colB.appendChild(hB);
  const originals = data.originalBlocks || [];
  const translated = data.translatedBlocks || [];
  const max = Math.max(originals.length, translated.length);
  for (let i = 0; i < max; i++) {
    const ob = originals[i];
    const tb = translated[i];
    if (ob) {
      const el = document.createElement('p');
      el.className = 'blk' + (ob.type === 'heading' ? ' blk-heading' : '');
      el.textContent = ob.content;
      colA.appendChild(el);
    }
    if (tb) {
      const el = document.createElement('p');
      el.className = 'blk' + (tb.type === 'heading' ? ' blk-heading' : '');
      el.textContent = tb.content;
      colB.appendChild(el);
    }
  }
  wrap.appendChild(colA);
  wrap.appendChild(colB);
  resultBody.appendChild(wrap);
}

export { renderCompareView as renderCompare };

/* ---------- OCR result ---------- */
export function handleOcrResult(data) {
  const text = String(data.text || '').trim();
  if (!text) { showError('ocr-empty', 422); return; }
  const btn = document.querySelector('.mode-btn[data-mode="text"]');
  if (btn) btn.click();
  document.getElementById('text-input').value = text;
  state.file = null;
  showToast('تم استخراج النص من الصورة — اضغط «ترجمة» الآن');
}

/* ---------- أزرار التصدير ---------- */
function renderExportRow(data) {
  const buttons = document.getElementById('export-buttons');
  buttons.innerHTML = '';
  const hasSegs   = Array.isArray(data.segments) && data.segments.length > 0;
  const hasStruct = !!data.structure;
  for (const f of EXPORT_FORMATS) {
    if ((f.fmt === 'srt' || f.fmt === 'vtt') && !hasSegs)   continue;
    if ((f.fmt === 'json' || f.fmt === 'xml') && !hasStruct) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-action';
    b.textContent = f.label;
    b.setAttribute('aria-label', 'تنزيل النتيجة بصيغة ' + f.label);
    b.addEventListener('click', () => exportResult(f.fmt));
    buttons.appendChild(b);
  }
  exportRow.hidden = buttons.childElementCount === 0;
}

async function exportResult(fmt) {
  const r = state.resultForExport;
  if (!r || !r.translated) return;
  const body = { format: fmt };
  if (r.segments && (fmt === 'srt' || fmt === 'vtt'))         body.segments = r.segments;
  else if (r.structure && (fmt === 'json' || fmt === 'xml'))   body.structure = r.structure;
  else body.text = r.translated;
  let base = 'translated';
  const fileInput = state.file;
  if (fileInput && fileInput.name) base = fileInput.name.replace(/\.[^.]+$/, '') || 'translated';
  body.filename = base + '.' + fmt;
  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) { showToast('تعذر تصدير الملف — حاول مجددًا'); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = body.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast('تم تنزيل الملف ✓');
  } catch { showToast('تعذر تصدير الملف — تحقق من اتصال الخادم'); }
}

/* ---------- نسخ + مشاركة ---------- */
export async function copyResult() {
  const data = state.current;
  if (!data) return;
  const text = data.type === 'youtube'
    ? (data.captions || []).map((c) => c.translated || c.original || '').join('\n')
    : (data.translatedBlocks || []).map((b) => (b && b.content) || '').join('\n\n') || data.translated || '';
  try { await navigator.clipboard.writeText(text); showToast('تم النسخ ✓'); }
  catch { showToast('تعذر النسخ'); }
}

export async function shareResult() {
  const data = state.current;
  if (!data) return;
  const title = data.meta?.title || 'ترجمة';
  const text  = data.type === 'youtube'
    ? (data.captions || []).map((c) => c.translated || c.original || '').join('\n')
    : (data.translatedBlocks || []).map((b) => (b && b.content) || '').join('\n\n') || data.translated || '';
  if (navigator.share) {
    try { await navigator.share({ title, text }); } catch {}
    return;
  }
  const url = location.origin + location.pathname + '#share=' + encodeURIComponent(text.slice(0, 2000));
  if (shareLink) { shareLink.value = url; shareLink.hidden = false; }
  const body = document.getElementById('share-body');
  if (body) body.textContent = text.slice(0, 4000);
  shareView.hidden = false;
  shareView.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try { await navigator.clipboard.writeText(url); showToast('تم نسخ رابط المشاركة ✓'); }
  catch { showToast('انسخ الرابط يدويًا من الحقل أعلاه'); }
}

/* ---------- helpers ---------- */
function langName(code) {
  if (!code) return '';
  const langs = { ar:'العربية', en:'English', fr:'Français', es:'Español', de:'Deutsch', tr:'Türkçe', ur:'اردو', 'fr-FR':'Français (France)', 'fr-CA':'Français (Canada)' };
  if (langs[code]) return langs[code];
  const short = code.split('-')[0];
  return langs[short] || code;
}

/* ---------- Context Badge ---------- */
export function renderContextBadge(context) {
  const existing = document.querySelector('.context-badge');
  if (existing) existing.remove();
  if (!context || !context.contentType) return;
  const badge = document.createElement('span');
  badge.className = 'context-badge';
  badge.textContent = getContentTypeLabel(context.contentType);
  badge.title = `نوع المحتوى: ${context.contentType} (ثقة: ${Math.round(context.confidence * 100)}%)`;
  const metaLineEl = document.getElementById('meta-line');
  if (metaLineEl) metaLineEl.appendChild(badge);
}

function getContentTypeLabel(type) {
  const labels = { technical: '📝 تقني', code: '💻 كود', medical: '🏥 طبي', legal: '⚖️ قانوني', news: '📰 إخباري', academic: '🎓 أكاديمي', general: '📄 عام' };
  return labels[type] || '📄 عام';
}
