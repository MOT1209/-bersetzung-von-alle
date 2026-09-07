// server/providers/translation/endpoints.js — نقاط النهاية المشتركة
// GOOGLE_URL يستخدمه مزوّد الترجمة (google.js) وكاشف اللغة (translate.js) معًا،
// فيعيش هنا حتى لا ينحرف أحدهما عن الآخر عند أي تعديل.
module.exports = {
  GOOGLE_URL: 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=:tl&dt=t',
};
