// scripts/check.js — فحص الصياغة لكل ملفات المشروع (يكتشفها تلقائيًا حتى لا تتقادم القائمة)
// يشمل الملفات في المجلدات الفرعية (مثل public/js) ويميّز وحدات ES من CommonJS.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const DIRS = ['server', 'public', 'scripts'];

// ملاحظة: لا نستخدم dirent.isFile() لأن OneDrive يعرض الملفات السحابية كـ reparse points،
// و statSync يتبعها ويرجع النوع الحقيقي.
function isFile(abs) {
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

// تجميع كل ملفات .js تحت مجلد معين بشكل متكرر
function collect(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const name of fs.readdirSync(abs)) {
    const child = path.join(abs, name);
    const rel = path.join(dir, name);
    if (isFile(child)) {
      if (name.endsWith('.js')) out.push(rel);
    } else {
      try {
        if (fs.statSync(child).isDirectory()) collect(rel, out);
      } catch { /* تجاهل */ }
    }
  }
  return out;
}

const files = DIRS.flatMap((d) => collect(d));
let failed = 0;

// هل الملف وحدة ES؟ نتجاهل التعليقات ونبحث عن import/export في المستوى الأعلى.
function isEsm(file) {
  const src = fs.readFileSync(path.join(root, file), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  return /\b(import\s|export\s)/m.test(src);
}

for (const file of files) {
  try {
    if (isEsm(file)) {
      // وحدات ES تحت package.json من نوع CommonJS: نفحصها عبر stdin بنمط module
      const src = fs.readFileSync(path.join(root, file), 'utf8');
      execFileSync(process.execPath, ['--input-type=module', '--check'], {
        input: src,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
    }
    console.log(`  ✅ ${file}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${file}`);
    console.error(String(err.stderr || err.message).trim());
  }
}

console.log(`\n${files.length - failed}/${files.length} ملفًا سليمًا`);
process.exit(failed ? 1 : 0);
