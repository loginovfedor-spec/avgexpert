const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

test('Yandex File Search adapter does not require pg at module load time', () => {
  const originalLoad = Module._load;
  const adapterPath = '../src/modules/providers/adapters/yandex_file_search';
  delete require.cache[require.resolve(adapterPath)];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'pg') {
      throw new Error('pg must not be required by yandex_file_search');
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    const adapter = require(adapterPath);
    assert.equal(adapter.id, 'yandex_file_search');
    assert.equal(adapter.capabilities.retrieval, undefined);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(adapterPath)];
  }
});

test('yandex_file_search is inject-only: no embed/search in source', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/modules/providers/adapters/yandex_file_search.js'),
    'utf8'
  );
  assert.doesNotMatch(source, /_embedQuery|_searchVectorStore|avg_vector_chunks|yandex_llm_cache/);
  assert.match(source, /require\('\.\/yandex'\)/);
});
