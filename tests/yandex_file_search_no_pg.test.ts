import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'node:assert/strict';
import test from 'node:test';
import yandexFileSearch from '../src/modules/providers/adapters/yandex_file_search';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('Yandex File Search adapter does not expose retrieval capability', () => {
  assert.equal(yandexFileSearch.id, 'yandex_file_search');
  assert.equal((yandexFileSearch.capabilities as Record<string, unknown>).retrieval, undefined);
});

test('yandex_file_search is inject-only: no embed/search in source', () => {
  const source = readFileSync(
    path.join(__dirname, '../src/modules/providers/adapters/yandex_file_search.ts'),
    'utf8'
  );
  assert.doesNotMatch(source, /_embedQuery|_searchVectorStore|avg_vector_chunks|yandex_llm_cache/);
  assert.match(source, /from '\.\/yandex'/);
  assert.doesNotMatch(source, /from ['"]pg['"]|require\(['"]pg['"]\)/);
});
