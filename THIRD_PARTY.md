# THIRD_PARTY — تراخيص التبعيات

تُولَّد يدويًا من `package.json` وحقول `license` في `node_modules` (البند 45).
حُدِّثت: 2026-09-08.

AraLink نفسه تحت رخصة المستودع. القائمة أدناه للتبعيات المباشرة فقط — التبعيات
غير المباشرة تتبع رخص جذورها، ويكشفها `npm ls --all`.

## تبعيات إنتاج

| الحزمة | النسخة المطلوبة | الرخصة |
|---|---|---|
| `@xenova/transformers` | ^2.17.2 | Apache-2.0 |
| `cheerio` | ^1.0.0 | MIT |
| `compression` | ^1.8.1 | MIT |
| `cors` | ^2.8.5 | MIT |
| `docx` | ^9.7.1 | MIT |
| `dotenv` | ^16.4.5 | BSD-2-Clause |
| `exceljs` | ^4.4.0 | MIT |
| `express` | ^4.21.2 | MIT |
| `fast-xml-parser` | ^5.10.1 | MIT |
| `helmet` | ^8.3.0 | MIT |
| `jszip` | ^3.10.1 | (MIT OR GPL-3.0-or-later) |
| `mammoth` | ^1.12.1 | BSD-2-Clause |
| `sherpa-onnx` | ^1.13.4 | Apache-2.0 |
| `tesseract.js` | ^7.0.0 | Apache-2.0 |
| `undici` | ^7.29.0 | MIT |
| `youtube-transcript` | ^1.2.1 | MIT |

## تبعيات اختيارية

| الحزمة | النسخة المطلوبة | الرخصة |
|---|---|---|
| `redis` | ^4.7.1 | MIT |
| `youtube-dl-exec` | ^3.1.9 | (غير مثبَّتة محليًا) |

## تبعيات تطوير

| الحزمة | النسخة المطلوبة | الرخصة |
|---|---|---|
| `eslint` | ^10.9.1 | MIT |

## ملاحظات

- `sherpa-onnx` و`@xenova/transformers` يجلبان نماذج/ثنائيات وقت التشغيل؛
  لنماذجها رخصها الخاصة المنفصلة عن رخصة الحزمة.
- `youtube-dl-exec` اختيارية ويغلّف ثنائي `yt-dlp` (Unlicense) الذي يُنزَّل
  عند التثبيت أو يُوفَّر عبر `YTDLP_PATH`.
- تحقّق من التحديثات: `npx license-checker --summary` أو `npm ls --all`.
