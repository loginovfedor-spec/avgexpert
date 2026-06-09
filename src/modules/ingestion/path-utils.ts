import fs = require('fs');
import path = require('path');

const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt', '.markdown']);

export function loadChunkingDefaults(env: NodeJS.ProcessEnv = process.env): {
  chunkSize: number;
  chunkOverlap: number;
  allowedDir: string;
} {
  const chunkSize = parseInt(env.CHUNK_SIZE || '800', 10);
  const chunkOverlap = parseInt(env.CHUNK_OVERLAP || '150', 10);
  const allowedDir = env.KB_INGEST_ALLOWED_DIR || 'webui_src/assets/books';

  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new Error(`CHUNK_SIZE должен быть положительным числом, получено: ${env.CHUNK_SIZE}`);
  }
  if (!Number.isFinite(chunkOverlap) || chunkOverlap < 0 || chunkOverlap >= chunkSize) {
    throw new Error(
      `CHUNK_OVERLAP должен быть в диапазоне 0..CHUNK_SIZE-1, получено: ${env.CHUNK_OVERLAP}`
    );
  }

  return { chunkSize, chunkOverlap, allowedDir };
}

export function resolveIngestFilePath(
  filePath: string,
  options: { allowedDir?: string; cwd?: string } = {}
): string {
  const { allowedDir } = loadChunkingDefaults();
  const baseDir = path.resolve(options.cwd || process.cwd(), options.allowedDir || allowedDir);
  const candidate = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(baseDir, filePath);

  const normalizedBase = baseDir.endsWith(path.sep) ? baseDir : `${baseDir}${path.sep}`;
  if (candidate !== baseDir && !candidate.startsWith(normalizedBase)) {
    throw new Error('Путь к файлу вне разрешённой директории ingest');
  }

  if (!fs.existsSync(candidate)) {
    throw new Error(`Файл не найден: ${candidate}`);
  }
  if (!fs.statSync(candidate).isFile()) {
    throw new Error(`Путь не является файлом: ${candidate}`);
  }

  const ext = path.extname(candidate).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(`Неподдерживаемый формат файла: ${ext}. Допустимо: .md, .txt`);
  }

  return candidate;
}

export function assertSafeSourceUri(sourceUri: string | undefined): void {
  if (!sourceUri) return;
  const trimmed = sourceUri.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    throw new Error('source_uri с HTTP(S) запрещён (SSRF guard)');
  }
}

module.exports = {
  loadChunkingDefaults,
  resolveIngestFilePath,
  assertSafeSourceUri,
};
