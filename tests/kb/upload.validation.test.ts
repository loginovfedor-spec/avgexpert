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

test('upload validation: rejects oversize, legacy binary pdf and bad mime', async () => {
  const { validateUserUpload } = await import('../../src/modules/kb/upload.validation');

  assert.throws(
    () => validateUserUpload({ filename: 'big.txt', content: 'x'.repeat(20), maxBytes: 10 }),
    /превышает лимит/
  );

  assert.throws(
    () => validateUserUpload({ filename: 'legacy.doc', content: 'hello', maxBytes: 1024 }),
    /не поддерживается/
  );

  assert.throws(
    () => validateUserUpload({
      filename: 'notes.txt',
      content: 'hello',
      mime: 'application/octet-stream',
      maxBytes: 1024,
    }),
    /MIME/
  );
});

test('upload validation: accepts extracted text from pdf and docx filenames', async () => {
  const { validateUserUpload } = await import('../../src/modules/kb/upload.validation');

  const pdf = validateUserUpload({
    filename: 'report.pdf',
    content: 'Extracted chapter text from PDF',
    maxBytes: 1024 * 1024,
  });
  assert.equal(pdf.sanitizedFilename, 'report.pdf');
  assert.equal(pdf.mime, 'application/pdf');

  const docx = validateUserUpload({
    filename: 'notes.docx',
    content: 'Extracted body from DOCX',
    maxBytes: 1024 * 1024,
  });
  assert.equal(docx.sanitizedFilename, 'notes.docx');
  assert.equal(
    docx.mime,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
});
