import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePgConnectionString } from '../../src/modules/vector/pg/connection';

test('resolvePgConnectionString: из providers/config/yandex_file_search.env', () => {
  const url = resolvePgConnectionString({
    VECTOR_PG_PROVIDER: 'yandex_file_search',
  });
  assert.ok(url);
  assert.match(url!, /^postgresql:\/\//);
});

test('resolvePgConnectionString: process.env имеет приоритет', () => {
  const override = 'postgresql://override:5432/test';
  const url = resolvePgConnectionString({
    DATABASE_URL: override,
    VECTOR_PG_PROVIDER: 'yandex_file_search',
  });
  assert.equal(url, override);
});
