# عيّنات قياس التفريغ الصوتي

ضع هنا ملفات صوت قصيرة (١٠–٣٠ ثانية) مع `manifest.json`:

```json
[
  { "file": "ar-levantine-1.mp3", "lang": "ar", "reference": "النص الصحيح كما نُطق تمامًا" },
  { "file": "ar-msa-1.mp3",       "lang": "ar", "reference": "..." },
  { "file": "tr-1.mp3",           "lang": "tr", "reference": "..." },
  { "file": "de-1.mp3",           "lang": "de", "reference": "..." },
  { "file": "en-1.mp3",           "lang": "en", "reference": "..." }
]
```

ثم:

```bash
node scripts/bench-stt.js                             # كل العيّنات
node scripts/bench-stt.js --lang ar --verbose true    # مع عرض النص الناتج
node scripts/bench-stt.js --model Xenova/whisper-small  # مقارنة نموذج آخر
```

## من أين تجلب العيّنات

- Common Voice (يشمل ar / de / tr / en): https://hf.co/datasets/fsicoli/common_voice_22_0
- أو سجّل عيّناتك بنفسك — الأصدق، لأنها تشبه استخدامك الفعلي.

## الأهم

**أضف عيّنة شامية واحدة على الأقل.** اللهجات هي نقطة الضعف الحقيقية لا الفصحى،
والقياس على الفصحى وحدها يعطي أرقامًا متفائلة لا تمثّل حالتك.

ملفات الصوت غير مُودَعة في git (انظر .gitignore) — العيّنات ملكك.
