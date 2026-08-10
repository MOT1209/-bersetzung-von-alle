# Task 03: الواجهة — وضع الملف + أزرار التصدير + اختيار المزوّد


## Status

complete


## Wave

1

## Description

إضافة الواجهة الأمامية لموجة 1: (1) وضع «📄 ترجمة ملف» جديد بجانب «ترجمة رابط» و
«ترجمة نص سريع» — سحب/إفلات أو تحميل ملف، تُكتشف صيغته تلقائياً، يُترجم ويُعرض،
(2) أزرار «تحميل» لتصدير النتيجة بأي صيغة مدعومة عبر `POST /api/export`، (3) قائمة
«المحرك المفضّل» في نافذة الإعدادات تعرض مزوّدات `GET /api/providers` مع حالتها،
والمزوّد المختار يُرسل مع كل طلب ترجمة، (4) حقول إعدادات جديدة لمفاتيح DeepL/OpenAI.
الكل RTL عربي وفق DESIGN.md (خط Cairo، `--primary`، داكن/فاتح).

## Dependencies

**Depends on:** None (Wave 1) — لكن يبني على نقاط API التي تنشئها
task-01-provider-registry وtask-02-file-import-export؛ نفّذ الاثنتان أولاً أو
اعتمد الشكل المتفق عليه في المواصفة (متطابق).
**Blocks:** task-04-integration-docs

**Context from dependencies:**
- `GET /api/providers` يعيد `{ providers: [{id,label,requiresKey,available}], defaultOrder }`
- `POST /api/translate-file` body `{ format, content(base64), targetLang?, sourceLang?, provider? }`
  → `{ format, translated, segments?, structure?, stats }`
- `POST /api/export` body `{ format, text?, segments?, structure?, filename? }` → ملف attachment
- `POST /api/translate` و`/api/translate-text` يقبلان `provider` اختيارياً
- `GET /api/settings` يعيد حقولاً جديدة: `deeplKey` (مقنّع), `hasDeeplKey`,
  `openaiKey`, `hasOpenaiKey`, `openaiBaseUrl`, `openaiModel`, `providerOrder`
- `POST /api/settings` يقبل `DEEPL_API_KEY, OPENAI_API_KEY, OPENAI_BASE_URL,
  OPENAI_MODEL, PROVIDER_ORDER`

## Files to Modify

- `public/index.html` — زر وضع ملف + منطقة إفلات + أزرار تصدير + حقول إعدادات جديدة
- `public/script.js` — منطق وضع الملف + التصدير + المزوّد المفضّل + إعدادات جديدة
- `public/style.css` — أنماط (متابعة DESIGN.md)

## Technical Details

### 1) وضع «ملف» في `index.html`

نمط التبديل الحالي: `.mode-btn` بـ `data-mode="url"|"text"` (سطر 43-45) و`div#url-mode`/
`div#text-mode` (سطر 51-58) بنمط `hidden`. أضف:

```html
<button type="button" class="mode-btn" data-mode="file" role="tab" aria-selected="false">📄 ترجمة ملف</button>
```

وداخل البطاقة (بعد `div#text-mode`):

```html
<div id="file-mode" class="field" hidden>
  <div id="drop-zone" class="drop-zone" tabindex="0" role="button" aria-label="اضغط أو أسقط ملفاً هنا">
    <input type="file" id="file-input" class="file-input" hidden
           accept=".txt,.md,.docx,.xlsx,.csv,.srt,.vtt,.json,.xml,.epub,.pptx">
    <p id="drop-text">📄 اسحب الملف هنا أو اضغط للاختيار</p>
    <p id="file-meta" class="file-meta" hidden></p>
  </div>
  <p id="file-format-line" class="file-format-line" hidden></p>
</div>
```

زر الترجمة `#translate-btn` الحالي يشغّل الوضع النشط (راجع `runTranslate()` —
وسّعه أو أضف فرعاً لـ file).

### 2) منطق `script.js`

**تبديل الأوضاع**: عدّل دالة تبديل الأوضاع الحالية (حوالي سطر 11-13:
`modeBtns`/`urlModeEl`/`textModeEl`) لتشمل `fileModeEl = document.getElementById('file-mode')`.

**اختيار/إفلات الملف**:
```js
function handleFile(file) {
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const ok = ['txt','md','docx','xlsx','csv','srt','vtt','json','xml','epub','pptx'];
  if (!ok.includes(ext)) { showToast('صيغة الملف غير مدعومة'); return; }
  state.file = { name: file.name, ext, base64: '' };
  // قراءة base64: FileReader.readAsDataURL → split(',')[1]
  const reader = new FileReader();
  reader.onload = () => {
    state.file.base64 = String(reader.result).split(',')[1] || '';
    document.getElementById('file-meta').textContent = `${file.name} (${formatSize(file.size)})`;
    // أظهر سطر الصيغة المكتشفة: "الصيغة المكتشفة: DOCX"
  };
  reader.readAsDataURL(file);
}
// events: click على drop-zone → file-input.click()؛
// dragenter/dragover → preventDefault + class .dragover؛ drop → files[0]
// change على file-input → handleFile
```
`formatSize(bytes)` — دالة مساعدة صغيرة (KB/MB) عربية.

**`runTranslate()`**: أضف فرعاً: إذا كان الوضع النشط `file`:
```js
if (!state.file || !state.file.base64) { showToast('اختر ملفاً أولاً'); return; }
const body = {
  format: state.file.ext,
  content: state.file.base64,
  targetLang: selectedTargetLang(),          // نفس منطق اللغات الحالي
  provider: localStorage.getItem('preferredProvider') || undefined,
};
const data = await postJson('/api/translate-file', body);
renderFileResult(data);
```
استخدم `showProgress('جاري فتح الملف…')` ثم `'جاري الترجمة…'` ثم `'تمت الترجمة ✓'`
(الأنماط الحالية موجودة: `showProgress`/`hideProgress`).

**`renderFileResult(data)`**:
- إن وُجد `data.segments` (ترجمات): اعرض قائمة بمقاطع مترجمة بتنسيق `00:01` لكل سطر
  (مثل عرض الترجمة الحالي ليوتيوب — أعد استخدام `formatClock` إن وُجدت) — النص
  المترجم الكامل = `data.translated`
- وإلا: اعرض `data.translated` في التبويب «الترجمة» و`data.original`؟ (المصدر غير
  متاح من الرد — اعرض `data.translated` فقط، مع ملاحظة الصيغة)
- خزّن `state.resultForExport = data` (لأزرار التصدير)
- أظهر صف أزرار التصدير: TXT / MD / DOCX / SRT / VTT / JSON / CSV / XML — اخفِ
  غير المناسب (SRT/VTT فقط عند segments؛ JSON/XML فقط عند `structure`؛ البقية دائماً)
- مرر `data.translated` للتبويبات الحالية (`renderTab`): النص المترجم يذهب لتبويب
  «الترجمة»، ويمكن وضع `data.translated` نفسه كـ original عرضياً؟ لا — الأفضل:
  إن وُجد `data.originalText` من الرد؟ **غير موجود** — لذا: تبويب «النص الأصلي»
  يُخفى في وضع الملف، أو اعرض نصاً مستخرجاً: عدّل الرد؟ **لا تعدّل الواجهة الخلفية
  في هذه المهمة** — اكتفِ بعرض الترجمة + زر النسخ + أزرار التصدير.

**أزرار التصدير**:
```js
async function exportResult(fmt) {
  const r = state.resultForExport;
  const body = { format: fmt };
  if (r.segments && (fmt === 'srt' || fmt === 'vtt')) body.segments = r.segments;
  else if (r.structure && (fmt === 'json' || fmt === 'xml')) body.structure = r.structure;
  else body.text = r.translated;
  body.filename = `translated.${fmt}`;
  const res = await fetch('/api/export', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = body.filename;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('تم تنزيل الملف');
}
```
(فكّر في اسم ملف أصلي: `state.file.name` → `name + '.' + fmt` إن وُجد.)

**المزوّد المفضّل في الإعدادات** (داخل `openSettings()` الحالي):
- عند فتح الإعدادات: `fetch('/api/providers')` → املأ `<select id="preferred-provider">`:
  خيار `''` = «تلقائي (سلسلة الاحتياط)» + كل مزوّد
  `<option value="id">label (متاح/يتطلب مفتاح)</option>` — `available ? '✓ متاح' :
  'يتطلب مفتاحاً'` (باستخدام الحقول من الرد)
- القيمة المحفوظة: `localStorage.getItem('preferredProvider')`
- عند الحفظ: `localStorage.setItem('preferredProvider', value)` (أو remove عند '')
- يُرسل `provider` في أجسام `POST /api/translate` و`/api/translate-text` (أضفه في
  `postJson` للترجمة — أينما يُبنى body الترجمة) و`/api/translate-file` (فوق)

**حقول إعدادات جديدة** (في `#settings-modal`): أضف بعد الحقول الحالية (Gemini...):
- `DEEPL_API_KEY` (input نصي، placeholder «مفتاح DeepL المجاني (اختياري)»)
- `OPENAI_API_KEY` (نصي)
- `OPENAI_BASE_URL` (نصي dir=ltr placeholder `http://localhost:11434/v1`)
- `OPENAI_MODEL` (نصي dir=ltr placeholder `qwen2.5:7b`)
- `PROVIDER_ORDER` (نصي dir=ltr placeholder `google,mymemory,libre,gemini`)
- في `saveSettings()`: اجمعها في body بأسماء **المفاتيح الكبيرة** (نمط
  `saveSettings` الحالي — راجع كيف يُرسل Gemini حالياً) وأرسلها عبر
  `POST /api/settings`؛ وفي `openSettings()` املأها من `GET /api/settings`
  (الحقول الجديدة بأسمائها camelCase كما في الرد)

### 3) أنماط `style.css`

متبعة DESIGN.md (راجع الملف): متغيرات `--primary`, `--bg-card`, الخط Cairo، RTL.
أضف:
- `.drop-zone`: حدود متقطعة `2px dashed var(--primary)`، نصف قطر، padding،
  hover/dragover يغيّر الخلفية، تركيز `:focus-visible` (إمكانية وصول)
- `.file-meta`, `.file-format-line`: نص صغير ثانوي
- `.export-row`: صف أزرار صغيرة (`display:flex; flex-wrap:wrap; gap`)
- `.mode-btn.active` موجود — تأكد أن الزر الثالث يطابق النمط
- خيارات select الإعدادات الجديدة: نمط موجود `.settings-field`/`.input`

### إمكانية الوصول

- كل الأزرار الجديدة `type="button"` مع `aria-label` عربي
- `drop-zone` قابل للتركيز عبر لوحة المفاتيح (Enter/Space يفتح اختيار الملف)
- النصوص الطويلة المترجمة تُعرض في نفس حاوية النتيجة الحالية (تمرير عمودي موجود)

## Acceptance Criteria

- [ ] ثلاثة أوضاع (رابط/نص/ملف) تعمل والتبديل سليم RTL
- [ ] سحب/إفلات واختيار ملف docx/srt/xlsx/json → تظهر الترجمة وأزرار التصدير
- [ ] زر تحميل TXT ينزّل الملف عبر `/api/export`؛ وSRT عند وجود ترجمات
- [ ] قائمة «المحرك المفضّل» في الإعدادات تعرض المزوّدات من `/api/providers` مع
  حالتها وتُحفظ في localStorage وتُرسل مع الطلبات
- [ ] حقول DeepL/OpenAI في الإعدادات تُحفظ عبر `/api/settings`
- [ ] لا نصوص إنجليزية ظاهرة في الواجهة؛ كل الرسائل عربية
- [ ] `npm run check` سليم (script.js صياغة صحيحة)
- [ ] الاختبار اليدوي: `node server/server.js` ثم افتح `http://localhost:3000` —
  ترجم ملف txt وsrt وحمّل النتيجة (سيتحقق منه المنسّق في task-04)

## Notes

- ⚠️ **جلسة موازية نشطة تعدّل `public/script.js` و`public/index.html` و`public/style.css`
  (ترجمة ذكية + PWA)**: أعد قراءة كل ملف من القرص قبل التعديل، أضف بجانب الكود
  الموجود ولا تحذف أي شيء (مثل `smart-btn`/`#translate-smart`/sw registration).
  لا تنفّذ git add/commit/clean.
- لا تلمس `public/sw.js` و`public/manifest.webmanifest` و`public/icons/` — أعمال
  الجلسة الموازية.
- لا تغيّر `DESIGN.md` ولا تنشئ أنماطاً مخالفة لمتغيراته.
- استخدم `postJson` الحالية (موجودة) للطلبات، و`mapError`/`showError` لرسائل الخطأ
  العربية.
- لا تقم بـ `npm install`.
