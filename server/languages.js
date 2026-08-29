// server/languages.js — قائمة لغات Google المدعومة (~130) مع الأسماء العربية
// تُستخدم في زر اختيار اللغة بالواجهة (عبر GET /api/languages) وللعرض.
const LANGUAGES = [
  { code: 'af', nameAr: 'الأفريكانية' },
  { code: 'sq', nameAr: 'الألبانية' },
  { code: 'am', nameAr: 'الأمهرية' },
  { code: 'ar', nameAr: 'العربية' },
  { code: 'hy', nameAr: 'الأرمنية' },
  { code: 'as', nameAr: 'الآسامية' },
  { code: 'ay', nameAr: 'الأيمرية' },
  { code: 'az', nameAr: 'الأذربيجانية' },
  { code: 'bm', nameAr: 'البامبارية' },
  { code: 'eu', nameAr: 'الباسكية' },
  { code: 'be', nameAr: 'البيلاروسية' },
  { code: 'bn', nameAr: 'البنغالية' },
  { code: 'bho', nameAr: 'البهوجبرية' },
  { code: 'bs', nameAr: 'البوسنية' },
  { code: 'bg', nameAr: 'البلغارية' },
  { code: 'ca', nameAr: 'الكتالانية' },
  { code: 'ceb', nameAr: 'السيبوانية' },
  { code: 'zh-CN', nameAr: 'الصينية (المبسطة)' },
  { code: 'zh-TW', nameAr: 'الصينية (التقليدية)' },
  { code: 'co', nameAr: 'الكورسيكية' },
  { code: 'hr', nameAr: 'الكرواتية' },
  { code: 'cs', nameAr: 'التشيكية' },
  { code: 'da', nameAr: 'الدنماركية' },
  { code: 'dv', nameAr: 'الديفهية' },
  { code: 'doi', nameAr: 'الدوغرية' },
  { code: 'nl', nameAr: 'الهولندية' },
  { code: 'en', nameAr: 'الإنجليزية' },
  { code: 'eo', nameAr: 'الإسبرانتو' },
  { code: 'et', nameAr: 'الإستونية' },
  { code: 'ee', nameAr: 'الإيوية' },
  { code: 'fil', nameAr: 'الفلبينية' },
  { code: 'fi', nameAr: 'الفنلندية' },
  { code: 'fr', nameAr: 'الفرنسية' },
  { code: 'fy', nameAr: 'الفريزية' },
  { code: 'gl', nameAr: 'الجاليكية' },
  { code: 'ka', nameAr: 'الجورجية' },
  { code: 'de', nameAr: 'الألمانية' },
  { code: 'el', nameAr: 'اليونانية' },
  { code: 'gn', nameAr: 'الغوارانية' },
  { code: 'gu', nameAr: 'الغوجاراتية' },
  { code: 'ht', nameAr: 'الكريولية الهايتية' },
  { code: 'ha', nameAr: 'الهوسا' },
  { code: 'haw', nameAr: 'هاواي' },
  { code: 'he', nameAr: 'العبرية' },
  { code: 'hi', nameAr: 'الهندية' },
  { code: 'hmn', nameAr: 'الهمونغية' },
  { code: 'hu', nameAr: 'المجرية' },
  { code: 'is', nameAr: 'الآيسلندية' },
  { code: 'ig', nameAr: 'الإيغبو' },
  { code: 'ilo', nameAr: 'إيلوكو' },
  { code: 'id', nameAr: 'الإندونيسية' },
  { code: 'ga', nameAr: 'الأيرلندية' },
  { code: 'it', nameAr: 'الإيطالية' },
  { code: 'ja', nameAr: 'اليابانية' },
  { code: 'jv', nameAr: 'الجاوية' },
  { code: 'kn', nameAr: 'الكنادية' },
  { code: 'kk', nameAr: 'الكازاخستانية' },
  { code: 'km', nameAr: 'الخميرية' },
  { code: 'rw', nameAr: 'الكينيارواندية' },
  { code: 'gom', nameAr: 'الكونكانية' },
  { code: 'ko', nameAr: 'الكورية' },
  { code: 'kri', nameAr: 'الكريو' },
  { code: 'ku', nameAr: 'الكردية' },
  { code: 'ckb', nameAr: 'الكردية (السورانية)' },
  { code: 'ky', nameAr: 'القيرغيزية' },
  { code: 'lo', nameAr: 'اللاوية' },
  { code: 'la', nameAr: 'اللاتينية' },
  { code: 'lv', nameAr: 'اللاتفية' },
  { code: 'ln', nameAr: 'لينغالا' },
  { code: 'lt', nameAr: 'الليتوانية' },
  { code: 'lg', nameAr: 'لوغندا' },
  { code: 'lb', nameAr: 'اللوكسمبورغية' },
  { code: 'mk', nameAr: 'المقدونية' },
  { code: 'mai', nameAr: 'المايثيلية' },
  { code: 'mg', nameAr: 'الملغاشية' },
  { code: 'ms', nameAr: 'الملايوية' },
  { code: 'ml', nameAr: 'المالايالامية' },
  { code: 'mt', nameAr: 'المالطية' },
  { code: 'mi', nameAr: 'الماورية' },
  { code: 'mr', nameAr: 'الماراثية' },
  { code: 'mni', nameAr: 'ميتي (مانيبورية)' },
  { code: 'mn', nameAr: 'المنغولية' },
  { code: 'my', nameAr: 'البورمية' },
  { code: 'ne', nameAr: 'النيبالية' },
  { code: 'no', nameAr: 'النرويجية' },
  { code: 'ny', nameAr: 'تشيتشيوا' },
  { code: 'or', nameAr: 'الأوريا' },
  { code: 'om', nameAr: 'الأورومو' },
  { code: 'ps', nameAr: 'الباشتو' },
  { code: 'fa', nameAr: 'الفارسية' },
  { code: 'pl', nameAr: 'البولندية' },
  { code: 'pt', nameAr: 'البرتغالية' },
  { code: 'pa', nameAr: 'البنجابية' },
  { code: 'qu', nameAr: 'الكيشوا' },
  { code: 'ro', nameAr: 'الرومانية' },
  { code: 'ru', nameAr: 'الروسية' },
  { code: 'sm', nameAr: 'الساموية' },
  { code: 'sa', nameAr: 'السنسكريتية' },
  { code: 'gd', nameAr: 'الغيلية الاسكتلندية' },
  { code: 'nso', nameAr: 'السوثو الشمالية' },
  { code: 'sr', nameAr: 'الصربية' },
  { code: 'st', nameAr: 'السيسوتو' },
  { code: 'sn', nameAr: 'الشونا' },
  { code: 'sd', nameAr: 'السندية' },
  { code: 'si', nameAr: 'السنهالية' },
  { code: 'sk', nameAr: 'السلوفاكية' },
  { code: 'sl', nameAr: 'السلوفينية' },
  { code: 'so', nameAr: 'الصومالية' },
  { code: 'es', nameAr: 'الإسبانية' },
  { code: 'su', nameAr: 'السوندانية' },
  { code: 'sw', nameAr: 'السواحلية' },
  { code: 'sv', nameAr: 'السويدية' },
  { code: 'tg', nameAr: 'الطاجيكية' },
  { code: 'ta', nameAr: 'التاميلية' },
  { code: 'tt', nameAr: 'التترية' },
  { code: 'te', nameAr: 'التيلوغوية' },
  { code: 'th', nameAr: 'التايلاندية' },
  { code: 'ti', nameAr: 'التيغرينية' },
  { code: 'ts', nameAr: 'التسونجا' },
  { code: 'tr', nameAr: 'التركية' },
  { code: 'tk', nameAr: 'التركمانية' },
  { code: 'ak', nameAr: 'الأكانية' },
  { code: 'uk', nameAr: 'الأوكرانية' },
  { code: 'ur', nameAr: 'الأردية' },
  { code: 'ug', nameAr: 'الأويغورية' },
  { code: 'uz', nameAr: 'الأوزبكية' },
  { code: 'vi', nameAr: 'الفيتنامية' },
  { code: 'cy', nameAr: 'الويلزية' },
  { code: 'xh', nameAr: 'الكوسية' },
  { code: 'yi', nameAr: 'اليديشية' },
  { code: 'yo', nameAr: 'اليوروبية' },
  { code: 'zu', nameAr: 'الزولوية' },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

// اللغات التي يقبلها محرّك النطق (gTTS / translate_tts) — مجموعة أصغر بكثير من
// لغات الترجمة أعلاه. الخلط بينهما يعني نطقًا يفشل صامتًا: gTTS يردّ بخطأ HTTP
// للغة لا يعرفها، فيصل المستخدم صوتٌ فارغ بلا تفسير.
const TTS_LANGS = new Set([
  'af', 'ar', 'bg', 'bn', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'eo',
  'es', 'et', 'fi', 'fil', 'fr', 'gu', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'is',
  'it', 'ja', 'jv', 'km', 'kn', 'ko', 'la', 'lv', 'mk', 'ml', 'mr', 'ms', 'my',
  'ne', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'si', 'sk', 'sq', 'sr', 'su', 'sv',
  'sw', 'ta', 'te', 'th', 'tr', 'uk', 'ur', 'vi', 'zh-CN', 'zh-TW',
]);

/**
 * إرجاع قائمة اللغات الكاملة (للـ GET /api/languages).
 * كل لغة تحمل `tts` لتعرف الواجهة أيّ اللغات تصلح للنطق/الدبلجة — مصدر واحد
 * للحقيقة بدل تكرار القائمة في الواجهة.
 */
function getAllLanguages() {
  return LANGUAGES.map((l) => ({ ...l, tts: TTS_LANGS.has(l.code) }));
}

/** تحقق من أن رمز اللغة مدعوم */
function isSupportedLang(code) {
  return BY_CODE.has(code);
}

/** تحقق من أن رمز اللغة يدعمه محرّك النطق (أضيق من isSupportedLang) */
function isTtsSupported(code) {
  return TTS_LANGS.has(code);
}

/** إرجاع الاسم العربي لرمز لغة (للشاشة) */
function langName(code) {
  const l = BY_CODE.get(code);
  return l ? l.nameAr : code;
}

module.exports = { getAllLanguages, isSupportedLang, isTtsSupported, langName, LANGUAGES, TTS_LANGS };
