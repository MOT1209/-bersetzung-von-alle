# Action Required: Wave 1 — Providers + Files

لا توجد خطوات يدوية مطلوبة. كل شيء مجاني ويعمل تلقائياً:

- المزوّدات الافتراضية (Google / MyMemory / LibreTranslate) **بلا مفاتيح** — تعمل فوراً
- المزوّدات الاختيارية تُفعَّل **فقط إن وُجدت مفاتيح/إعدادات** في `.env`:
  - `DEEPL_API_KEY` — مفتاح DeepL **المجاني** (اختياري؛ يُؤخذ من deeple.com/pro-api مجاناً)
  - `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `OPENAI_MODEL` — لأي خادم متوافق OpenAI:
    - Ollama محلي: `OPENAI_BASE_URL=http://localhost:11434/v1` (بلا مفتاح) — مجاني 100%
    - LM Studio محلي: `OPENAI_BASE_URL=http://localhost:1234/v1` (بلا مفتاح) — مجاني 100%
    - OpenRouter/Groq: بمفاتيح مجانية (اختياري)
- بدون أي من هذه المفاتيح يظل النظام يعمل بكامل قوته عبر السلسلة المجانية الافتراضية.

الملفات المطلوب تعديلها يدوياً: **لا شيء**. كل الإعدادات عبر `.env`/`/api/settings`.

> الجلسة الموازية النشطة في المستودع قد تضيف مفاتيحها الخاصة — لا نمسح أي سطر في `.env`.
