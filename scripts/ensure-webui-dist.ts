/**
 * Rebuild webui_dist when webui_src is newer (production only).
 * Prevents UI drift after source changes without manual `npm run build:web`.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'webui_src');
const SRC_HTML = path.join(SRC_DIR, 'index.html');
const DIST_HTML = path.join(ROOT, 'webui_dist', 'index.html');
const DIST_DIR = path.join(ROOT, 'webui_dist');
const SRC_EXTENSIONS = new Set(['.html', '.js', '.ts', '.css']);

function maxMtimeInDir(dir: string): number {
  let max = 0;
  if (!fs.existsSync(dir)) return max;

  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!SRC_EXTENSIONS.has(ext)) continue;
      max = Math.max(max, fs.statSync(full).mtimeMs);
    }
  }
  return max;
}

function needsRebuild(): boolean {
  if (process.env.SKIP_WEBUI_BUILD === 'true') return false;
  if (process.env.NODE_ENV !== 'production') return false;
  if (!fs.existsSync(SRC_HTML)) return false;
  if (!fs.existsSync(DIST_DIR) || !fs.existsSync(DIST_HTML)) return true;

  const src = fs.readFileSync(SRC_HTML, 'utf8');
  const dist = fs.readFileSync(DIST_HTML, 'utf8');
  if (src.includes('user-docs-card') && !dist.includes('user-docs-card')) return true;

  const srcMtime = maxMtimeInDir(SRC_DIR);
  const distMtime = fs.statSync(DIST_HTML).mtimeMs;
  return srcMtime > distMtime;
}

if (needsRebuild()) {
  console.log('[prestart] webui_src новее webui_dist — запуск npm run build:web');
  execSync('npm run build:web', { cwd: ROOT, stdio: 'inherit', env: process.env });
}
