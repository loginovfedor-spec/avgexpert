import path = require('path');

export const USER_KB_ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.markdown']);

export const USER_KB_ALLOWED_MIMES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
]);

export const USER_KB_REJECTED_EXTENSIONS = new Set(['.pdf', '.docx', '.doc', '.html', '.htm']);

const FILENAME_MAX_LEN = 255;
const SAFE_FILENAME_RE = /^[a-zA-Z0-9._\-\u0400-\u04FF ]+$/;

export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename.trim());
  if (!base || base === '.' || base === '..') {
    throw new Error('Недопустимое имя файла');
  }

  let sanitized = base.replace(/[^\w.\-\u0400-\u04FF ]/g, '_');
  sanitized = sanitized.replace(/\.{2,}/g, '.').replace(/^\.+/, '');

  if (!sanitized || sanitized.length > FILENAME_MAX_LEN) {
    throw new Error(`Имя файла должно быть от 1 до ${FILENAME_MAX_LEN} символов`);
  }

  if (!SAFE_FILENAME_RE.test(sanitized)) {
    throw new Error('Имя файла содержит недопустимые символы');
  }

  return sanitized;
}

export function inferMimeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'text/markdown';
  return 'text/plain';
}

export function validateUserUpload(params: {
  filename: string;
  content: string;
  mime?: string;
  maxBytes: number;
}): { sanitizedFilename: string; mime: string; size: number } {
  const sanitizedFilename = sanitizeFilename(params.filename);
  const ext = path.extname(sanitizedFilename).toLowerCase();

  if (USER_KB_REJECTED_EXTENSIONS.has(ext)) {
    throw new Error(`Формат ${ext} не поддерживается для пользовательской базы (PDF и бинарные файлы отклоняются)`);
  }

  if (!USER_KB_ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Неподдерживаемый формат: ${ext || '(без расширения)'}. Допустимо: .txt, .md`);
  }

  const size = Buffer.byteLength(params.content, 'utf-8');
  if (size === 0) {
    throw new Error('Файл пустой');
  }
  if (size > params.maxBytes) {
    throw new Error(`Размер файла превышает лимит ${params.maxBytes} байт`);
  }

  const mime = params.mime?.trim() || inferMimeFromFilename(sanitizedFilename);
  if (!USER_KB_ALLOWED_MIMES.has(mime)) {
    throw new Error(`MIME-тип не разрешён: ${mime}`);
  }

  return { sanitizedFilename, mime, size };
}

module.exports = {
  USER_KB_ALLOWED_EXTENSIONS,
  USER_KB_ALLOWED_MIMES,
  USER_KB_REJECTED_EXTENSIONS,
  sanitizeFilename,
  inferMimeFromFilename,
  validateUserUpload,
};
