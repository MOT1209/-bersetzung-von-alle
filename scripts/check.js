// scripts/check.js — فحص الصياغة لكل ملفات المشروع (يكتشفها تلقائيًا حتى لا تتقادم القائمة)
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

function collect(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((name) => name.endsWith('.js') && isFile(path.join(abs, name)))
    .map((name) => path.join(dir, name));
}

const files = DIRS.flatMap(collect);
let failed = 0;

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
    console.log(`  ✅ ${file}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${file}`);
    console.error(String(err.stderr || err.message).trim());
  }
}

console.log(`\n${files.length - failed}/${files.length} ملفًا سليمًا`);
process.exit(failed ? 1 : 0);
