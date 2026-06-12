import test from 'node:test';
import assert from 'node:assert/strict';
import { asMock } from '../helpers/cast';
import type { TieredRetriever } from '../../src/modules/vector/retrievers/tiered.retriever';
import type { VectorHealthSection } from '../../src/modules/vector/vector.health';

function withFtsFlag<T>(value: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.FTS_FALLBACK_ENABLED;
  process.env.FTS_FALLBACK_ENABLED = value;
  delete require.cache[require.resolve('../../src/core/config')];
  return fn().finally(() => {
    if (prev !== undefined) process.env.FTS_FALLBACK_ENABLED = prev;
    else delete process.env.FTS_FALLBACK_ENABLED;
    delete require.cache[require.resolve('../../src/core/config')];
  });
}

test('DegradedRetriever skips FTS when FTS_FALLBACK_ENABLED=false', async () => {
  await withFtsFlag('false', async () => {
  const { DegradedRetriever } = await import('../../src/modules/vector/retrievers/degraded.retriever');
  let ftsCalled = false;

  const retriever = new DegradedRetriever(
    asMock<TieredRetriever>({
      retrieveWithTiming: async () => {
        throw new Error('primary down');
      },
      retrieve: async () => [],
    }),
    {
      search: async () => {
        ftsCalled = true;
        return [];
      },
    },
    asMock<() => Promise<VectorHealthSection>>(async () =>
      asMock<VectorHealthSection>({ store: 'unavailable', embedder: 'ok', namespace: 'test', dimensions: 64 })
    )
  );

  const result = await retriever.retrieveWithTiming('query', {
    tier: 'consultant',
    scopes: ['global'],
    userId: 'u1',
    globalKbEnabled: true,
  });

    assert.equal(ftsCalled, false);
    assert.equal(result.retrieverId, 'vector-unavailable');
    assert.equal(result.degraded, true);
    assert.deepEqual(result.chunks, []);
  });
});

test('DegradedRetriever uses FTS when FTS_FALLBACK_ENABLED=true', async () => {
  await withFtsFlag('true', async () => {
  const { DegradedRetriever } = await import('../../src/modules/vector/retrievers/degraded.retriever');
  let ftsCalled = false;

  const retriever = new DegradedRetriever(
    asMock<TieredRetriever>({
      retrieveWithTiming: async () => {
        throw new Error('primary down');
      },
      retrieve: async () => [],
    }),
    {
      search: async () => {
        ftsCalled = true;
        return [{
          id: 'fts-1',
          sourceId: 'doc-1',
          text: 'fallback chunk',
          score: 0.5,
          provenance: { title: 'FTS' },
        }];
      },
    },
    asMock<() => Promise<VectorHealthSection>>(async () =>
      asMock<VectorHealthSection>({ store: 'unavailable', embedder: 'ok', namespace: 'test', dimensions: 64 })
    )
  );

  const result = await retriever.retrieveWithTiming('query', {
    tier: 'consultant',
    scopes: ['global'],
    userId: 'u1',
    globalKbEnabled: true,
  });

    assert.equal(ftsCalled, true);
    assert.equal(result.retrieverId, 'pg-tsvector-fallback');
    assert.equal(result.chunks.length, 1);
  });
});
