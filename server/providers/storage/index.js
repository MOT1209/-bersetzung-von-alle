// server/providers/storage/index.js — اختيار سائق التخزين
// اليوم سائق واحد (محلي). إضافة S3/R2/Supabase = ملف جديد + فرع هنا،
// بلا لمس أي مستدعٍ لأن الجميع يتعامل بمفاتيح لا بمسارات (البند 40).
const config = require('../../config');
const { createLocalStorage } = require('./local');

let shared = null;

function createStorage(opts = {}) {
  const driver = opts.driver || config.STORAGE_DRIVER || 'local';
  switch (driver) {
    case 'local':
      return createLocalStorage(opts);
    default: {
      const e = new Error('unknown-storage-driver: ' + driver);
      e.code = 'unknown-storage-driver';
      throw e;
    }
  }
}

// النسخة المشتركة للتطبيق
function storage() {
  if (!shared) shared = createStorage();
  return shared;
}

module.exports = { createStorage, storage };
