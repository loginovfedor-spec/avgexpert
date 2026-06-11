-- D4-1: Russian tsvector FTS fallback on kb_chunks (ADR-2)

ALTER TABLE kb_chunks
  ADD COLUMN IF NOT EXISTS body_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('russian', coalesce(body, ''))) STORED;

CREATE INDEX IF NOT EXISTS kb_chunks_body_tsv_gin_idx
  ON kb_chunks USING gin (body_tsv);
