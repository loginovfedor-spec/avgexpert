import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertSafeSourceUri,
  resolveIngestFilePath,
} from '../../src/modules/ingestion/path-utils';

test('ingestion path utils', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-path-'));
  const allowedDir = path.join(tmpDir, 'allowed');
  fs.mkdirSync(allowedDir, { recursive: true });
  fs.writeFileSync(path.join(allowedDir, 'ok.md'), '# ok', 'utf-8');

  const prevAllowedDir = process.env.KB_INGEST_ALLOWED_DIR;
  process.env.KB_INGEST_ALLOWED_DIR = allowedDir;

  t.after(() => {
    process.env.KB_INGEST_ALLOWED_DIR = prevAllowedDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await t.test('resolveIngestFilePath accepts file in allowed dir', () => {
    const resolved = resolveIngestFilePath('ok.md', { cwd: tmpDir });
    assert.equal(resolved, path.join(allowedDir, 'ok.md'));
  });

  await t.test('resolveIngestFilePath rejects traversal', () => {
    assert.throws(
      () => resolveIngestFilePath('../../etc/passwd', { cwd: tmpDir }),
      /вне разрешённой директории/
    );
  });

  await t.test('assertSafeSourceUri rejects http', () => {
    assert.throws(
      () => assertSafeSourceUri('https://evil.example/doc'),
      /SSRF/
    );
  });
});
