import test from 'node:test';
import assert from 'node:assert/strict';

test('DegradedRetriever falls back to FTS when primary throws', async () => {
  const { DegradedRetriever } = await import('../../src/modules/vector/retrievers/degraded.retriever');

  const primary = {
    async retrieveWithTiming() {
      throw new Error('embedder down');
    },
  };

  const fts = {
    async search(query: string) {
      return [{
        id: 'fts-1',
        sourceId: 'src-1',
        text: `fts result for ${query}`,
        score: 0.75,
        provenance: { title: 'FTS Doc', uri: 'fts://1' },
      }];
    },
  };

  const retriever = new DegradedRetriever(
    primary as never,
    fts,
    async () => ({
      store: 'ok',
      embedder: 'ok',
      namespace: 'test-ns',
      dimensions: 64,
    })
  );
  const result = await retriever.retrieveWithTiming('capital gains tax', {
    userId: 'user-a',
    tier: 'consultant',
    scopes: ['global'],
    globalKbEnabled: true,
  });

  assert.equal(result.degraded, true);
  assert.equal(result.retrieverId, 'pg-tsvector-fallback');
  assert.equal(result.chunks.length, 1);
  assert.match(result.chunks[0].text, /fts result/);
});

test('DegradedRetriever skips FTS when global scope is disabled', async () => {
  const { DegradedRetriever } = await import('../../src/modules/vector/retrievers/degraded.retriever');

  const fts = {
    async search() {
      throw new Error('FTS should not be called without global scope');
    },
  };

  const retriever = new DegradedRetriever(
    { retrieveWithTiming: async () => { throw new Error('down'); } } as never,
    fts,
    async () => ({
      store: 'unavailable',
      embedder: 'unavailable',
      namespace: 'test-ns',
      dimensions: 64,
    })
  );

  const result = await retriever.retrieveWithTiming('query', {
    userId: 'user-a',
    tier: 'consultant',
    scopes: ['user'],
    globalKbEnabled: false,
  });

  assert.equal(result.degraded, true);
  assert.equal(result.chunks.length, 0);
});

test('DegradedRetriever uses primary when vector health is ok', async () => {
  const { DegradedRetriever } = await import('../../src/modules/vector/retrievers/degraded.retriever');

  const primary = {
    async retrieveWithTiming() {
      return {
        chunks: [{
          id: 'v1',
          sourceId: 'v1',
          text: 'vector chunk',
          score: 0.9,
          provenance: { title: 'Vector', uri: 'vec://1' },
        }],
        embedMs: 5,
        searchMs: 10,
      };
    },
  };

  const fts = {
    async search() {
      throw new Error('FTS should not be called');
    },
  };

  const retriever = new DegradedRetriever(
    primary as never,
    fts,
    async () => ({
      store: 'ok',
      embedder: 'ok',
      namespace: 'test-ns',
      dimensions: 64,
    })
  );
  const result = await retriever.retrieveWithTiming('query', {
    userId: 'user-a',
    tier: 'consultant',
    scopes: ['global'],
    globalKbEnabled: true,
  });

  assert.equal(result.degraded, false);
  assert.equal(result.retrieverId, 'tiered-vector');
  assert.equal(result.chunks[0].text, 'vector chunk');
});
