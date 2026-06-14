import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { RetrievalContext } from '../vector/ports/retriever';
import type { VectorHit, VectorScope } from '../vector/types';
import type {
  SemanticEdgeRecord,
  SemanticEdgeType,
  SemanticNodeRecord,
  SemanticNodeType,
} from './types';

export type UpsertGraphPayload = {
  namespace: string;
  nodes: Array<{
    id?: string;
    nodeType: SemanticNodeType;
    label: string;
    canonicalKey: string;
    docId?: string;
    chunkId?: string;
    metadata?: Record<string, unknown>;
  }>;
  edges: Array<{
    sourceCanonicalKey: string;
    targetCanonicalKey: string;
    edgeType: SemanticEdgeType;
    weight?: number;
    metadata?: Record<string, unknown>;
  }>;
};

export class SemanticGraphRepository {
  constructor(private readonly pool: Pool) {}

  async upsertGraph(payload: UpsertGraphPayload): Promise<{
    nodeIdsByKey: Map<string, string>;
    edgeCount: number;
  }> {
    const nodeIdsByKey = new Map<string, string>();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const node of payload.nodes) {
        const id = node.id || randomUUID();
        await client.query(
          `
            INSERT INTO kb_semantic_nodes (
              id, namespace, node_type, label, canonical_key,
              doc_id, chunk_id, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
            ON CONFLICT (namespace, canonical_key) DO UPDATE SET
              label = EXCLUDED.label,
              node_type = EXCLUDED.node_type,
              doc_id = COALESCE(EXCLUDED.doc_id, kb_semantic_nodes.doc_id),
              chunk_id = COALESCE(EXCLUDED.chunk_id, kb_semantic_nodes.chunk_id),
              metadata = kb_semantic_nodes.metadata || EXCLUDED.metadata
          `,
          [
            id,
            payload.namespace,
            node.nodeType,
            node.label,
            node.canonicalKey,
            node.docId || null,
            node.chunkId || null,
            JSON.stringify(node.metadata || {}),
          ]
        );
        nodeIdsByKey.set(node.canonicalKey, id);
      }

      const keyRows = await client.query<{ canonical_key: string; id: string }>(
        `
          SELECT canonical_key, id
          FROM kb_semantic_nodes
          WHERE namespace = $1
            AND canonical_key = ANY($2::text[])
        `,
        [payload.namespace, [...nodeIdsByKey.keys()]]
      );
      for (const row of keyRows.rows) {
        nodeIdsByKey.set(row.canonical_key, row.id);
      }

      let edgeCount = 0;
      for (const edge of payload.edges) {
        const sourceNodeId = nodeIdsByKey.get(edge.sourceCanonicalKey);
        const targetNodeId = nodeIdsByKey.get(edge.targetCanonicalKey);
        if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) continue;

        await client.query(
          `
            INSERT INTO kb_semantic_edges (
              id, namespace, source_node_id, target_node_id,
              edge_type, weight, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
            ON CONFLICT (namespace, source_node_id, target_node_id, edge_type) DO UPDATE SET
              weight = EXCLUDED.weight,
              metadata = kb_semantic_edges.metadata || EXCLUDED.metadata
          `,
          [
            randomUUID(),
            payload.namespace,
            sourceNodeId,
            targetNodeId,
            edge.edgeType,
            edge.weight ?? 1,
            JSON.stringify(edge.metadata || {}),
          ]
        );
        edgeCount += 1;
      }

      await client.query('COMMIT');
      return { nodeIdsByKey, edgeCount };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getNeighborChunkIds(
    namespace: string,
    nodeIds: string[]
  ): Promise<Array<{ chunkId: string; nodeId: string; weight: number }>> {
    if (nodeIds.length === 0) return [];

    const result = await this.pool.query<{
      chunk_id: string | null;
      node_id: string;
      weight: number;
    }>(
      `
        WITH seed AS (
          SELECT unnest($2::uuid[]) AS node_id
        ),
        neighbors AS (
          SELECT e.target_node_id AS node_id, e.weight
          FROM kb_semantic_edges e
          INNER JOIN seed s ON e.source_node_id = s.node_id
          WHERE e.namespace = $1
          UNION
          SELECT e.source_node_id AS node_id, e.weight
          FROM kb_semantic_edges e
          INNER JOIN seed s ON e.target_node_id = s.node_id
          WHERE e.namespace = $1
        )
        SELECT DISTINCT n.chunk_id, nb.node_id, nb.weight
        FROM neighbors nb
        INNER JOIN kb_semantic_nodes n
          ON n.id = nb.node_id
         AND n.namespace = $1
        WHERE n.chunk_id IS NOT NULL
      `,
      [namespace, nodeIds]
    );

    return result.rows
      .filter((row) => row.chunk_id)
      .map((row) => ({
        chunkId: row.chunk_id as string,
        nodeId: row.node_id,
        weight: row.weight,
      }));
  }

  private buildAccessClause(
    ctx: RetrievalContext | undefined,
    values: unknown[],
    startIndex: number
  ): string {
    if (!ctx) return 'TRUE';

    const parts: string[] = [];
    let index = startIndex;

    if (ctx.scopes.includes('global') && ctx.globalKbEnabled) {
      parts.push(`scope = 'global'`);
    }
    if (ctx.scopes.includes('user')) {
      parts.push(`(scope = 'user' AND owner_user_id = $${index++})`);
      values.push(ctx.userId);
    }
    if (ctx.scopes.includes('session') && ctx.sessionId) {
      parts.push(
        `(scope = 'session' AND owner_user_id = $${index} AND session_id = $${index + 1})`
      );
      values.push(ctx.userId, ctx.sessionId);
    }

    return parts.length > 0 ? `(${parts.join(' OR ')})` : 'FALSE';
  }

  async getChunksByIds(
    namespace: string,
    chunkIds: string[],
    ctx?: RetrievalContext
  ): Promise<VectorHit[]> {
    if (chunkIds.length === 0) return [];

    const values: unknown[] = [namespace, chunkIds];
    const accessClause = this.buildAccessClause(ctx, values, 3);

    const result = await this.pool.query<{
      id: string;
      namespace: string;
      scope: VectorScope;
      owner_user_id: string | null;
      session_id: string | null;
      doc_id: string | null;
      body: string;
      title: string | null;
      metadata: Record<string, unknown>;
      doc_type: string | null;
      domain_tags: string[] | null;
      indexed_at: string;
      entity_ids: string[] | null;
    }>(
      `
        SELECT
          id, namespace, scope, owner_user_id, session_id, doc_id,
          body, title, metadata, doc_type, domain_tags, indexed_at, entity_ids
        FROM kb_chunks
        WHERE namespace = $1
          AND id = ANY($2::uuid[])
          AND ${accessClause}
      `,
      values
    );

    return result.rows.map((row) => ({
      id: row.id,
      namespace: row.namespace,
      scope: row.scope,
      ownerUserId: row.owner_user_id || undefined,
      sessionId: row.session_id || undefined,
      docId: row.doc_id || undefined,
      body: row.body,
      title: row.title || undefined,
      score: 0,
      metadata: {
        ...(row.metadata || {}),
        doc_type: row.doc_type ?? row.metadata?.doc_type,
        domain_tags: row.domain_tags ?? row.metadata?.domain_tags,
        indexed_at: row.indexed_at,
        entity_ids: row.entity_ids ?? row.metadata?.entity_ids,
      },
    }));
  }

  async listNodes(namespace: string, limit = 100): Promise<SemanticNodeRecord[]> {
    const result = await this.pool.query(
      `
        SELECT id, namespace, node_type, label, canonical_key,
               doc_id, chunk_id, domain_boundary_id, metadata
        FROM kb_semantic_nodes
        WHERE namespace = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [namespace, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      namespace: row.namespace,
      nodeType: row.node_type,
      label: row.label,
      canonicalKey: row.canonical_key,
      docId: row.doc_id || undefined,
      chunkId: row.chunk_id || undefined,
      domainBoundaryId: row.domain_boundary_id || undefined,
      metadata: row.metadata || {},
    }));
  }

  async listEdges(namespace: string, limit = 100): Promise<SemanticEdgeRecord[]> {
    const result = await this.pool.query(
      `
        SELECT id, namespace, source_node_id, target_node_id,
               edge_type, weight, metadata
        FROM kb_semantic_edges
        WHERE namespace = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [namespace, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      namespace: row.namespace,
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id,
      edgeType: row.edge_type,
      weight: row.weight,
      metadata: row.metadata || {},
    }));
  }
}

