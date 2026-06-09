const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

test('Gateway root package does not declare pg as a global dependency', () => {
  const packageJson = require('../package.json');
  assert.equal(packageJson.dependencies.pg, undefined);

  const lockPath = path.join(__dirname, '..', 'package-lock.json');
  const lockText = fs.readFileSync(lockPath, 'utf8');
  assert.equal(lockText.includes('"node_modules/pg"'), false);
});

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
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(adapterPath)];
  }
});

test('Yandex File Search keeps pg in an adapter-local package', () => {
  const packageJson = require('../src/modules/providers/adapters/yandex_file_search_pg/package.json');
  assert.match(packageJson.dependencies.pg, /^\^?8\./);
});
