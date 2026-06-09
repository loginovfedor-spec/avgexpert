import type { RetrievalTier } from '../vector/types';
import { getPgPool } from '../vector/pg/pool';
import { SemanticGraphRepository } from './semantic-graph.repository';
import { SemanticGraphService } from './semantic-graph.service';

export function parseBoolean(value: unknown, fallback = false): boolean {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

export function resolveSemanticGraphEnabled(
  tier: RetrievalTier,
  extraParams: Record<string, unknown> = {},
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (tier !== 'sage') return false;

  const explicit = extraParams.semantic_graph_enabled;
  if (explicit !== undefined && explicit !== null) {
    return parseBoolean(explicit, false);
  }

  return parseBoolean(env.SEMANTIC_GRAPH_ENABLED, false);
}

export function createSemanticGraphServiceFromEnv(
  namespace: string,
  _env: NodeJS.ProcessEnv = process.env
): SemanticGraphService | null {
  try {
    const pool = getPgPool();
    const repository = new SemanticGraphRepository(pool);
    return new SemanticGraphService(repository, namespace);
  } catch {
    return null;
  }
}

module.exports = {
  parseBoolean,
  resolveSemanticGraphEnabled,
  createSemanticGraphServiceFromEnv,
};
