import test from 'node:test';
import assert from 'node:assert/strict';

test('DocumentContextResolver: user+session scopes by default', async () => {
  const { DocumentContextResolver } = await import(
    '../../src/modules/rag/document-context.resolver'
  );

  const resolver = new DocumentContextResolver();
  const ctx = resolver.resolve({
    retrievalTier: 'consultant',
    userId: 'alice',
    sessionId: 'sess-1',
  });

  assert.deepEqual(ctx.scopes, ['global', 'user', 'session']);
  assert.equal(ctx.userId, 'alice');
  assert.equal(ctx.sessionId, 'sess-1');
  assert.equal(ctx.tier, 'consultant');
  assert.equal(ctx.globalKbEnabled, true);
});

test('DocumentContextResolver: respects extra_params scope toggles', async () => {
  const { DocumentContextResolver } = await import(
    '../../src/modules/rag/document-context.resolver'
  );

  const resolver = new DocumentContextResolver();
  const ctx = resolver.resolve({
    retrievalTier: 'expert',
    userId: 'bob',
    extraParams: {
      global_kb_enabled: false,
      user_kb_enabled: true,
      session_kb_enabled: false,
    },
  });

  assert.deepEqual(ctx.scopes, ['user']);
  assert.equal(ctx.globalKbEnabled, false);
});

test('DocumentContextResolver: session scope only when sessionId present in retriever', async () => {
  const { TieredRetriever } = await import('../../src/modules/vector/retrievers/tiered.retriever');
  const { MockEmbeddingProvider } = await import('../../src/modules/vector/providers/mock.embedding');

  const searchedScopes: string[] = [];
  const store = {
    id: 'mock',
    async search(params: { filter?: { scope?: string } }) {
      if (params.filter?.scope) searchedScopes.push(params.filter.scope);
      return [];
    },
    async upsert() {},
    async delete() { return 0; },
    async health() { return true; },
  };

  const retriever = new TieredRetriever(new MockEmbeddingProvider({ dimensions: 8 }), store, 'ns');
  await retriever.retrieve('q', {
    userId: 'u1',
    tier: 'consultant',
    scopes: ['global', 'user', 'session'],
    globalKbEnabled: true,
  });

  assert.deepEqual(searchedScopes, ['global', 'user']);

  searchedScopes.length = 0;
  await retriever.retrieve('q', {
    userId: 'u1',
    sessionId: 's1',
    tier: 'consultant',
    scopes: ['global', 'user', 'session'],
    globalKbEnabled: true,
  });

  assert.deepEqual(searchedScopes, ['global', 'user', 'session']);
});
