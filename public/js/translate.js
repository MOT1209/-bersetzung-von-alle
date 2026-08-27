/* ---------- منطق الترجمة الأساسي ---------- */
import { state, postJson, mapError, langName } from './utils.js';
import {
  urlInput, textInput, targetLang, translateBtn, retryBtn,
  result, cacheBadge, sourceNotice,
  batchInput, batchBtn, batchStatus, batchResults, smartBtn,
  showError, hideError, showProgress, hideProgress, showToast,
  metaTitle, metaLine,
} from './ui.js';
import { renderResult, renderTab, renderContextBadge } from './result.js';
import { teardownPlayers } from './media.js';
import { saveToHistory, getGlossary } from './features.js';
import { streamTranslate, supportsStreaming } from './stream.js';

function safeGetLocal(k) { try { return localStorage.getItem(k); } catch { return null; } }

/* ========== الترجمة الأساسية ========== */
export async function runTranslate() {
  const provider  = safeGetLocal('preferredProvider') || undefined;
  const target    = targetLang.value;
  const glossary  = getGlossary();
  const text      = textInput.value.trim();
  const url       = urlInput.value.trim();

  if (state.mode === 'url' && !url)                    return showError('missing-url');
  if (state.mode === 'text' && !text)                  return showError('missing-text');
  if (state.mode === 'file' && !state.file)            return showToast('اختر ملفًا أولًا');
  if (!target)                                         return showError('missing-lang');
  if (state.mode === 'url' && !/^https?:\/\//i.test(url)) return showError('invalid-url');

  state.running = true;
  translateBtn.disabled = true;
  retryBtn.hidden = true;
  try {
    hideError();
    result.hidden = true;
    showProgress('جاري الترجمة…');

    // File mode — no streaming. الخادم يتوقّع JSON base64 (routes-file.js)
    if (state.mode === 'file') {
      const { status, data: d } = await postJson('/api/translate-file', {
        format: state.file.ext,
        content: state.file.base64,
        targetLang: target,
        provider,
      });
      hideProgress();
      if (!d || d.error) { showError((d && d.error) || 'server-error', status); return; }
      state.current = d;
      state.activeTab = 'translated';
      teardownPlayers();
      saveToHistory(d, target);
      renderResult(d);
      return;
    }

    // URL/Text mode — try SSE streaming first
    if (supportsStreaming()) {
      const resultBody = document.getElementById('result-body');
      resultBody.innerHTML = '';
      result.hidden = false;
      let chunks = [];

      const abort = streamTranslate({
        url: state.mode === 'url' ? url : undefined,
        text: state.mode === 'text' ? text : undefined,
        targetLang: target,
        glossary,
        provider,
      }, {
        onInit: (data) => {
          metaTitle.textContent = data.title || 'جاري الترجمة…';
          metaLine.textContent = `من ${langName(data.sourceLang)} إلى ${langName(target)} · ${data.totalChunks} أجزاء`;
          cacheBadge.hidden = true;
          result.classList.remove('reveal');
          void result.offsetWidth;
          result.classList.add('reveal');
        },
        onChunk: (data) => {
          chunks[data.index] = data.text;
          resultBody.innerHTML = '';
          chunks.filter(Boolean).forEach(t => {
            const p = document.createElement('p');
            p.className = 'blk streaming-blk';
            p.textContent = t;
            resultBody.appendChild(p);
          });
          resultBody.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        },
        onProgress: (data) => {
          const pct = Math.round((data.processed / data.total) * 100);
          showProgress(`جاري الترجمة… ${pct}%`);
        },
        onDone: (data) => {
          hideProgress();
          state.current = data;
          state.activeTab = 'translated';
          teardownPlayers();
          saveToHistory(data, target);
          renderResult(data);
        },
        onError: (data) => {
          hideProgress();
          showError(data.error || 'server-error', data.status);
        },
      });
      state.abortCtrl = abort;
    } else {
      // Fallback: traditional translation
      const res = state.mode === 'url'
        ? await postJson('/api/translate', { url, targetLang: target, glossary, provider })
        : await postJson('/api/translate-text', { text, targetLang: target, glossary, provider });
      hideProgress();
      const { status, data } = res;
      if (!data || data.error) { showError((data && data.error) || 'server-error', status); return; }
      state.current = data;
      state.activeTab = 'translated';
      teardownPlayers();
      saveToHistory(data, target);
      renderResult(data);
    }
  } catch {
    hideProgress();
    showError('server-error', 500);
  } finally {
    state.running = false;
    translateBtn.disabled = false;
    state.abortCtrl = null;
  }
}

/* ========== الترجمة الذكية ========== */
export async function runSmartTranslate() {
  const text = textInput.value.trim();
  if (!text) { showToast('اكتب أو الصق النص أولاً'); textInput.focus(); return; }
  if (state.running) return;
  state.running = true;
  smartBtn.disabled = true;
  try {
    hideError();
    result.hidden = true;
    showProgress('🧠 جاري الترجمة الذكية (قد تستغرق دقيقة)…');
    const url = (state.mode === 'url') ? urlInput.value.trim() : undefined;
    const { status, data } = await postJson('/api/translate-smart', { text, targetLang: targetLang.value, url });
    hideProgress();
    if (status === 503 && data && data.error === 'smart-unavailable') {
      state.running = false;
      smartBtn.disabled = false;
      showError('smart-unavailable', 503);
      return;
    }
    if (!data || data.error) {
      state.running = false;
      smartBtn.disabled = false;
      showError((data && data.error) || 'server-error', status);
      return;
    }
    state.current = { type: 'text', sourceLang: data.sourceLang || 'auto', translated: data.translated, original: text, meta: { title: 'ترجمة ذكية' } };
    state.activeTab = 'translated';
    result.hidden = false;
    cacheBadge.hidden = true;
    sourceNotice.hidden = true;
    renderTab('translated');
    if (data.context) renderContextBadge(data.context);
    showToast(data.context?.contentType ? `تمت الترجمة (${getContentTypeLabel(data.context.contentType)}) ✓` : 'تمت الترجمة ✓');
    smartBtn.disabled = false;
    state.running = false;
  } catch {
    hideProgress();
    state.running = false;
    smartBtn.disabled = false;
    showError('server-error', 500);
  }
}

function getContentTypeLabel(type) {
  const labels = { technical: 'تقني', code: 'كود', medical: 'طبي', legal: 'قانوني', news: 'إخباري', academic: 'أكاديمي', general: 'عام' };
  return labels[type] || 'عام';
}

/* ========== ترجمة الدفعات ========== */
export async function runBatch() {
  if (state.batchRunning) return;
  const lines = batchInput.value.split(/\n+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s));
  if (!lines.length) { showToast('أدخل رابطًا واحدًا صالحًا على الأقل'); return; }
  state.batchRunning = true;
  batchBtn.disabled = true;
  batchResults.innerHTML = '';
  const target   = targetLang.value;
  const glossary = getGlossary();
  const provider = safeGetLocal('preferredProvider') || undefined;

  for (let i = 0; i < lines.length; i++) {
    batchStatus.textContent = 'جاري الترجمة (' + (i + 1) + '/' + lines.length + '): ' + lines[i];
    const card    = document.createElement('div');
    card.className = 'batch-item';
    const linkEl  = document.createElement('div');
    linkEl.className = 'batch-link';
    linkEl.dir = 'ltr';
    linkEl.textContent = lines[i];
    card.appendChild(linkEl);
    const bodyEl  = document.createElement('div');
    bodyEl.className = 'batch-body';
    bodyEl.textContent = 'قيد الترجمة…';
    card.appendChild(bodyEl);
    batchResults.appendChild(card);
    batchResults.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      const { status, data } = await postJson('/api/translate', { url: lines[i], targetLang: target, glossary, provider });
      if (data && data.error) {
        bodyEl.textContent = '❌ ' + mapError(data.error, status);
        bodyEl.classList.add('batch-err');
      } else if (data && (data.type === 'youtube' || data.translatedBlocks)) {
        const count = data.type === 'youtube'
          ? (data.captions || []).length + ' سطرًا مترجمًا'
          : (data.translatedBlocks || []).length + ' كتلة مترجمة';
        bodyEl.textContent = '✅ ' + count;
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'btn-secondary';
        open.textContent = 'فتح النتيجة';
        open.addEventListener('click', () => {
          state.current = data;
          state.activeTab = 'translated';
          teardownPlayers();
          saveToHistory(data, target);
          renderResult(data);
        });
        bodyEl.appendChild(open);
      } else {
        bodyEl.textContent = '❌ استجابة غير متوقعة';
        bodyEl.classList.add('batch-err');
      }
    } catch {
      bodyEl.textContent = '❌ ' + mapError('server-error', 500);
      bodyEl.classList.add('batch-err');
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  batchStatus.textContent = 'اكتملت ترجمة ' + lines.length + ' رابطًا ✓';
  state.batchRunning = false;
  batchBtn.disabled = false;
}
