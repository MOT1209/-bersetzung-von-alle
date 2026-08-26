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
    // size-based rotation: if >5MB rotate before append
    try {
      const st = await fs.stat(file);
      if (st.size > 5 * 1024 * 1024) {
        const rotated = file.endsWith('.log') ? file.replace(/\.log$/, '.1.log') : `${file}.1`;
        try {
          await fs.rename(file, rotated);
        } catch (e) {
          if (e && (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY')) {
            await fs.copyFile(file, rotated);
            await fs.rm(file, { force: true }).catch(() => {});
          } else if (e && e.code !== 'ENOENT') throw e;
        }
      }
    } catch (e) {
      if (e && e.code !== 'ENOENT') {
        // stat failed for other reason — ignore and try append anyway
      }
    }
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
