# DEPLOY_NOTES.md — ملاحظات النشر

تغييرات هذا الفرع (`feature/translation-improvements`) وما يلزم للنشر.

## 1) مسارات القواميس — ملفات ثابتة، لا مسارات API

- القواميس النموذجية في `public/locales/en.json` و`public/locales/ar.json`.
- يُخدمان عبر `express.static` الموجود أصلًا في `server/server.js` (الصف 137 تقريبًا) —
  **لا حاجة لأي تعديل على الخادم**؛ أي ملف تحت `public/` يُخدَم تلقائيًا على `/locales/...`.
- خادمات ستاتيك أخرى (Nginx/Caddy أمام Node): لا شيء مطلوب أيضًا، الملفات جزء من
  مجلد `public` المنشور.

## 2) CORS

- الواجهة تجلب القاموس النموذجي بنفس الأصل (`fetch('/locales/...')`) — خارج نطاق CORS
  أصلًا. الإعداد الافتراضي الآمن (`CORS_ORIGIN` فارغ = نفس الأصل) يعمل كما هو.
- إن فتحت الواجهة على نطاق مختلف عن الخادم (نشر منفصل frontend/backend): أضِف أصل
  الواجهة إلى `CORS_ORIGIN` كما في README (قسم الأمان) — لا جديد خاص بهذه الميزة.

## 3) رأس Content-Type للـ JSON

- `express.static` يرسل `application/json` لامتداد `.json` تلقائيًا. على Nginx تأكد من
  `include mime.types;` (الافتراضي يفعل) وإلا فشل `res.json()` في المتصفح.

## 4) Service Worker (PWA)

- `public/sw.js` يخزّن مسبقًا قائمة ملفات محددة. القواميس **ليست** في قائمة التخزين
  المسبق عمدًا — فهي قابلة للتحديث ومحتواها يتغير بإضافة المستخدم قواميسه.
- إن أردت توفّرها دون اتصال: أضِف `'/locales/en.json'` و`'/locales/ar.json'` إلى قائمة
  `CACHE` في `sw.js` وارفع رقم الإصدار. (اختياري؛ سلوك الشبكة-أولاً مقبول.)

## 5) حدود الاستيراد (من جهة المتصفح — لا شيء على الخادم)

- حد حجم الملف 2MB وحد المدخلات 20000 مُطبَّقان في `public/js/features.js` و
  `public/js/localEngine.mjs` قبل أي دمج. لا يرفع المستخدم أي شيء إلى الخادم —
  القاموس يعيش في `localStorage` للمتصفح ويُرسل مع كل طلب ترجمة كمسرد (`glossary`).
- حجم جسم الطلب على الخادم (`express.json` الحالي) يستوعب مسردًا بهذا الحد بسهولة؛
  إن ضُخّمت القواميس مستقبلًا فوق ~1000 مدخلة، راجع حد الجسم وحد المسرد في
  `routes-translate.js`.

## 6) لا هجرات ولا متغيرات بيئة جديدة

- لا تغييرات على قاعدة البيانات، ولا مفاتيح API جديدة، ولا متغيرات `.env` جديدة.
- `package.json`: أُضيف سكربت `lint:mjs` وتوسّع `test` ليشمل `tests/*.test.mjs` —
  CI الموجود (`.github/workflows/ci.yml`) يشغّل `npm run check && npm run lint &&
  npm test` فسيلتقطهما دون تعديل الملف. (ملاحظة: `npm run lint` وحده لا يشمل ملفات
  `.mjs`؛ إن أردت فرضها في CI استبدل خطوة lint بـ `npm run lint && npm run lint:mjs`.)

## 7) ملفات جديدة/معدلة في هذا الفرع

```text
public/js/localEngine.mjs     ← جديد: المحرك المحلي (وحدة ES نقية)
public/locales/en.json        ← جديد: قاموس نموذجي إن→عربي
public/locales/ar.json        ← جديد: قاموس نموذجي عربي→إن
public/index.html             ← تعديل: نموذج الاستيراد في نافذة الإعدادات
public/js/features.js         ← تعديل: منطق الاستيراد والدمج + اتجاه الفقرات
public/js/ui.js               ← تعديل: عناصر DOM للاستيراد
public/js/translate.js        ← تعديل: اتجاه فقرات البث (streaming)
public/js/result.js           ← تعديل: اتجاه فقرات النتيجة والمقارنة
public/js/media.js            ← تعديل: اتجاه نص الترجمة المتزامنة
public/style.css              ← تعديل: قواعد dir/unicode-bidi + حالة الاستيراد
tests/localEngine.test.mjs    ← جديد: 33 اختبار وحدة
tests/locales.test.js         ← جديد: 7 اختبارات تكامل
package.json                  ← تعديل: test + lint:mjs
README.md / TEST_CASES.md / DEPLOY_NOTES.md ← توثيق
```
