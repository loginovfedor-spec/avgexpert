import type { RetrievalContext } from '../vector/ports/retriever';
import type { VectorHit } from '../vector/types';
import { SemanticGraphRepository } from './semantic-graph.repository';

const EXPANSION_SCORE_DECAY = 0.85;

function collectSeedNodeIds(hits: VectorHit[]): string[] {
  const ids = new Set<string>();
  for (const hit of hits) {
    const entityIds = hit.metadata?.entity_ids;
    if (Array.isArray(entityIds)) {
      for (const id of entityIds) {
        if (typeof id === 'string' && id.length > 0) ids.add(id);
      }
    }
  }
  return [...ids];
}

export class SemanticGraphService {
  constructor(
    private readonly repository: SemanticGraphRepository,
    private readonly namespace: string
  ) {}

  async expand(hits: VectorHit[], hops = 1, ctx?: RetrievalContext): Promise<VectorHit[]> {
    if (hops < 1 || hits.length === 0) return hits;

    const seedNodeIds = collectSeedNodeIds(hits);
    if (seedNodeIds.length === 0) return hits;

    const neighbors = await this.repository.getNeighborChunkIds(this.namespace, seedNodeIds);
    if (neighbors.length === 0) return hits;

    const existingIds = new Set(hits.map((hit) => hit.id));
    const neighborChunkIds = neighbors
      .map((item) => item.chunkId)
      .filter((chunkId) => !existingIds.has(chunkId));

    if (neighborChunkIds.length === 0) return hits;

    const extraHits = await this.repository.getChunksByIds(
      this.namespace,
      neighborChunkIds,
      ctx
    );
    const weightByChunk = new Map(neighbors.map((item) => [item.chunkId, item.weight]));

    const expanded = [...hits];
    for (const hit of extraHits) {
      if (existingIds.has(hit.id)) continue;
      const baseScore = hits[0]?.score ?? 0.5;
      const edgeWeight = weightByChunk.get(hit.id) ?? 1;
      expanded.push({
        ...hit,
        score: Math.min(1, baseScore * EXPANSION_SCORE_DECAY * edgeWeight),
        metadata: {
          ...hit.metadata,
          graph_expanded: true,
        },
      });
      existingIds.add(hit.id);
    }

    return expanded.sort((a, b) => b.score - a.score);
  }
}

