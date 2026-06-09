# RAG v2 Ops Runbook (S9-5)

Операционные процедуры для VectorKB: re-index, смена embedding namespace, rollback.

## Prerequisites

| Check | Command |
| ----- | ------- |
| PG + pgvector | `npm run kb:pg:smoke` |
| Embedder health | `npm run embedding:smoke` |
| Migrations | `npm run kb:pg:migrate` |
| Local TEI stack | `npm run local:up && npm run local:smoke` |

Env: `docs/ops/LOCAL_DEV.md`, `docs/ops/PGVECTOR_CHECKLIST.md`, `docs/ops/EMBEDDING_CHECKLIST.md`.

---

## 1. Re-index global corpus

**When:** chunker/metadata change, corrupted index, post-migration repair.

```bash
cd avgexpert
npm run kb:pg:migrate
npm run kb:reindex-books
```

- Ingests books from `webui_src/assets/books/books.json`
- `replaceExisting: true` per book
- Report: `scratch/kb_reindex_report.json` (chunk counts + recall smoke)

**Single admin document** (JSON body with server-side `filePath`):

```bash
npm run kb:ingest -- --help
# or POST /api/admin/kb/documents (admin auth)
```

**User/session docs:** re-upload via UI/API; session attachments re-index via indexing queue on attach.

---

## 2. Namespace migration (embedding model change)

**When:** new `EMBEDDING_MODEL` / dims (§11.1) — vectors are **not** portable across models.

### Blue/green pattern

1. Choose new namespace, e.g. `bge-m3-v2` (env `EMBEDDING_NAMESPACE`).
2. Deploy embedder matching new model; verify `npm run embedding:smoke`.
3. Run full re-index **into new namespace** (`kb:reindex-books` + user uploads).
4. Staging cutover: `AVGEXPERT_DEPLOY_ENV=staging` (RAG v2 on) + smoke chat retrieval.
5. Prod cutover (S10): point gateway to new namespace; keep old namespace read-only 7–14 days.
6. After retro: `DELETE FROM kb_chunks WHERE namespace = '<old>'` (and matching `kb_documents`) — **irreversible**.

### Rollback within migration

- If new namespace quality fails eval: set `EMBEDDING_NAMESPACE` back to old value, restart gateway.
- Do **not** delete old namespace until sign-off.

---

## 3. Rollback RAG v2 → legacy path

Per §5.2 (updated S9: `yandex_file_search` no longer performs embed/search).

| Step | Action |
| ---- | ------ |
| 1 | Set `RAG_V2_ENABLED=false` (overrides staging default) |
| 2 | Restart gateway |
| 3 | Verify chat uses FTS fallback (`DegradedRetriever`) for consultant tier |
| 4 | `kb_chunks` / PG data unchanged — safe to re-enable v2 later |
| 5 | Re-enable: `RAG_V2_ENABLED=true` or `AVGEXPERT_DEPLOY_ENV=staging` |

**Prod emergency:** category-level `rag_enabled=false` in admin UI disables retrieval per category without global flag.

---

## 4. Load / latency gate (NFR-1)

| Target | p95 retrieval < 300 ms (excl. LLM), self-hosted embedder |
| Offline CI | `npm run test:s9` (mock concurrent retrieval) |
| Live probe | `npm run load:rag-retrieval` |

```bash
npm run load:rag-retrieval -- --concurrency=16 --rounds=5
```

Exit code 1 if p95 > 300 ms. Tune: TEI batch tokens, PG pool, `topK` per tier.

---

## 5. Security regression (S9-4)

Before prod cutover:

```bash
npm run test:s5
npm run test:rag
npm run test:s9
```

Checklist: `docs/ops/USER_KB_SECURITY.md` (isolation, upload validation, rate limit).

---

## 6. Staging defaults (S9-2)

| Env | Effect |
| --- | ------ |
| `AVGEXPERT_DEPLOY_ENV=staging` | `RAG_V2_ENABLED=true` unless explicitly set |
| Template | `.env.staging.example` |

Local dev stays `AVGEXPERT_DEPLOY_ENV=development` + `RAG_V2_ENABLED=false` in `.env.example`.

---

## 7. Production cutover (S10-1)

**Prerequisites:** staging smoke passed (`test:s9`, `load:rag-retrieval`), PG corpus indexed (`kb:reindex-books`), embedder healthy.

### Cutover checklist

| Step | Action |
| ---- | ------ |
| 1 | Copy `.env.production.example` → production `.env`; set secrets, `DATABASE_URL`, `EMBEDDING_API_URL` |
| 2 | `AVGEXPERT_DEPLOY_ENV=production` → `RAG_V2_ENABLED=true` by default |
| 3 | `npm run kb:pg:migrate` on prod PG |
| 4 | Verify `GET /health` → `vector.store=ok`, `vector.embedder=ok` |
| 5 | Smoke chat (consultant + expert) — context injected, no native `collection_ids` in provider payload |
| 6 | Monitor `GET /api/admin/dashboard/mvp` → `rag_metrics.rag_latency_ms.p95` < 300 ms |

### Rollback (prod emergency)

| Step | Action |
| ---- | ------ |
| 1 | `RAG_V2_ENABLED=false` + restart gateway |
| 2 | Legacy FTS path via `KnowledgeGateway` (consultant only) — **not recommended post-cutover** |
| 3 | Or per-category `rag_enabled=false` in admin UI |
| 4 | PG `kb_chunks` unchanged — re-enable v2 when ready |

### Post-cutover cleanup (after 7–14 days)

- `avg_vector_chunks` namespace read-only → archive/delete per §11.4
- `FTS_FALLBACK_ENABLED=false` optional if vector stack SLA proven (S10-2)
- Old `EMBEDDING_NAMESPACE` rows: `DELETE` only after retro sign-off
