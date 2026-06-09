import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSemanticGraphEnabled } from '../../src/modules/semantic/semantic-graph.connection';

test('resolveSemanticGraphEnabled: sage only, opt-in via extra_params', () => {
  assert.equal(
    resolveSemanticGraphEnabled('consultant', { semantic_graph_enabled: true }),
    false
  );
  assert.equal(
    resolveSemanticGraphEnabled('expert', { semantic_graph_enabled: true }),
    false
  );
  assert.equal(
    resolveSemanticGraphEnabled('sage', { semantic_graph_enabled: true }),
    true
  );
  assert.equal(
    resolveSemanticGraphEnabled('sage', { semantic_graph_enabled: false }),
    false
  );
});

test('resolveSemanticGraphEnabled: falls back to env default', () => {
  const prev = process.env.SEMANTIC_GRAPH_ENABLED;
  process.env.SEMANTIC_GRAPH_ENABLED = 'true';
  assert.equal(resolveSemanticGraphEnabled('sage', {}), true);

  process.env.SEMANTIC_GRAPH_ENABLED = 'false';
  assert.equal(resolveSemanticGraphEnabled('sage', {}), false);

  process.env.SEMANTIC_GRAPH_ENABLED = prev;
});
