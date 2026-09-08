// server/dubbing/ffmpeg-cost.js — shared helper to time ffmpeg execFile calls
// and record the elapsed seconds in the cost ledger.
// Minimal: compute seconds, ceil, track, move on.

const { trackCost } = require('../cost');

// Wraps execFileAsync(...args), times the call, and records ffmpegSec in the cost ledger.
async function timedExec(execFileAsync, ...args) {
  const start = Date.now();
  const result = await execFileAsync(...args);
  const secs = (Date.now() - start) / 1000;
  trackCost({ ffmpegSec: Math.ceil(secs), type: 'dub' }).catch(() => {});
  return result;
}

module.exports = { timedExec };
