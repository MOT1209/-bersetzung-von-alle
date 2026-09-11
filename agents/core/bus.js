// agents/core/bus.js — ناقل الرسائل بين الوكلاء
//
// ثلاث قنوات:
//   send(to, msg)       — رسالة مباشرة لوكيل محدد
//   broadcast(from,msg) — بث للجميع
//   publish(topic, msg) — نشر في موضوع (من يتابعه يستقبل)
// كل رسالة تُرقّم وتُحفظ في سجل JSONL دائم، ويمكن إعادة تشغيلها (replay)
// بعد إعادة التشغيل. الحجم محدود (MAX_HISTORY) حتى لا ينمو الذاكرة بلا حدود.
const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.AGENTS_LOG_DIR || path.join(process.cwd(), 'cache', 'agents');
const LOG_FILE = path.join(LOG_DIR, 'bus-log.jsonl');
const MAX_HISTORY = Number(process.env.AGENTS_BUS_MAX || 1000);

const subscribers = new Map(); // agentId → Set<handler>
const topicSubs = new Map();   // topic    → Set<handler>
let seq = 0;
let history = [];              // آخر MAX_HISTORY رسالة (للاستعلام السريع)
const logToDisk = process.env.AGENTS_BUS_PERSIST !== '0';

// ── التسجيل ──
function subscribe(agentId, handler) {
  if (typeof handler !== 'function') return () => {};
  if (!subscribers.has(agentId)) subscribers.set(agentId, new Set());
  subscribers.get(agentId).add(handler);
  return () => subscribers.get(agentId)?.delete(handler); // إلغاء الاشتراك
}

function subscribeTopic(topic, handler) {
  if (!topicSubs.has(topic)) topicSubs.set(topic, new Set());
  topicSubs.get(topic).add(handler);
  return () => topicSubs.get(topic)?.delete(handler);
}

// ── التسجيل الدائم ──
function persist(entry) {
  if (!logToDisk) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (e) {
    // فشل الكتابة لا يوقف النظام — الذاكرة تبقى مصدر الحقيقة أثناء التشغيل
    console.error('[agents:bus] persist failed:', e.message);
  }
}

// ── الإرسال ──
function _deliver(entry) {
  history.push(entry);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  persist(entry);
}

function send(to, msg) {
  const entry = {
    id: ++seq,
    ts: Date.now(),
    kind: 'direct',
    from: msg.from || '?',
    to,
    type: msg.type || 'info',
    body: msg.body ?? null,
  };
  _deliver(entry);
  const subs = subscribers.get(to);
  if (subs) for (const h of subs) { try { h(entry); } catch (e) { console.error('[agents:bus] handler error:', e.message); } }
  else console.warn(`[agents:bus] رسالة لوكيل غير مشترك: ${to}`);
  return entry;
}

function broadcast(from, body) {
  const entry = {
    id: ++seq, ts: Date.now(), kind: 'broadcast', from,
    type: 'info', body: body ?? null,
  };
  _deliver(entry);
  for (const subs of subscribers.values())
    for (const h of subs) { try { h(entry); } catch (e) { console.error('[agents:bus] handler error:', e.message); } }
  return entry;
}

function publish(topic, msg) {
  const entry = {
    id: ++seq, ts: Date.now(), kind: 'topic', topic,
    from: msg.from || '?', type: msg.type || 'info', body: msg.body ?? null,
  };
  _deliver(entry);
  const subs = topicSubs.get(topic);
  if (subs) for (const h of subs) { try { h(entry); } catch (e) { console.error('[agents:bus] handler error:', e.message); } }
  return entry;
}

// ── الاستعلام ──
function getHistory(filter = {}) {
  let out = history;
  if (filter.to) out = out.filter((m) => m.to === filter.to || m.kind === 'broadcast');
  if (filter.from) out = out.filter((m) => m.from === filter.from);
  if (filter.topic) out = out.filter((m) => m.topic === filter.topic);
  return out;
}

function lastMessageTo(agentId) {
  const h = getHistory({ to: agentId });
  return h.length ? h[h.length - 1] : null;
}

function unreadCount(agentId) {
  return getHistory({ to: agentId }).length;
}

function reset() { // للاختبارات
  history = [];
  seq = 0;
}

function stats() {
  const byKind = {};
  for (const m of history) byKind[m.kind] = (byKind[m.kind] || 0) + 1;
  return { total: history.length, seq, byKind, logFile: logToDisk ? LOG_FILE : null };
}

module.exports = { send, broadcast, publish, subscribe, subscribeTopic, getHistory, lastMessageTo, unreadCount, reset, stats };
