# Task 09: Context UI Integration

## Status

pending

## Wave

3

## Description

دمج ميزة السياق الذكي في واجهة المستخدم. إرسال URL الصفحة تلقائيًا مع طلب translate-smart لتحسين الجودة. عرض معلومات السياق المكتشفة (نوع المحتوى، العنوان، الثقة) في واجهة النتائج.

## Dependencies

**Depends on:** task-03-context-detection.md, task-06-enhanced-smart.md
**Blocks:** task-10-testing-polish.md

**Context from dependencies:** 
- task-06 يُحسّن `POST /api/translate-smart` ليقبل `url` field ويعيد `context` info
- هذا الـ task يُرسل `url` تلقائيًا من الـ frontend ويعرض context info

## Files to Modify

- `public/js/translate.js` — تعديل `runSmartTranslate()` لإرسال URL
- `public/js/result.js` — عرض context info في metadata area

## Files to Create

None

## Technical Details

### Implementation Steps

1. **Modify `runSmartTranslate()`** في `translate.js`:
   - عند وجود URL في `urlInput` (وضع URL)، أرسله مع translate-smart
   - عند وجود نص فقط (وضع text)، لا ترسل URL (لا يتوفر)
   - اقرأ `context` من الاستجابة

2. **Display context info** في `result.js`:
   - أضف badge صغير بجانب meta يُظهر نوع المحتوى المكتشف
   - مثال: "📝 مقال تقني" أو "💻 كود برمجي" أو "🏥 محتوى طبي"

### Modified runSmartTranslate()

```javascript
// public/js/translate.js
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
    
    // Send URL if available (for context detection)
    const url = (state.mode === 'url') ? urlInput.value.trim() : undefined;
    
    const { status, data } = await postJson('/api/translate-smart', {
      text,
      targetLang: targetLang.value,
      url,  // NEW — improves context detection
    });
    
    hideProgress();
    
    if (status === 503 && data?.error === 'smart-unavailable') {
      showError('smart-unavailable', 503);
      return;
    }
    if (!data || data.error) {
      showError(data?.error || 'server-error', status);
      return;
    }
    
    // Store result with context info
    state.current = {
      type: 'text',
      sourceLang: data.sourceLang || 'auto',
      translated: data.translated,
      original: text,
      meta: { title: 'ترجمة ذكية' },
      context: data.context || null,  // NEW — context metadata
    };
    
    state.activeTab = 'translated';
    result.hidden = false;
    cacheBadge.hidden = true;
    sourceNotice.hidden = true;
    
    // Render with context badge
    renderTab('translated');
    renderContextBadge(data.context);
    
    showToast(data.context?.contentType 
      ? `تمت الترجمة (${getContentTypeLabel(data.context.contentType)}) ✓`
      : 'تمت الترجمة ✓');
    
  } catch {
    hideProgress();
    showError('server-error', 500);
  } finally {
    state.running = false;
    smartBtn.disabled = false;
  }
}
```

### Context Badge UI

```javascript
// public/js/result.js — new function
function renderContextBadge(context) {
  // Remove existing badge
  const existing = document.querySelector('.context-badge');
  if (existing) existing.remove();
  
  if (!context || !context.contentType) return;
  
  const badge = document.createElement('span');
  badge.className = 'context-badge';
  badge.textContent = getContentTypeLabel(context.contentType);
  badge.title = `نوع المحتوى: ${context.contentType} (ثقة: ${Math.round(context.confidence * 100)}%)`;
  
  // Insert next to meta-line
  const metaLine = document.getElementById('meta-line');
  if (metaLine) metaLine.appendChild(badge);
}

function getContentTypeLabel(type) {
  const labels = {
    technical: '📝 تقني',
    code:      '💻 كود',
    medical:   '🏥 طبي',
    legal:     '⚖️ قانوني',
    news:      '📰 إخباري',
    academic:  '🎓 أكاديمي',
    general:   '📄 عام',
  };
  return labels[type] || '📄 عام';
}
```

### CSS for Context Badge

```css
/* public/style.css — context badge */
.context-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: .78rem;
  font-weight: 600;
  background: rgba(99, 102, 241, .12);
  color: var(--primary);
  border: 1px solid rgba(99, 102, 241, .25);
  margin-inline-start: 8px;
  vertical-align: middle;
}
```

## Acceptance Criteria

- [ ] `runSmartTranslate()` sends `url` field when in URL mode
- [ ] Response `context` field is received and stored
- [ ] Context badge appears next to meta-line showing content type
- [ ] Badge shows emoji + Arabic label (📝 تقني, 💻 كود, etc.)
- [ ] Badge has tooltip with confidence percentage
- [ ] Badge is styled consistently with dark/light themes
- [ ] Works when no URL is provided (text-only mode — no badge)
- [ ] Backward compatible — old API responses without `context` work fine

## Notes

- **Smart button only visible in text mode**: The smart translate button only shows when `state.mode === 'text'`. When user pastes a URL and clicks "ترجمة ذكية", they're in URL mode but the smart button is hidden. Consider showing smart button in URL mode too.
- **Context detection on backend**: The backend detects context from URL + text. Frontend just passes the URL.
- **No override UI**: Users cannot manually select content type in this version (simplified).
