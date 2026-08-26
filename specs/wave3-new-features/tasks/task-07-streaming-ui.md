# Task 07: Streaming UI Integration

## Status

pending

## Wave

3

## Description

دمج ترجمة البث المباشر في واجهة المستخدم الرئيسية. عند النقر على "ترجمة"، تبدأ الترجمة عبر SSE وتعرض النتائج سطرًا بسطر مباشرة في `result-body`. يُعامل progress bar بشكل أنيق ويُظهر عدد الأسطر المترجمة.

## Dependencies

**Depends on:** task-01-sse-backend.md, task-04-sse-client.md
**Blocks:** task-10-testing-polish.md

**Context from dependencies:** 
- task-01 ينشئ `POST /api/translate-stream` بـ SSE events
- task-04 ينشئ `streamTranslate()` wrapper في `public/js/stream.js`
- هذا الـ task يستخدم `streamTranslate()` في `public/js/translate.js` بدلاً من `postJson('/api/translate')`

## Files to Modify

- `public/js/translate.js` — تعديل `runTranslate()` لاستخدام SSE streaming
- `public/js/app.js` — إضافة streaming imports

## Files to Create

None

## Technical Details

### Implementation Steps

1. Import `streamTranslate` في `translate.js`
2. تعديل `runTranslate()`:
   - إذا كان الوضع `url` أو `text` → استخدم `streamTranslate()`
   - إذا كان الوضع `file` → استخدم `postJson('/api/translate-file')` (لا streaming للملفات)
3. عرض النتائج live أثناء وصول الأحداث:
   - `onInit`: عرض metadata + إظهار progress bar
   - `onChunk`: إضافة السطر المترجم فورًا إلى `result-body`
   - `onProgress`: تحديث progress bar
   - `onDone`: إخفاء progress bar + عرض النتيجة النهائية
   - `onError`: عرض رسالة خطأ

### Modified runTranslate()

```javascript
// public/js/translate.js
import { streamTranslate } from './stream.js';

export async function runTranslate() {
  // ... validation same as current ...
  
  state.running = true;
  translateBtn.disabled = true;
  retryBtn.hidden = true;
  
  try {
    hideError();
    result.hidden = true;
    showProgress('جاري الترجمة…');
    
    // File upload — no streaming (use traditional endpoint)
    if (state.mode === 'file') {
      const { status, data } = await postJson('/api/translate-file', formData);
      hideProgress();
      if (!data || data.error) { showError(...); return; }
      state.current = data;
      renderResult(data);
      return;
    }
    
    // URL or Text — use SSE streaming
    const resultBody = document.getElementById('result-body');
    resultBody.innerHTML = '';
    result.hidden = false;
    
    let initReceived = false;
    let chunks = [];
    
    const abort = streamTranslate({
      url: state.mode === 'url' ? urlInput.value.trim() : undefined,
      text: state.mode === 'text' ? textInput.value.trim() : undefined,
      targetLang: targetLang.value,
      glossary: getGlossary(),
    }, {
      onInit: (data) => {
        initReceived = true;
        metaTitle.textContent = data.title || 'جاري الترجمة…';
        metaLine.textContent = `${langName(data.sourceLang)} → ${langName(targetLang.value)} · ${data.totalChunks} أجزاء`;
        cacheBadge.hidden = true;
        
        // Show streaming UI
        result.classList.remove('reveal');
        void result.offsetWidth;
        result.classList.add('reveal');
      },
      
      onChunk: (data) => {
        chunks[data.index] = data.text;
        // Render all chunks so far
        resultBody.innerHTML = '';
        chunks.filter(Boolean).forEach(text => {
          const p = document.createElement('p');
          p.className = 'blk streaming-blk';
          p.textContent = text;
          resultBody.appendChild(p);
        });
        // Auto-scroll
        resultBody.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      },
      
      onProgress: (data) => {
        const pct = Math.round((data.processed / data.total) * 100);
        progressBar.style.width = pct + '%';
        progressText.textContent = `جاري الترجمة… ${pct}% (${data.processed}/${data.total})`;
      },
      
      onDone: (data) => {
        hideProgress();
        state.current = data;
        state.activeTab = 'translated';
        
        // Build final result
        const fullText = chunks.filter(Boolean).join('\n');
        resultBody.innerHTML = '';
        renderParagraphs(fullText);
        
        // Setup export buttons
        state.resultForExport = { format: 'txt', translated: fullText };
        renderExportRow(state.resultForExport);
        
        // Show action buttons
        copyBtn.hidden = false;
        shareBtn.hidden = false;
        tashkeelBtn.hidden = false;
        
        showToast('تمت الترجمة ✓');
      },
      
      onError: (data) => {
        hideProgress();
        showError(data.error || 'server-error', data.status);
      },
    });
    
    // Store abort function for cleanup
    state.abortCtrl = abort;
    
  } catch (e) {
    hideProgress();
    showError('server-error', 500);
  } finally {
    state.running = false;
    translateBtn.disabled = false;
    state.abortCtrl = null;
  }
}
```

### Streaming Visual Effects

```css
/* public/style.css — streaming animation */
.streaming-blk {
  animation: fadeInLine 0.3s ease;
}

@keyframes fadeInLine {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Progress bar enhanced for streaming */
.progress-text {
  font-variant-numeric: tabular-nums; /* prevents layout shift */
}
```

### Fallback Behavior

- If SSE fails (network error, old browser), fall back to `postJson('/api/translate')` with full loading
- Show toast: "الترجمة التقليدية (بدون بث مباشر)" when falling back

## Acceptance Criteria

- [ ] Clicking "ترجمة" starts SSE streaming for URL/text modes
- [ ] `onInit` shows metadata (source lang, chunk count)
- [ ] `onChunk` renders each translated line immediately in result-body
- [ ] `onProgress` updates progress bar with percentage
- [ ] `onDone` shows final result with export/copy/share buttons
- [ ] `onError` shows error message with retry option
- [ ] Auto-scroll follows new content
- [ ] Fade-in animation on each new line
- [ ] File mode still uses traditional endpoint (no streaming)
- [ ] Fallback to traditional translation if SSE fails
- [ ] Abort cancels translation on page navigation
- [ ] Works on mobile (responsive result-body)

## Notes

- **Chunk order**: chunks may arrive out of order if multiple providers process simultaneously — use `data.index` to maintain order
- **Partial rendering**: Each chunk is rendered independently (no need to wait for all)
- **Tab switching**: Original tab shows all source text (from init metadata), translated tab shows streaming result
- **Export**: Only available after `onDone` (need full text)
