-- Semantic graph schema (S8 R&D spike; not required for RAG v1)
CREATE TABLE IF NOT EXISTS kb_semantic_nodes (
  id UUID PRIMARY KEY,
  namespace TEXT NOT NULL,
  node_type TEXT NOT NULL
    CHECK (node_type IN ('entity', 'concept', 'domain', 'section')),
  label TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  doc_id UUID REFERENCES kb_documents(id) ON DELETE SET NULL,
  chunk_id UUID REFERENCES kb_chunks(id) ON DELETE SET NULL,
  domain_boundary_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (namespace, canonical_key)
);

CREATE INDEX IF NOT EXISTS kb_semantic_nodes_namespace_idx
  ON kb_semantic_nodes (namespace);

CREATE INDEX IF NOT EXISTS kb_semantic_nodes_chunk_id_idx
  ON kb_semantic_nodes (chunk_id)
  WHERE chunk_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kb_semantic_nodes_doc_id_idx
  ON kb_semantic_nodes (doc_id)
  WHERE doc_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS kb_semantic_edges (
  id UUID PRIMARY KEY,
  namespace TEXT NOT NULL,
  source_node_id UUID NOT NULL REFERENCES kb_semantic_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES kb_semantic_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL
    CHECK (edge_type IN ('mentions', 'part_of', 'related_to', 'same_domain')),
  weight REAL NOT NULL DEFAULT 1.0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (namespace, source_node_id, target_node_id, edge_type)
);

CREATE INDEX IF NOT EXISTS kb_semantic_edges_namespace_source_idx
  ON kb_semantic_edges (namespace, source_node_id);

CREATE INDEX IF NOT EXISTS kb_semantic_edges_namespace_target_idx
  ON kb_semantic_edges (namespace, target_node_id);
