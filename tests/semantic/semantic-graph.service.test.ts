import test from 'node:test';
import assert from 'node:assert/strict';
import { SemanticGraphService } from '../../src/modules/semantic/semantic-graph.service';
import type { VectorHit } from '../../src/modules/vector/types';

function hit(id: string, score: number, entityIds?: string[]): VectorHit {
  return {
    id,
    namespace: 'ns',
    scope: 'global',
    body: `body-${id}`,
    score,
    metadata: entityIds ? { entity_ids: entityIds } : {},
  };
}

test('SemanticGraphService.expand: adds 1-hop neighbor chunks', async () => {
  const repository = {
    async getNeighborChunkIds(_namespace: string, nodeIds: string[]) {
      assert.deepEqual(nodeIds, ['node-a']);
      return [{ chunkId: 'neighbor-1', nodeId: 'node-b', weight: 1 }];
    },
    async getChunksByIds(_namespace: string, chunkIds: string[]) {
      assert.deepEqual(chunkIds, ['neighbor-1']);
      return [hit('neighbor-1', 0)];
    },
  };

  const service = new SemanticGraphService(repository as never, 'ns');
  const expanded = await service.expand([hit('seed', 0.9, ['node-a'])], 1);

  assert.equal(expanded.length, 2);
  assert.equal(expanded[0].id, 'seed');
  assert.equal(expanded[1].id, 'neighbor-1');
  assert.equal(expanded[1].metadata.graph_expanded, true);
  assert.ok(expanded[1].score < 0.9);
});

test('SemanticGraphService.expand: no-op without entity_ids', async () => {
  const repository = {
    async getNeighborChunkIds() {
      throw new Error('should not be called');
    },
    async getChunksByIds() {
      throw new Error('should not be called');
    },
  };

  const service = new SemanticGraphService(repository as never, 'ns');
  const hits = [hit('seed', 0.9)];
  const expanded = await service.expand(hits, 1);
  assert.deepEqual(expanded, hits);
});
