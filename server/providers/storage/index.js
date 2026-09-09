// server/providers/storage/index.js — اختيار سائق التخزين
// اليوم سائقان: محلي (الافتراضي) وS3/R2 (اختياري). كل سائق يُنشئ بنفس الواجهة
// وبالمفاتيح لا المسارات، فلا يمسّ أي مستدعٍ (البند 40).
const config = require('../../config');
const { createLocalStorage } = require('./local');
const { createS3Storage } = require('./s3');

let shared = null;

function createStorage(opts = {}) {
  const driver = opts.driver || config.STORAGE_DRIVER || 'local';
  switch (driver) {
    case 'local':
      return createLocalStorage(opts);
    case 's3': {
      const s3 = createS3Storage(opts);
      // If S3 env is incomplete, fall back to local — broken env must never crash the app
      if (!s3.isAvailable()) {
        console.warn('[storage] STORAGE_DRIVER=s3 but S3 env vars incomplete — falling back to local');
        return createLocalStorage(opts);
      }
      return s3;
    }
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
