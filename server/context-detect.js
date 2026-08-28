// server/context-detect.js — محرك اكتشاف نوع المحتوى وسياقه

const CONTENT_TYPES = {
  technical: {
    label: 'مقال تقني',
    keywords: ['tutorial','guide','api','documentation','github','stackoverflow','npm','python','javascript','react','docker','install','config','setup','deploy','code','repo','branch','commit','merge'],
  },
  code: {
    label: 'كود برمجي',
    keywords: ['function','class','import','const','let','def','return','module','async','await','=>','try','catch','throw','new ','this.','console.','print(','elif','else:'],
  },
  medical: {
    label: 'محتوى طبي',
    keywords: ['patient','diagnosis','treatment','symptom','clinical','medical','health','disease','therapy','dosage','doctor','hospital','medicine','prescription','chronic','acute'],
  },
  legal: {
    label: 'محتوى قانوني',
    keywords: ['court','legal','law','statute','regulation','complaint','defendant','plaintiff','jurisdiction','contract','agreement','clause','liable','negligence','tort'],
  },
  news: {
    label: 'خبر/مقال إخباري',
    keywords: ['breaking','report','according to','officials','said','announced','confirmed','denied','statement','press','minister','government','election','crisis'],
  },
  academic: {
    label: 'بحث أكاديمي',
    keywords: ['abstract','methodology','findings','conclusion','hypothesis','research','study','experiment','data','results','analysis','paper','journal','doi','citation'],
  },
  general: {
    label: 'عام',
    keywords: [],
  },
};

const DOMAIN_HINTS = {
  'github.com': 'technical',
  'stackoverflow.com': 'technical',
  'medium.com': 'general',
  'arxiv.org': 'academic',
  'pubmed.ncbi.nlm.nih.gov': 'medical',
  'nature.com': 'academic',
  'sciencedirect.com': 'academic',
  'news.google.com': 'news',
  'bbc.com': 'news',
  'cnn.com': 'news',
  'wikipedia.org': 'general',
  'dev.to': 'technical',
  'hackernews.com': 'technical',
  'reddit.com': 'general',
  'youtube.com': 'general',
};

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

function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function detectContext(url, text) {
  const domain = extractDomain(url || '');
  const textSample = (text || '').slice(0, 2000).toLowerCase();

  // 1. Domain-based detection (highest confidence)
  const domainType = DOMAIN_HINTS[domain];
  if (domainType && domainType !== 'general') {
    return {
      contentType: domainType,
      confidence: 0.9,
      domain,
      suggestedPrompt: SYSTEM_PROMPTS[domainType],
      metadata: buildMetadata(textSample),
    };
  }

  // 2. Keyword scoring
  const scores = {};
  for (const [type, config] of Object.entries(CONTENT_TYPES)) {
    scores[type] = config.keywords.filter(kw => matchesKeyword(textSample, kw)).length;
  }

  // 3. Code detection (high priority)
  // حدود الكلمات إلزامية هنا: بدونها كانت جملٌ إنجليزية عادية تُصنَّف «كودًا»
  // لأن الكلمة المحجوزة تقع داخل كلمة عادية — const في "constant"، وimport في
  // "important"، وlet في "completely"، وdef في "defendant". النتيجة توجيه ترجمة
  // خاطئ لنصوص قانونية وطبية شائعة.
  const codePatterns = /\b(?:function|class|import|const|let|def|return|module|async|await)\b|=>|<\/?[a-z]+>/i;
  if (codePatterns.test(textSample)) scores.code += 5;

  // 4. Pick highest score
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestType, bestScore] = sorted[0];
  const confidence = Math.min(0.95, 0.5 + bestScore * 0.1);

  return {
    contentType: bestScore > 0 ? bestType : 'general',
    confidence: bestScore > 0 ? confidence : 0.5,
    domain,
    suggestedPrompt: SYSTEM_PROMPTS[bestScore > 0 ? bestType : 'general'],
    metadata: buildMetadata(textSample),
  };
}

// مطابقة كلمة مفتاحية: الكلمات الأبجدية الخالصة تحتاج حدود كلمة حتى لا تطابق
// داخل كلمة أطول (const داخل constant). أما المفاتيح التي تحمل رموزًا أو مسافة
// ('=>', 'this.', 'new ', 'print(') فتُطابَق نصًا كما هي — الرموز حدٌّ كافٍ.
const KEYWORD_RE_CACHE = new Map();
function matchesKeyword(sample, kw) {
  if (!/^[a-z]+$/i.test(kw)) return sample.includes(kw);
  let re = KEYWORD_RE_CACHE.get(kw);
  if (!re) {
    re = new RegExp(`\\b${kw}\\b`, 'i');
    KEYWORD_RE_CACHE.set(kw, re);
  }
  return re.test(sample);
}

function buildMetadata(textSample) {
  return {
    hasCodeBlocks: /```[\s\S]*?```/.test(textSample) || /(?:function|class|import|const|let|def)/.test(textSample),
    hasTechnicalTerms: /(?:api|sdk|npm|docker|kubernetes|aws|azure)/i.test(textSample),
    wordCount: textSample.split(/\s+/).filter(Boolean).length,
  };
}

function getContextPrompt(context) {
  return context.suggestedPrompt || SYSTEM_PROMPTS.general;
}

module.exports = { detectContext, getContextPrompt, CONTENT_TYPES, SYSTEM_PROMPTS };
