/**
 * Rebuild webui_dist when webui_src is newer (production only).
 * Prevents UI drift after source changes without manual `npm run build:web`.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC_HTML = path.join(ROOT, 'webui_src', 'index.html');
const DIST_HTML = path.join(ROOT, 'webui_dist', 'index.html');
const DIST_DIR = path.join(ROOT, 'webui_dist');

function needsRebuild() {
  if (process.env.SKIP_WEBUI_BUILD === 'true') return false;
  if (process.env.NODE_ENV !== 'production') return false;
  if (!fs.existsSync(SRC_HTML)) return false;
  if (!fs.existsSync(DIST_DIR) || !fs.existsSync(DIST_HTML)) return true;

  const src = fs.readFileSync(SRC_HTML, 'utf8');
  const dist = fs.readFileSync(DIST_HTML, 'utf8');
  if (src.includes('user-docs-card') && !dist.includes('user-docs-card')) return true;

  const srcMtime = fs.statSync(SRC_HTML).mtimeMs;
  const distMtime = fs.statSync(DIST_HTML).mtimeMs;
  return srcMtime > distMtime;
}

if (needsRebuild()) {
  console.log('[prestart] webui_src новее webui_dist — запуск npm run build:web');
  execSync('npm run build:web', { cwd: ROOT, stdio: 'inherit', env: process.env });
}
