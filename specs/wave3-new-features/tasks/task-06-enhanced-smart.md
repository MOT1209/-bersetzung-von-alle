# Task 06: Enhanced Smart Translation

## Status

pending

## Wave

2

## Description

تحسين `POST /api/translate-smart` بإضافة سياق تلقائي من محرك اكتشاف المحتوى (task-03). بدلاً من إرسال النص فقط إلى Gemini، يُرسل الآن: system prompt خاص بنوع المحتوى + metadata (العنوان، النطاق، نوع المحتوى). هذا يحسّن جودة الترجمة بشكل ملحوظ للمحتوى المتخصص.

## Dependencies

**Depends on:** task-03-context-detection.md
**Blocks:** task-09-context-ui.md

**Context from dependencies:** task-03 ينشئ `server/context-detect.js` بدوال `detectContext(url, text)` و `getContextPrompt(context)`. هذا الـ task يستخدمهما لتحسين translate-smart.

## Files to Modify

- `server/routes-translate.js` — تعديل `POST /api/translate-smart` لاستخدام context detection

## Files to Create

None

## Technical Details

### Implementation Steps

1. Import `detectContext` و `getContextPrompt` في `routes-translate.js`
2. تعديل معالج `POST /api/translate-smart`:
   - قبول حقول جديدةاختيارية: `url`, `context` (من الـ frontend)
   - استدعاء `detectContext(url, text)` لاكتشاف نوع المحتوى تلقائيًا
   - بناء system prompt يجمع بين: context.suggestedPrompt + user instructions
   - إرسال system prompt إلى Gemini بدلاً من simple user prompt
3. تعديل Gemini API call لتضمين system prompt
4. إضافة `context` field في Response body

### Current translate-smart Implementation

```javascript
// 현재 (ما قبل التعديل)
router.post('/translate-smart', async (req, res) => {
  const { text, targetLang } = req.body;
  // ...
  const prompt = `Rewrite the following text in ${targetLangName}...`;
  const result = await geminiTranslate(text, prompt);
  res.json({ type: 'smart', translated: result, sourceLang: 'auto' });
});
```

### Enhanced Implementation

```javascript
// بعد التعديل
const { detectContext, getContextPrompt } = require('./context-detect');

router.post('/translate-smart', async (req, res) => {
  const { text, targetLang, url, context: userContext } = req.body;
  // ...
  
  // 1. Detect content type automatically
  const detected = detectContext(url || '', text || '');
  
  // 2. Merge detected context with user-provided context
  const context = {
    ...detected,
    ...(userContext || {}),
  };
  
  // 3. Build enhanced system prompt
  const systemPrompt = getContextPrompt(context);
  
  // 4. Build user prompt with metadata
  const targetLangName = langName(targetLang);
  const userPrompt = `Translate the following text to ${targetLangName}.
  
${context.title ? `Title: ${context.title}` : ''}
${context.domain ? `Source: ${context.domain}` : ''}
Content type: ${context.contentType}

Text to translate:
${text.slice(0, 8000)}`;
  
  // 5. Call Gemini with system prompt
  const result = await geminiTranslateWithSystem(systemPrompt, userPrompt);
  
  // 6. Return enhanced response
  res.json({
    type: 'smart',
    translated: result,
    sourceLang: detected.language || 'auto',
    context: {
      contentType: detected.contentType,
      confidence: detected.confidence,
    },
  });
});
```

### Gemini System Prompt Integration

```javascript
// Gemini API supports system instruction via systemInstruction
async function geminiTranslateWithSystem(systemInstruction, userPrompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: config.GEMINI_MODEL || 'gemini-2.0-flash',
    systemInstruction: systemInstruction,
  });
  
  const result = await model.generateContent(userPrompt);
  return result.response.text();
}
```

### Request/Response Shape

```javascript
// POST /api/translate-smart — Request
{
  text: "string (required)",
  targetLang: "ar (required)",
  url: "https://github.com/... (optional — improves context detection)",
  context: {                    // optional — override detected context
    contentType: "technical",
    title: "React Hooks Guide",
  }
}

// POST /api/translate-smart — Response
{
  type: "smart",
  translated: "الترجمة...",
  sourceLang: "en",
  context: {                    // NEW — detected context info
    contentType: "technical",
    confidence: 0.85,
  }
}
```

### Backward Compatibility

- `url` and `context` are optional — if not provided, behaves like current implementation
- Response includes `context` field but old clients can ignore it
- No breaking changes to existing API

## Acceptance Criteria

- [ ] `POST /api/translate-smart` accepts optional `url` and `context` fields
- [ ] Content type is auto-detected from URL + text when not provided
- [ ] System prompt is generated from detected content type
- [ ] Gemini receives system instruction (not just user prompt)
- [ ] Response includes `context: { contentType, confidence }`
- [ ] Backward compatible — works without `url` or `context` fields
- [ ] Technical content gets code-aware translation
- [ ] Medical content gets medical terminology handling
- [ ] Improvement is noticeable for specialized content
- [ ] No performance regression for general content

## Notes

- **Gemini systemInstruction**: Supported by `@google/generative-ai` SDK — just pass `systemInstruction` to `getGenerativeModel()`
- **Other providers**: System prompt is Gemini-specific. For other providers, prepend the system prompt to the user prompt.
- **Caching**: Enhanced prompts may reduce cache hit rates — consider cache key including contentType
- **Cost**: System instruction adds minimal cost (sent once per request)
