# Task 03: Context Detection Engine

## Status

pending

## Wave

1

## Description

إنشاء محرك لاكتشاف نوع المحتوى وسياقه تلقائيًا من رابط أو نص. هذا المحرك يُستخدم بواسطة translate-smart لتوليد system prompt مناسب لكل نوع محتوى (مقالات تقنية، كود برمجي، محتوى طبي، قانوني، عام). يحسّن جودة الترجمة بشكل ملحوظ للمحتوى المتخصص.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-06-enhanced-smart.md, task-09-context-ui.md

**Context from dependencies:** هذا المحرك مستقل — يأخذ URL + text ويعيد context object. لا يحتاج أي مكون آخر. translate-smart في Wave 2 سيستخدمه.

## Files to Create

- `server/context-detect.js` — Content type detection engine

## Files to Modify

- None (يُستخدم فقط بواسطة translate-smart في Wave 2)

## Technical Details

### Implementation Steps

1. إنشاء `server/context-detect.js` بـ Express-compatible exports
2. تنفيذ `detectContext(url, text)`:
   - تحليل URL (domain, path, title hints)
   - تحليل النص (polling patterns, keywords, structure)
   - تحديد نوع المحتوى
   - توليد system prompt مناسب
3. تنفيذ `getContextPrompt(context)` — يُعيد الـ system prompt الكامل

### Content Types

```javascript
const CONTENT_TYPES = {
  technical:  { label: 'مقال تقني', keywords: ['tutorial','guide','api','documentation','github','stackoverflow','npm','python','javascript','react','docker'] },
  code:       { label: 'كود برمجي', keywords: ['function','class','import','const','let','def','return','module','async','await','const ','var ','let '] },
  medical:    { label: 'محتوى طبي', keywords: ['patient','diagnosis','treatment','symptom','clinical','medical','health','disease','therapy','dosage'] },
  legal:      { label: 'محتوى قانوني', keywords: ['court','legal','law','statute','regulation','complaint','defendant','plaintiff','jurisdiction'] },
  news:       { label: 'خبر/مقال إخباري', keywords: ['breaking','report','according to','officials','said','announced','confirmed'] },
  academic:   { label: 'بحث أكاديمي', keywords: ['abstract','methodology','findings','conclusion','hypothesis','research','study','experiment','data'] },
  general:    { label: 'عام', keywords: [] },
};
```

### Domain-Based Detection

```javascript
const DOMAIN_HINTS = {
  'github.com':       'technical',
  'stackoverflow.com':'technical',
  'medium.com':       'general',    // Could be any type
  'arxiv.org':        'academic',
  'pubmed.ncbi.nlm.nih.gov': 'medical',
  'nature.com':       'academic',
  'sciencedirect.com':'academic',
  'news.google.com':  'news',
  'bbc.com':          'news',
  'cnn.com':          'news',
  'wikipedia.org':    'general',
};
```

### Context Object Shape

```javascript
{
  contentType: 'technical',        // Detected type
  confidence: 0.85,                // 0-1 confidence score
  domain: 'github.com',            // Source domain
  title: 'React Hooks Guide',      // Extracted from URL/text if available
  language: 'en',                  // Detected source language
  suggestedPrompt: '...',          // Generated system prompt for Gemini
  metadata: {                      // Additional context
    hasCodeBlocks: true,
    hasTechnicalTerms: true,
    wordCount: 1500,
  }
}
```

### System Prompts by Content Type

```javascript
const SYSTEM_PROMPTS = {
  technical: `You are translating a technical article. Preserve:
- Code blocks exactly as-is (do not translate code)
- Technical terms: keep English in parentheses after Arabic translation on first use
- URLs and links unchanged
- Formatting (headings, lists, emphasis)
- API names, function names, library names as-is
Natural Arabic style, not stiff/robotic.`,

  code: `You are translating code comments and documentation.
- Code itself: DO NOT translate
- Comments: translate to natural Arabic
- Variable names, function names: keep as-is
- README-style docs: translate fully, keep code blocks unchanged`,

  medical: `You are translating medical/clinical content.
- Use standard Arabic medical terminology
- Keep drug names in original + Arabic: "Ibuprofen (إيبوبروفين)"
- Preserve measurement units
- Be precise — medical mistranslation can be dangerous
- Keep references/citations unchanged`,

  legal: `You are translating legal content.
- Use formal Arabic legal language
- Keep legal terms precise (not paraphrased)
- Preserve document structure and section numbering
- Keep case names, statute references unchanged`,

  news: `You are translating news content.
- Natural Arabic journalistic style
- Preserve quotes exactly
- Keep names of people and organizations unchanged
- Maintain objectivity in translation`,

  academic: `You are translating academic/research content.
- Use formal academic Arabic
- Keep technical terms with English in parentheses
- Preserve citation format
- Maintain logical structure and argumentation`,

  general: `You are translating general content.
- Natural, fluent Arabic
- Preserve meaning and tone
- Keep proper nouns unchanged
- Maintain paragraph structure`,
};
```

### Detection Algorithm

```javascript
function detectContext(url, text) {
  const domain = extractDomain(url);
  const textSample = (text || '').slice(0, 2000).toLowerCase();
  
  // 1. Check domain hints (highest confidence)
  const domainType = DOMAIN_HINTS[domain];
  if (domainType) {
    return { contentType: domainType, confidence: 0.9, ... };
  }
  
  // 2. Keyword scoring
  const scores = {};
  for (const [type, config] of Object.entries(CONTENT_TYPES)) {
    scores[type] = config.keywords.filter(kw => textSample.includes(kw)).length;
  }
  
  // 3. Code detection (high priority)
  const codePatterns = /(?:function|class|import|const|let|def|return|module|async|await|=>|<\/?[a-z]+>)/i;
  if (codePatterns.test(textSample)) scores.code += 5;
  
  // 4. Pick highest score
  const best = Object.entries(scores).sort((a,b) => b[1] - a[1])[0];
  const confidence = Math.min(0.95, 0.5 + best[1] * 0.1);
  
  return {
    contentType: best[1] > 0 ? best[0] : 'general',
    confidence,
    ...buildMetadata(textSample),
  };
}
```

## Acceptance Criteria

- [ ] `detectContext(url, text)` returns `{ contentType, confidence, suggestedPrompt, metadata }`
- [ ] Domain-based detection works for known domains (github, arxiv, pubmed, etc.)
- [ ] Keyword-based detection works for 6 content types
- [ ] Code detection has high priority (detects code blocks even in general articles)
- [ ] Each content type has a distinct, detailed system prompt
- [ ] System prompts are in English (for Gemini) but mention Arabic translation
- [ ] Confidence score is meaningful (0.5-0.95 range)
- [ ] Works with empty URL (text-only detection)
- [ ] Works with empty text (URL-only detection)

## Notes

- **Not an ML model**: This is rule-based detection (fast, no dependencies, no API calls)
- **Tuning**: Keyword lists can be expanded over time based on real usage
- **Fallback**: Always falls back to `general` type with low confidence
- **No external APIs**: Detection is pure local logic — no Gemini calls for detection itself
