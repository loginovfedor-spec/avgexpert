import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'node:assert/strict';
import test from 'node:test';
import yandex from '../src/modules/providers/adapters/yandex';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('yandex adapter is inject-only: no retrieval capability', () => {
  assert.equal(yandex.id, 'yandex');
  assert.equal(yandex.capabilities.retrieval, undefined);
});

test('yandex adapter uses unified llm_response_cache repository', () => {
  const source = readFileSync(path.join(__dirname, '../src/modules/providers/adapters/yandex.ts'), 'utf8');
  assert.match(source, /llm_response_cache\.repository/);
  assert.doesNotMatch(source, /yandex_llm_cache/);
  assert.doesNotMatch(source, /_embedQuery|_searchVectorStore|avg_vector_chunks/);
  assert.doesNotMatch(source, /from ['"]pg['"]|require\(['"]pg['"]\)/);
});
