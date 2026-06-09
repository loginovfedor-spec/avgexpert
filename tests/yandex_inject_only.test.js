const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

test('yandex adapter is inject-only: no pg at module load', () => {
  const originalLoad = Module._load;
  const adapterPath = '../src/modules/providers/adapters/yandex';
  delete require.cache[require.resolve(adapterPath)];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'pg') {
      throw new Error('pg must not be required by yandex adapter');
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    const adapter = require(adapterPath);
    assert.equal(adapter.id, 'yandex');
    assert.equal(adapter.capabilities.retrieval, undefined);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(adapterPath)];
  }
});

test('yandex adapter uses unified llm_response_cache repository', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(
    path.join(__dirname, '../src/modules/providers/adapters/yandex.js'),
    'utf8'
  );
  assert.match(source, /llm_response_cache\.repository/);
  assert.doesNotMatch(source, /yandex_llm_cache/);
  assert.doesNotMatch(source, /_embedQuery|_searchVectorStore|avg_vector_chunks/);
});
