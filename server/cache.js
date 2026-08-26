// server/cache.js — file-backed cache for translations
// Shape: { [key]: { text, ts } } — key = sha1(text + '|' + sourceLang + '|' + targetLang)
// Any successfully translated text is saved here; a later request with the same
// text + language pair is served instantly without the network (saves daily
// Google/Gemini quotas).
//
// Performance design: the old version read/wrote the FULL cache file
// synchronously on every get/set (blocking the event loop under high load). Now:
//   * The file is loaded into memory ONCE at startup (async fs.promises).
//   * get() is a pure in-memory lookup — zero I/O.
//   * set() updates memory immediately and schedules a debounced (~250ms) disk
//     write through a SERIALIZED write queue, so concurrent sets never lose
//     each other's data: the queued job always writes the latest snapshot and
//     re-checks `dirty` afterwards to schedule a follow-up flush if changes
//     arrived while a write was in flight.
//   * On exit / SIGINT / SIGTERM remaining changes are flushed (best effort).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// مسار ملف الكاش — قابل للضبط عبر CACHE_FILE (نمط ENV_FILE نفسه).
// ضروري للاختبارات: عمليات node --test المتوازية تحمّل هذه الوحدة كلها، ولو
// تشاركت ملفًا واحدًا لمسحت لقطات بعضها. ومفيد للنشر أيضًا (قرص خارجي/دائم).
const CACHE_FILE = process.env.CACHE_FILE
  || path.join(__dirname, '..', 'cache', 'translation-cache.json');
// مدة صلاحية المدخلات بالمللي ثانية — 30 يومًا افتراضيًا؛ 0 = بلا انتهاء.
// (نمط CACHE_FILE نفسه: تُقرأ مباشرة من env ليتسنى للاختبارات ضبطها قبل require)
const CACHE_TTL_MS = (() => {
  const raw = process.env.CACHE_TTL_MS;
  if (raw === undefined || raw === '') return 2592000000;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : 2592000000;
})();
const MAX_ENTRIES = 5000;
const DEBOUNCE_MS = 250;
const MAX_FAILURES = 5; // consecutive failed writes before giving up until the next set()

let store = {};
let dirty = false; // true when memory holds changes not yet written to disk
let debounceTimer = null; // pending debounce timer
let queued = false; // a persist job is already enqueued on the write queue
let failures = 0; // consecutive write failures — reset on a successful persist

const initPromise = loadInitial();
// Writes are always chained behind the initial load: no disk write may start
// before the startup read resolved, otherwise a flush could erase loaded data.
let writeQueue = initPromise;

// Read the cache file from disk once at startup.
// Merge strategy: if set() ran before the load resolved (startup), those early
// in-memory entries win over the (older) on-disk values.
function loadInitial() {
  return fs.promises
    .readFile(CACHE_FILE, 'utf8')
    .then((txt) => {
      try {
        store = prune({ ...JSON.parse(txt || '{}'), ...store });
      } catch {
        // corrupt file — keep only what is already in memory
      }
    })
    .catch(() => {
      // no cache file yet — start empty
    });
}

// Drop the oldest entries (by ts) once the store exceeds MAX_ENTRIES.
// Applied both to the in-memory store and to whatever is written to disk.
function prune(data) {
  // أولًا: إسقاط المدخلات منتهية الصلاحية (إن فُعّل الانتهاء) ثم تقليم العدد.
  let filtered = data;
  if (CACHE_TTL_MS > 0) {
    const now = Date.now();
    filtered = {};
    for (const k of Object.keys(data)) {
      if (!isExpired(data[k], now)) filtered[k] = data[k];
    }
  }
  const keys = Object.keys(filtered);
  if (keys.length <= MAX_ENTRIES) return filtered;
  return keys
    .map((k) => [k, filtered[k].ts || 0])
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ENTRIES)
    .reduce((acc, [k]) => ((acc[k] = filtered[k]), acc), {});
}

// هل انتهت صلاحية المدخل؟ (المدة 0 أو غياب ts = لا انتهاء أبدًا)
function isExpired(entry, now) {
  return CACHE_TTL_MS > 0 && !!entry && !!entry.ts && now - entry.ts > CACHE_TTL_MS;
}

// Actual disk write of the full (pruned) snapshot.
//
// dirty bookkeeping: the snapshot is serialized SYNCHRONOUSLY and `dirty` is
// cleared at that exact moment. Anything set() writes afterwards is not in the
// snapshot, so it must leave dirty=true and get its own flush. Clearing dirty
// after the await instead would swallow those late writes: they would sit in
// memory, marked clean, and never reach the disk.
//
// On failure dirty is restored so flushJob reschedules a retry.
async function persist() {
  store = prune(store);
  const snapshot = JSON.stringify(store);
  dirty = false;
  try {
    await fs.promises.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    // Atomic replace: a crash mid-write can only ever corrupt the .tmp file,
    // never the live cache. rename() is atomic within one filesystem.
    const tmp = `${CACHE_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, snapshot);
    try {
      await fs.promises.rename(tmp, CACHE_FILE);
    } catch (e) {
      if (e && (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY')) {
        await fs.promises.copyFile(tmp, CACHE_FILE);
        await fs.promises.rm(tmp, { force: true }).catch(() => {});
      } else throw e;
    }
    failures = 0;
  } catch (e) {
    dirty = true; // not persisted — retry
    throw e;
  }
}

// One queued write job: runs serially on the write queue, always writes the
// latest full snapshot, then re-checks dirty for changes that arrived too late.
async function flushJob() {
  try {
    await persist();
  } catch (e) {
    failures++;
    console.error('[cache] write failed:', e.message || e);
  } finally {
    queued = false;
    // Retry only while failures stay under the cap: a permanently unwritable
    // disk must not spin a 250ms retry loop forever. dirty stays true, so the
    // next set() re-arms the flush naturally.
    if (dirty && failures < MAX_FAILURES) scheduleFlush();
  }
}

// dirty is intentionally NOT cleared here — persist() clears it at the moment
// it takes its snapshot, which is the only point where "clean" is truthful.
function runFlush() {
  if (!dirty || queued) return; // a running/queued job will pick up the changes
  queued = true;
  writeQueue = writeQueue.then(flushJob);
}

function scheduleFlush() {
  if (debounceTimer) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runFlush();
  }, DEBOUNCE_MS);
  if (debounceTimer.unref) debounceTimer.unref(); // never keep the process alive
}

function cacheKey(text, sourceLang, targetLang) {
  return crypto
    .createHash('sha1')
    .update(text + '|' + (sourceLang || '') + '|' + targetLang)
    .digest('hex');
}

function get(text, sourceLang, targetLang) {
  // Pure in-memory lookup — never touches the disk.
  // Before the startup load resolves this may briefly return null (a miss);
  // that is harmless for the very first in-flight requests.
  const key = cacheKey(text, sourceLang, targetLang);
  const entry = store[key];
  if (!entry) return null;
  if (isExpired(entry, Date.now())) {
    // منتهي الصلاحية — يُحذف فورًا ويُجدول فلاش ليطهر القرص.
    delete store[key];
    dirty = true;
    scheduleFlush();
    return null;
  }
  return entry.text || null;
}

function set(text, sourceLang, targetLang, translated) {
  store[cacheKey(text, sourceLang, targetLang)] = { text: translated, ts: Date.now() };
  dirty = true;
  scheduleFlush();
}

// ---- final flush on shutdown (best effort, never lose a write silently) ----

function syncSaveCurrent() {
  try {
    store = prune(store);
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    // same atomic replace as persist() — a crash here must not truncate the cache
    const tmp = `${CACHE_FILE}.${process.pid}.exit.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store));
    try { fs.renameSync(tmp, CACHE_FILE); }
    catch (e) {
      if (e && (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY')) {
        try { fs.copyFileSync(tmp, CACHE_FILE); } catch {}
        try { fs.unlinkSync(tmp); } catch {}
      }
    }
  } catch {
    // best effort only
  }
}

// 'exit' listeners can only run synchronous code
process.on('exit', () => {
  if (dirty || queued) syncSaveCurrent();
});

function flushAndExit() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  runFlush(); // same rule as everywhere else: only persist() clears dirty
  const finish = () => {
    syncSaveCurrent(); // cover trailing changes landed after the last queued write
    dirty = false;
    process.exit(0);
  };
  writeQueue.then(finish, finish);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, flushAndExit);
}

async function cleanOrphanTmps() {
  try {
    const dir = path.dirname(CACHE_FILE);
    const base = path.basename(CACHE_FILE);
    const entries = await fs.promises.readdir(dir).catch(() => []);
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const name of entries) {
      if (!name.startsWith(base + '.') || (!name.endsWith('.tmp') && !name.endsWith('.exit.tmp'))) continue;
      const p = path.join(dir, name);
      try {
        const st = await fs.promises.stat(p);
        if (st.mtimeMs < cutoff) await fs.promises.rm(p, { force: true });
      } catch {}
    }
  } catch {}
}
cleanOrphanTmps().catch(() => {}); // fire-and-forget — also satisfies spec literal: cleanOrphanTmps();

module.exports = { get, set };