/* ---------- ثوابتARA-LINK ---------- */
export const EXPORT_FORMATS = [
  { fmt: 'srt', label: '↓ SRT', mime: 'text/plain;charset=utf-8' },
  { fmt: 'vtt', label: '↓ VTT', mime: 'text/vtt;charset=utf-8' },
  { fmt: 'txt', label: '↓ TXT', mime: 'text/plain;charset=utf-8' },
  { fmt: 'json', label: '↓ JSON', mime: 'application/json;charset=utf-8' },
  { fmt: 'xml', label: '↓ XML', mime: 'application/xml;charset=utf-8' },
];

export const MESSAGES = {
  'missing-url':           'الرجاء إدخال رابط موقع أو فيديو يوتيوب',
  'invalid-url':           'صيغة الرابط غير صحيحة — تأكد من بدء الرابط بـ http:// أو https://',
  'url-not-allowed':       'هذا النطاق غير مدعوم حاليًا',
  'unsupported-url':       'الرابط غير مدعوم — يُدعم يوتيوب والمواقع الإخبارية والمدونات فقط',
  'unsupported-file-type': 'صيغة الملف غير مدعومة — يُدعم PDF وWord وPowerPoint وملفات النصوص فقط',
  'file-too-large':        'حجم الملف يتجاوز الحد الأقصى (50 ميغابايت)',
  'missing-lang':          'الرجاء اختيار لغة الهدف',
  'missing-text':          'الرجاء إدخال نص للترجمة',
  'no-content':            'لم يتم استخراج محتوى من هذا الرابط — قد تكون الصفحة خالية أو محمية',
  'no-transcript':         'لا توجد ترجمة (transcript) لهذا الفيديو — تأكد من تفعيل الترجمة في فيديو يوتيوب',
  'video-download-failed': 'تعذر تنزيل فيديو يوتيوب — حاول فيديو أقصر أو لاحقًا',
  'video-too-long':        'فيديو يوتيوب طويل جدًا (≥ 6 ساعات) — يتجاوز الحد المسموح',
  'extract-failed':        'تعذر استخراج المحتوى من هذا الرابط',
  'tts-failed':            'تعذر تحويل النص إلى كلام — حاول لاحقًا',
  'ocr-empty':             'لم يتم استخراج أي نص من الصورة',
  'smart-unavailable':     'الترجمة الذكية غير متوفرة حاليًا — تحقق من إعدادات Gemini',
  'server-error':          'خطأ غير متوقع — حاول لاحقًا',
  'translate-failed':      'كل خدمات الترجمة رفضت الطلب (نفاد الحصة أو مفتاح غير صالح) — راجع مفاتيح .env أو أعد المحاولة بعد قليل',
  'parsing-error':         'حدث خطأ أثناء تحليل الاستجابة',
};

export const LANGUAGES = {
  'ar':  'العربية',
  'en':  'English',
  'fr':  'Français',
  'es':  'Español',
  'de':  'Deutsch',
  'tr':  'Türkçe',
  'ur':  'اردو',
  'fr-FR': 'Français (France)',
  'fr-CA': 'Français (Canada)',
};
