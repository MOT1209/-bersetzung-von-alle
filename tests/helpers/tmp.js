// tests/helpers/tmp.js — helper for isolating Env/Cache/Usage/Rules files in tests
// Creates a temporary directory via mkdtemp and points ENV_FILE/CACHE_FILE/USAGE_FILE/RULES_FILE
// to files inside it. Returns a cleanup function that restores env vars and removes the temp dir.
// Usage: const cleanup = tmpEnv({ '.env': 'GEMINI_API_KEY=xyz\n' }); ... cleanup();
const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpEnv(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-test-'));

  // Save old values to restore on cleanup
  const old = {
    ENV_FILE: process.env.ENV_FILE,
    CACHE_FILE: process.env.CACHE_FILE,
    USAGE_FILE: process.env.USAGE_FILE,
    RULES_FILE: process.env.RULES_FILE,
  };

  process.env.ENV_FILE = path.join(dir, '.env');
  process.env.CACHE_FILE = path.join(dir, 'cache.json');
  process.env.USAGE_FILE = path.join(dir, 'usage.json');
  process.env.RULES_FILE = path.join(dir, 'rules.json');

  // Write any provided files: keys can be ENV_FILE/CACHE_FILE... or filenames relative to dir
  for (const [key, value] of Object.entries(files)) {
    let target;
    if (key === 'ENV_FILE' || key === 'CACHE_FILE' || key === 'USAGE_FILE' || key === 'RULES_FILE') {
      target = process.env[key];
    } else {
      target = path.join(dir, key);
    }
    const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }

  function cleanup() {
    for (const [k, v] of Object.entries(old)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }

  cleanup.dir = dir;
  return cleanup;
}

module.exports = tmpEnv;
module.exports.tmpEnv = tmpEnv;
module.exports.default = tmpEnv;
