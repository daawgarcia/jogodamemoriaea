const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ea-electron-smoke-'));
try {
  const result = spawnSync(require('electron'), [path.join(__dirname, 'desktop-smoke.cjs')], {
    stdio: 'inherit',
    env: { ...process.env, EA_SMOKE_DIR: directory }
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
