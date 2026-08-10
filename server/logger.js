// server/logger.js — سجل أخطاء بسيط بملف نصي مع توقيت (cache/errors.log)
// يُكتب فقط عند فشل محرك/خدمة — يعرفك أي محرك يخذلك في الإنتاج
const fs = require('fs/promises');
const path = require('path');

function logFile() {
  return process.env.LOG_FILE || path.join(__dirname, '..', 'cache', 'errors.log');
}

async function logError(context, message) {
  try {
    const line = `[${new Date().toISOString()}] ${context}: ${String(message || '').slice(0, 300)}\n`;
    const file = logFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, line, 'utf8');
  } catch {
    // لا نرمي أبدًا — السجل احتياطي ولا يجب أن يكسر الطلب
  }
}

// سجل معلوماتي (مثل نجاح الترجمة الذكية أو فشل ثم نجاح)
async function logInfo(context, message) {
  return logError(context, '[info] ' + message);
}

module.exports = { logError, logInfo };
