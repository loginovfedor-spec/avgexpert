import test from 'node:test';
import assert from 'node:assert/strict';

test('computeMetadataBoost: consultant tier returns zero', async () => {
  const { computeMetadataBoost } = await import('../../src/modules/rag/metadata-scoring');

  assert.equal(
    computeMetadataBoost({
      baseScore: 0.8,
      docType: 'canonical_book',
      domainTags: ['reactor'],
      query: 'reactor safety',
      tier: 'consultant',
    }),
    0
  );
});

test('computeMetadataBoost: expert boosts canonical_book doc_type', async () => {
  const { computeMetadataBoost } = await import('../../src/modules/rag/metadata-scoring');

  const boost = computeMetadataBoost({
    baseScore: 0.7,
    docType: 'canonical_book',
    query: 'RX-900',
    tier: 'expert',
  });

  assert.ok(boost >= 0.04);
});

test('computeMetadataBoost: expert boosts matching domain_tags', async () => {
  const { computeMetadataBoost } = await import('../../src/modules/rag/metadata-scoring');

  const withMatch = computeMetadataBoost({
    baseScore: 0.7,
    domainTags: ['reactor', 'safety'],
    query: 'reactor safety shutdown system',
    tier: 'expert',
  });

  const withoutMatch = computeMetadataBoost({
    baseScore: 0.7,
    domainTags: ['finance'],
    query: 'reactor safety shutdown system',
    tier: 'expert',
  });

  assert.ok(withMatch > withoutMatch);
});

test('computeMetadataBoost: sage adds recency boost for recent docs', async () => {
  const { computeMetadataBoost } = await import('../../src/modules/rag/metadata-scoring');

  const recent = computeMetadataBoost({
    baseScore: 0.7,
    indexedAt: new Date().toISOString(),
    query: 'test',
    tier: 'sage',
  });

  const old = computeMetadataBoost({
    baseScore: 0.7,
    indexedAt: '2020-01-01T00:00:00.000Z',
    query: 'test',
    tier: 'sage',
  });

  assert.ok(recent > old);
  assert.ok(recent >= 0.05);
});

test('applyMetadataScoring: reorders expert hits by metadata boost', async () => {
  const { applyMetadataScoring } = await import('../../src/modules/rag/metadata-scoring');

  const hits = [
    {
      id: 'a',
      namespace: 'ns',
      scope: 'global' as const,
      body: 'generic',
      score: 0.82,
      metadata: { doc_type: 'note' },
    },
    {
      id: 'b',
      namespace: 'ns',
      scope: 'global' as const,
      body: 'book',
      score: 0.80,
      metadata: { doc_type: 'canonical_book', domain_tags: ['reactor'] },
    },
  ];

  const ranked = applyMetadataScoring(hits, 'reactor RX-900', 'expert');
  assert.equal(ranked[0].id, 'b');
  assert.ok(ranked[0].score > 0.80);
});

test('tagMatchesQuery avoids short substring false positives', async () => {
  const { computeMetadataBoost } = await import('../../src/modules/rag/metadata-scoring');

  const falsePositive = computeMetadataBoost({
    baseScore: 0.7,
    domainTags: ['ecosystem'],
    query: 'system shutdown',
    tier: 'expert',
  });

  const trueMatch = computeMetadataBoost({
    baseScore: 0.7,
    domainTags: ['reactor'],
    query: 'reactor safety',
    tier: 'expert',
  });

  assert.ok(trueMatch > falsePositive);
});

test('candidateTopK: expert/sage fetch wider candidate pool', async () => {
  const { candidateTopK } = await import('../../src/modules/rag/metadata-scoring');

  assert.equal(candidateTopK('consultant', 3), 3);
  assert.equal(candidateTopK('expert', 7), 21);
  assert.equal(candidateTopK('sage', 12), 36);
});
