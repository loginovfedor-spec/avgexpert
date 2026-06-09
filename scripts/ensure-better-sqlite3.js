/**
 * Ensures better-sqlite3 native binary matches the current Node.js version.
 * On Windows, npm rebuild may leave a binary built for a different Node ABI.
 */
const { execSync } = require('child_process');
const path = require('path');

function tryLoad() {
  require('better-sqlite3');
  return true;
}

if (tryLoad()) {
  process.exit(0);
}

const pkgDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');
const target = process.versions.node;

console.log(`[ensure-better-sqlite3] Reinstalling prebuild for Node ${target}...`);
execSync(`npx prebuild-install --runtime node --target ${target}`, {
  cwd: pkgDir,
  stdio: 'inherit',
});

if (!tryLoad()) {
  console.error('[ensure-better-sqlite3] Failed to load better-sqlite3 after prebuild-install');
  process.exit(1);
}

console.log('[ensure-better-sqlite3] OK');
