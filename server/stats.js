// server/stats.js — dashboard statistics (timestamped log + aggregation)
// Backed by SQLite when STATS_DRIVER=sqlite (default), with the legacy JSON
// file (cache/stats-log.json) kept as a fallback driver for downgrades/tests.

const fs = require('fs/promises');
const path = require('path');

const LOG_FILE = process.env.STATS_LOG || path.join(__dirname, '..', 'cache', 'stats-log.json');
const repo = require('./db/stats-repository');
const config = require('./config');

function usingSqlite() {
  return (config.STATS_DRIVER || 'sqlite') !== 'json';
}

// ===== JSON driver (legacy) =====

async function getLogEntries() {
  try {
    const raw = await fs.readFile(LOG_FILE, 'utf8');
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

function countBy(arr, key) {
  const counts = {};
  for (const item of arr) {
    const val = item[key] || 'unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

// Serialise all writes through one promise chain. Without this, concurrent
// logEntry() calls each read the same base array and the later write clobbers
// the earlier one (lost translations in the dashboard).
let writeQueue = Promise.resolve();

async function appendEntry(entry) {
  const entries = await getLogEntries();
  entries.push({ ...entry, timestamp: Date.now() });
  // Keep last 10 000 entries to prevent unbounded growth
  if (entries.length > 10000) entries.splice(0, entries.length - 10000);
  await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
  const tmp = `${LOG_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(entries), 'utf8');
  try {
    await fs.rename(tmp, LOG_FILE);
  } catch (e) {
    if (e && (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY')) {
      await fs.copyFile(tmp, LOG_FILE);
      await fs.rm(tmp, { force: true }).catch(() => {});
    } else throw e;
  }
}

async function jsonSummary() {
  const entries = await getLogEntries();
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  return {
    total: entries.length,
    todayCount: entries.filter((e) => new Date(e.timestamp).toISOString().slice(0, 10) === today).length,
    weekCount: entries.filter((e) => e.timestamp > weekAgo).length,
    byType: countBy(entries, 'type'),
  };
}

async function jsonTimeseries(days = 7) {
  const entries = await getLogEntries();
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    result.push({
      date: dateStr,
      count: entries.filter((e) => new Date(e.timestamp).toISOString().slice(0, 10) === dateStr).length,
    });
  }
  return { days: result };
}

async function jsonProviders() {
  const entries = await getLogEntries();
  return { byProvider: countBy(entries, 'provider') };
}

async function jsonLanguages() {
  const entries = await getLogEntries();
  return {
    bySource: countBy(entries, 'sourceLang'),
    byTarget: countBy(entries, 'targetLang'),
  };
}

async function jsonHourly() {
  const entries = await getLogEntries();
  const hours = Array(24).fill(0);
  for (const entry of entries) {
    const hour = new Date(entry.timestamp).getHours();
    hours[hour]++;
  }
  return { hours };
}

// ===== public API =====

/**
 * Append a single stats entry with an automatic timestamp.
 * Called from usage.js trackUsage so every translation is logged.
 * Returns a promise that resolves once this entry is persisted — await it
 * (or flushStats()) when you need read-after-write consistency.
 */
function logEntry(entry) {
  if (usingSqlite()) {
    try {
      repo.insertEntry(entry);
      return Promise.resolve();
    } catch {
      // SQLite write failure: fall back to the JSON driver so stats stay
      // best-effort and never break the main flow.
    }
  }
  const done = writeQueue.then(() => appendEntry(entry)).catch(() => {
    // Stats are best-effort — never break the main flow
  });
  writeQueue = done;
  return done;
}

/** Resolve once every queued logEntry write has been flushed to disk. */
function flushStats() {
  return writeQueue;
}

/**
 * Summary: total translations, today count, week count, byType breakdown.
 */
async function getSummary() {
  if (usingSqlite()) return repo.getSummary();
  return jsonSummary();
}

/**
 * Timeseries: array of { date, count } for the last N days (max 30).
 */
async function getTimeseries(days = 7) {
  if (usingSqlite()) return repo.getTimeseries(days);
  return jsonTimeseries(days);
}

/**
 * Provider breakdown: count of translations per provider.
 */
async function getProviders() {
  if (usingSqlite()) return repo.getProviders();
  return jsonProviders();
}

/**
 * Language breakdown: source and target language usage counts.
 */
async function getLanguages() {
  if (usingSqlite()) return repo.getLanguages();
  return jsonLanguages();
}

/**
 * Hourly distribution: translations per hour of day (0-23).
 */
async function getHourly() {
  if (usingSqlite()) return repo.getHourly();
  return jsonHourly();
}

module.exports = { logEntry, flushStats, getSummary, getTimeseries, getProviders, getLanguages, getHourly };