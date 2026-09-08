// server/cost.js — lightweight cost/quota ledger (cache/cost.json)
// Follows the same best-effort atomic-write pattern as usage.js.
// Tracks TTS segments, translation characters, and ffmpeg seconds.
// A write failure NEVER breaks a request or job.

const fs = require('fs/promises');
const path = require('path');

function costFile() {
  return process.env.COST_FILE || path.join(__dirname, '..', 'cache', 'cost.json');
}

function emptyCost() {
  return {
    ttsSegments: 0,
    translationChars: 0,
    ffmpegSec: 0,
    byType: {},
    updatedAt: new Date().toISOString(),
  };
}

async function getCost() {
  try {
    const raw = await fs.readFile(costFile(), 'utf8');
    const data = JSON.parse(raw);
    return {
      ttsSegments: 0,
      translationChars: 0,
      ffmpegSec: 0,
      byType: {},
      updatedAt: null,
      ...data,
    };
  } catch {
    return emptyCost();
  }
}

// incr: { ttsSegments?, translationChars?, ffmpegSec?, type? }
// All increments are additive; type increments per-metric sub-counters in byType.
async function trackCost(incr) {
  if (!incr) return;
  try {
    const c = await getCost();
    if (incr.ttsSegments) c.ttsSegments = (c.ttsSegments || 0) + incr.ttsSegments;
    if (incr.translationChars) c.translationChars = (c.translationChars || 0) + incr.translationChars;
    if (incr.ffmpegSec) c.ffmpegSec = (c.ffmpegSec || 0) + incr.ffmpegSec;
    // Per-type breakdown: byType[type] mirrors the same top-level metrics
    if (incr.type) {
      const t = c.byType[incr.type] || { ttsSegments: 0, translationChars: 0, ffmpegSec: 0 };
      if (incr.ttsSegments) t.ttsSegments = (t.ttsSegments || 0) + incr.ttsSegments;
      if (incr.translationChars) t.translationChars = (t.translationChars || 0) + incr.translationChars;
      if (incr.ffmpegSec) t.ffmpegSec = (t.ffmpegSec || 0) + incr.ffmpegSec;
      c.byType[incr.type] = t;
    }
    c.updatedAt = new Date().toISOString();
    const file = costFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(c), 'utf8');
    try {
      await fs.rename(tmp, file);
    } catch (e) {
      if (e && (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY')) {
        await fs.copyFile(tmp, file);
        await fs.rm(tmp, { force: true }).catch(() => {});
      } else throw e;
    }
  } catch {
    // Best-effort — never fails a request
  }
}

module.exports = { getCost, trackCost };
