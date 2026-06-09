-- kb schema for RAG v2 VectorKB (dims substituted at migrate time)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS kb_documents (
  id UUID PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'user', 'session')),
  owner_user_id TEXT,
  session_id TEXT,
  filename TEXT NOT NULL,
  mime TEXT,
  size BIGINT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  source_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_chunks (
  id UUID PRIMARY KEY,
  namespace TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'user', 'session')),
  owner_user_id TEXT,
  session_id TEXT,
  doc_id UUID REFERENCES kb_documents(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  title TEXT,
  section_path TEXT,
  page_from INT,
  page_to INT,
  doc_type TEXT,
  book_id UUID,
  book_title TEXT,
  chapter_index INT,
  chapter_title TEXT,
  section_index INT,
  section_title TEXT,
  domain_tags TEXT[],
  entity_ids UUID[],
  chunk_index INT,
  token_count INT,
  embedding vector(__EMBEDDING_DIMS__) NOT NULL,
  checksum TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kb_chunks_namespace_scope_idx
  ON kb_chunks (namespace, scope);

CREATE INDEX IF NOT EXISTS kb_chunks_owner_user_id_idx
  ON kb_chunks (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kb_chunks_session_id_idx
  ON kb_chunks (session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kb_chunks_doc_id_idx
  ON kb_chunks (doc_id)
  WHERE doc_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kb_chunks_embedding_hnsw_idx
  ON kb_chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS vector_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
