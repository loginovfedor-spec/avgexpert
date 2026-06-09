import test from 'node:test';
import assert from 'node:assert/strict';

test('upload validation: sanitize filename and reject path traversal', async () => {
  const { sanitizeFilename, validateUserUpload } = await import(
    '../../src/modules/kb/upload.validation'
  );

  assert.equal(sanitizeFilename('notes.txt'), 'notes.txt');
  assert.equal(sanitizeFilename('../../etc/passwd.txt'), 'passwd.txt');
  assert.throws(() => sanitizeFilename(''), /Недопустимое имя файла/);

  const ok = validateUserUpload({
    filename: 'doc.md',
    content: '# Title\n\nBody',
    maxBytes: 1024,
  });
  assert.equal(ok.sanitizedFilename, 'doc.md');
  assert.equal(ok.mime, 'text/markdown');
});

test('upload validation: rejects oversize, pdf and bad mime', async () => {
  const { validateUserUpload } = await import('../../src/modules/kb/upload.validation');

  assert.throws(
    () => validateUserUpload({ filename: 'big.txt', content: 'x'.repeat(20), maxBytes: 10 }),
    /превышает лимит/
  );

  assert.throws(
    () => validateUserUpload({ filename: 'scan.pdf', content: '%PDF', maxBytes: 1024 }),
    /PDF/
  );

  assert.throws(
    () => validateUserUpload({
      filename: 'notes.txt',
      content: 'hello',
      mime: 'application/pdf',
      maxBytes: 1024,
    }),
    /MIME/
  );
});
