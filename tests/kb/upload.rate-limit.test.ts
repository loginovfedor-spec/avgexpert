import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('S9-4: user KB upload route applies per-user rate limit middleware', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../src/modules/kb/kb.routes.ts'),
    'utf8'
  );
  assert.match(source, /uploadLimiter/);
  assert.match(source, /rateLimit\(/);
  assert.match(source, /router\.post\(\s*'\s*\/documents',\s*uploadLimiter/);
});
