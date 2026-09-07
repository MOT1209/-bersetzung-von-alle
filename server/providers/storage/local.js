// server/providers/storage/local.js — تخزين على نظام الملفات المحلي
//
// الافتراضي والوحيد اليوم. سائق S3/R2 يُضاف بنفس الواجهة دون لمس المستدعين
// (البند 40): كلهم يتعاملون مع مفاتيح لا مسارات.
const fs = require('fs/promises');
const path = require('path');
const config = require('../../config');
const { normalizeKey } = require('./keys');

// يحوّل مفتاحًا مُطبَّعًا إلى مسار مطلق، ويؤكد بقاءه داخل الجذر.
// التحقق مزدوج عمدًا: normalizeKey يمنع '..' نصيًا، وهذا يمنع أي التفاف
// عبر روابط رمزية أو تطبيع مختلف من نظام الملفات.
function resolveInRoot(root, key) {
  const safeKey = normalizeKey(key);
  const abs = path.resolve(root, safeKey);
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    const e = new Error('invalid-storage-key: خرج عن جذر التخزين');
    e.code = 'invalid-storage-key';
    throw e;
  }
  return abs;
}

function createLocalStorage(opts = {}) {
  const root = opts.root || config.STORAGE_DIR;

  return {
    id: 'local',
    label: 'تخزين محلي',
    isAvailable: () => true,

    async put(key, data) {
      const abs = resolveInRoot(root, key);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      // كتابة ذرّية: عطل في المنتصف لا يترك ملفًا نصفيًا يبدو سليمًا
      const tmp = `${abs}.${process.pid}.tmp`;
      await fs.writeFile(tmp, buf);
      try {
        await fs.rename(tmp, abs);
      } catch (e) {
        if (e && (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY')) {
          await fs.copyFile(tmp, abs);
          await fs.rm(tmp, { force: true }).catch(() => {});
        } else throw e;
      }
      return { key: normalizeKey(key), bytes: buf.length };
    },

    async get(key) {
      try {
        return await fs.readFile(resolveInRoot(root, key));
      } catch (e) {
        if (e && e.code === 'ENOENT') return null; // غير موجود ≠ عطل
        throw e;
      }
    },

    async stat(key) {
      try {
        const st = await fs.stat(resolveInRoot(root, key));
        return { key: normalizeKey(key), bytes: st.size, modifiedAt: st.mtimeMs };
      } catch (e) {
        if (e && e.code === 'ENOENT') return null;
        throw e;
      }
    },

    async exists(key) {
      return (await this.stat(key)) !== null;
    },

    // يعيد true إن حُذف فعلًا، وfalse إن لم يكن موجودًا (حذف متكرّر آمن)
    async remove(key) {
      const abs = resolveInRoot(root, key);
      try {
        await fs.unlink(abs);
        return true;
      } catch (e) {
        if (e && e.code === 'ENOENT') return false;
        throw e;
      }
    },

    // حذف كل ما تحت بادئة (حذف مشروع كامل — البند 59: الخصوصية)
    async removePrefix(prefix) {
      const abs = resolveInRoot(root, prefix);
      try {
        await fs.rm(abs, { recursive: true, force: true });
        return true;
      } catch (e) {
        if (e && e.code === 'ENOENT') return false;
        throw e;
      }
    },

    async list(prefix) {
      const safe = normalizeKey(prefix);
      const abs = resolveInRoot(root, safe);
      const out = [];
      async function walk(dir, rel) {
        let entries;
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch (e) {
          if (e && e.code === 'ENOENT') return; // بادئة غير موجودة → قائمة فارغة
          throw e;
        }
        for (const ent of entries) {
          const childRel = rel ? `${rel}/${ent.name}` : ent.name;
          if (ent.isDirectory()) await walk(path.join(dir, ent.name), childRel);
          else out.push(`${safe}/${childRel}`);
        }
      }
      await walk(abs, '');
      return out.sort();
    },

    _root: root,
  };
}

module.exports = { createLocalStorage };
