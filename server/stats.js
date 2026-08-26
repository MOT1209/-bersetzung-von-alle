// server/stats.js — dashboard statistics (timestamped log + aggregation)
// Writes to cache/stats-log.json; keeps last 10 000 entries.

const fs = require('fs/promises');
const path = require('path');

const LOG_FILE = process.env.STATS_LOG || path.join(__dirname, '..', 'cache', 'stats-log.json');

// ===== internal helpers =====

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

// ===== public API =====

/**
 * Append a single stats entry with an automatic timestamp.
 * Called from usage.js trackUsage so every translation is logged.
 */
async function logEntry(entry) {
  try {
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
  } catch {
    // Stats are best-effort — never break the main flow
  }
}

/**
 * Summary: total translations, today count, week count, byType breakdown.
 */
async function getSummary() {
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

/**
 * Timeseries: array of { date, count } for the last N days (max 30).
 */
async function getTimeseries(days = 7) {
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

/**
 * Provider breakdown: count of translations per provider.
 */
async function getProviders() {
  const entries = await getLogEntries();
  return { byProvider: countBy(entries, 'provider') };
}

/**
 * Language breakdown: source and target language usage counts.
 */
async function getLanguages() {
  const entries = await getLogEntries();
  return {
    bySource: countBy(entries, 'sourceLang'),
    byTarget: countBy(entries, 'targetLang'),
  };
}

/**
 * Hourly distribution: translations per hour of day (0-23).
 */
async function getHourly() {
  const entries = await getLogEntries();
  const hours = Array(24).fill(0);
  for (const entry of entries) {
    const hour = new Date(entry.timestamp).getHours();
    hours[hour]++;
  }
  return { hours };
}

module.exports = { logEntry, getSummary, getTimeseries, getProviders, getLanguages, getHourly };
