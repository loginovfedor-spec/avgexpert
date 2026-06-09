import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDomainTagsFilter } from '../../src/modules/rag/domain-tags-filter';
import type { VectorHit } from '../../src/modules/vector/types';

function hit(id: string, score: number, domainTags?: string[]): VectorHit {
  return {
    id,
    namespace: 'ns',
    scope: 'global',
    body: id,
    score,
    metadata: domainTags ? { domain_tags: domainTags } : {},
  };
}

test('applyDomainTagsFilter: consultant bypasses filter', () => {
  const hits = [hit('a', 0.9, ['finance']), hit('b', 0.8, ['reactor'])];
  const filtered = applyDomainTagsFilter(hits, 'reactor safety', 'consultant');
  assert.equal(filtered.length, 2);
});

test('applyDomainTagsFilter: expert keeps only matching tagged hits when signal exists', () => {
  const hits = [
    hit('reactor', 0.8, ['reactor']),
    hit('finance', 0.9, ['finance']),
    hit('untagged', 0.7),
  ];

  const filtered = applyDomainTagsFilter(hits, 'reactor safety', 'expert');
  assert.deepEqual(filtered.map((item) => item.id), ['reactor', 'untagged']);
});

test('applyDomainTagsFilter: no signal keeps all expert hits', () => {
  const hits = [hit('a', 0.9, ['finance']), hit('b', 0.8, ['policy'])];
  const filtered = applyDomainTagsFilter(hits, 'random topic', 'expert');
  assert.equal(filtered.length, 2);
});

test('applyDomainTagsFilter: sage uses same filter semantics', () => {
  const hits = [hit('match', 0.8, ['analysis']), hit('miss', 0.9, ['finance'])];
  const filtered = applyDomainTagsFilter(hits, 'analysis report', 'sage');
  assert.deepEqual(filtered.map((item) => item.id), ['match']);
});
