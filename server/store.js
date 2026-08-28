// server/store.js — طبقة تخزين مفتاح/قيمة قابلة للتبديل (عدّادات حد الطلبات)
//
// لماذا: عدّاد حد الطلبات كان `Map` داخل كل عملية. مع أكثر من نسخة خادم (توسّع
// أفقي) يصبح الحد الفعلي = max × عدد النسخ — أي بلا حماية حقيقية. هذه الطبقة
// تسمح بمشاركة العدّادات عبر Redis دون تغيير سلوك النسخة الواحدة.
//
// السلوك الافتراضي (بلا REDIS_URL): مُشغّل الذاكرة — مطابق تمامًا للسابق.
// مع REDIS_URL: مُشغّل Redis (INCR + PEXPIRE). أي فشل (الحزمة غير مثبّتة، أو
// تعذّر الاتصال، أو خطأ وقت التشغيل) → تحذير مرة واحدة + سقوط تلقائي للذاكرة،
// فلا ينهار الخادم بسبب Redis.
//
// الواجهة: createStore() → { incr(key, windowMs), reset(key?), close(), kind }
//   incr:  يزيد العدّاد ويعيد { count, resetAt } (resetAt = طابع زمني ms)

let redisClientPromise = null; // اتصال Redis مفرد يتقاسمه كل المتاجر
let redisDisabled = false;     // صار true بعد أول فشل — كل المتاجر تسقط للذاكرة

function warnOnce(msg) {
  if (!warnOnce._seen) warnOnce._seen = new Set();
  if (warnOnce._seen.has(msg)) return;
  warnOnce._seen.add(msg);
  console.warn('[store] ' + msg);
}

// ===== مُشغّل الذاكرة =====
function memoryStore(ns) {
  const hits = new Map(); // key → { count, resetAt }
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, h] of hits) if (h.resetAt <= now) hits.delete(k);
  }, 60000);
  if (sweeper.unref) sweeper.unref(); // لا يمنع إغلاق العملية أبدًا

  return {
    kind: 'memory',
    async incr(key, windowMs) {
      const now = Date.now();
      let h = hits.get(key);
      if (!h || h.resetAt <= now) {
        h = { count: 0, resetAt: now + windowMs };
        hits.set(key, h);
      }
      h.count += 1;
      return { count: h.count, resetAt: h.resetAt };
    },
    async reset(key) {
      if (key === undefined) hits.clear();
      else hits.delete(key);
    },
    async close() {
      clearInterval(sweeper);
      hits.clear();
    },
    _ns: ns,
  };
}

// ===== مُشغّل Redis =====
const REDIS_CONNECT_TIMEOUT_MS = 3000;

function connectRedis(url) {
  if (redisClientPromise) return redisClientPromise;
  redisClientPromise = (async () => {
    // require كسول: الحزمة اختيارية — غيابها لا يكسر الاستيراد
    const redis = require('redis');
    const client = redis.createClient({
      url,
      socket: {
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        // لا نعلَق في حلقة إعادة اتصال أبدية — نستسلم بعد محاولتين فيسقط للذاكرة
        reconnectStrategy: (retries) => (retries > 2 ? false : Math.min(retries * 200, 800)),
      },
    });
    client.on('error', (e) => warnOnce('redis error: ' + (e && e.message)));
    // حدّ زمني صريح: connect() قد لا يرفض بسرعة مع بعض أخطاء الشبكة
    const connectP = client.connect();
    connectP.catch(() => {}); // امنع unhandled rejection إن خسر السباق
    let timer;
    try {
      await Promise.race([
        connectP,
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('connect timeout')), REDIS_CONNECT_TIMEOUT_MS + 500); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    return client;
  })().catch((e) => {
    redisClientPromise = null;
    throw e;
  });
  return redisClientPromise;
}

function redisStore(ns, url) {
  const prefix = `aralink:${ns}:`;
  return {
    kind: 'redis',
    async incr(key, windowMs) {
      const client = await connectRedis(url);
      const k = prefix + key;
      const count = await client.incr(k);
      if (count === 1) await client.pExpire(k, windowMs);
      let ttl = await client.pTTL(k);
      if (ttl < 0) ttl = windowMs; // مفتاح بلا انتهاء (لا ينبغي) — نضبطه احتياطًا
      return { count, resetAt: Date.now() + ttl };
    },
    async reset(key) {
      const client = await connectRedis(url);
      if (key === undefined) {
        for await (const k of client.scanIterator({ MATCH: prefix + '*' })) await client.del(k);
      } else {
        await client.del(prefix + key);
      }
    },
    async close() {
      // الاتصال مُشترك — لا نغلقه هنا؛ closeAll() تتكفّل عند إيقاف الخادم
    },
    _ns: ns,
  };
}

// يغلّف مُشغّل Redis بسقوط تلقائي للذاكرة عند أي فشل
function withFallback(ns, url) {
  const redis = redisStore(ns, url);
  let fallback = null; // memoryStore يُنشأ عند أول فشل فقط

  function tripFallback(e) {
    if (!redisDisabled) {
      redisDisabled = true;
      warnOnce('redis unavailable (' + (e && e.message) + ') — falling back to in-memory rate limiting');
    }
    if (!fallback) fallback = memoryStore(ns);
    return fallback;
  }

  // تسخين الاتصال في الخلفية عند الإنشاء — فيقع السقوط للذاكرة أثناء الإقلاع
  // لا عند أول طلب مستخدم.
  connectRedis(url).catch((e) => tripFallback(e));

  async function run(method, ...args) {
    if (fallback) return fallback[method](...args);
    try {
      return await redis[method](...args);
    } catch (e) {
      return tripFallback(e)[method](...args);
    }
  }

  return {
    get kind() { return fallback ? 'memory' : 'redis'; },
    incr: (key, windowMs) => run('incr', key, windowMs),
    reset: (key) => run('reset', key),
    close: () => (fallback ? fallback.close() : Promise.resolve()),
    _ns: ns,
  };
}

let nsCounter = 0;

// createStore({ redisUrl?, namespace? }) — متجر مستقل (مساحة مفاتيح خاصة)
function createStore(opts = {}) {
  const ns = opts.namespace || `s${++nsCounter}`;
  const url = opts.redisUrl !== undefined ? opts.redisUrl : process.env.REDIS_URL;
  if (url && !redisDisabled) return withFallback(ns, url);
  return memoryStore(ns);
}

// إغلاق اتصال Redis المشترك (عند إيقاف الخادم)
async function closeAll() {
  if (redisClientPromise) {
    try {
      const client = await redisClientPromise;
      await client.quit();
    } catch {
      // أُغلق أصلاً أو لم يتصل — تجاهل
    }
    redisClientPromise = null;
  }
}

module.exports = { createStore, closeAll };
