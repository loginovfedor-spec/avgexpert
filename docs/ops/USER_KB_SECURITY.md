# User KB Security Checklist (S5-7, S9-4)

**Scope:** `POST /api/user/documents`, `GET/DELETE /api/user/documents`, retrieval `scope=user`.

## Upload validation (S5-6)

| Control | Implementation |
| ------- | -------------- |
| Max file size | `KB_USER_MAX_FILE_BYTES` (default 5 MiB) |
| Max documents per user | Category limits (3/5/10) or `KB_USER_MAX_DOCS` override |
| MIME whitelist | `text/plain`, `text/markdown`, `text/x-markdown` |
| Extension whitelist | `.txt`, `.md`, `.markdown` |
| Filename sanitization | `path.basename`, strip unsafe chars, max 255 |
| Empty file | Rejected |

## Upload rate limit (S9-4)

| Control | Implementation |
| ------- | -------------- |
| Per-user upload throttle | `express-rate-limit` on `POST /api/user/documents` |
| Window / max | 20 uploads / 15 min / user (`uploadLimiter` in `kb.routes.ts`) |
| Test env | Limiter bypassed when `NODE_ENV=test` |

## SSRF / source_uri (S5-7)

| Control | Implementation |
| ------- | -------------- |
| HTTP(S) `source_uri` | Rejected via `assertSafeSourceUri` (same as admin ingest) |
| Default `source_uri` | `user://{username}/{filename}` — non-fetchable |

## PDF / malware policy (S5-7)

| Control | Decision |
| ------- | -------- |
| PDF uploads | **Rejected** on server (client chat attach may parse locally; user KB index is text-only) |
| DOCX / HTML / binary | **Rejected** by extension + MIME whitelist |
| Malware scanning | Not in v1 — reject binaries; session async queue (S6) may add sandbox later |

## Tenant isolation (S5-4, S5-8)

| Layer | Control |
| ----- | ------- |
| PG `kb_documents` | `owner_user_id` on `scope=user` |
| PG `kb_chunks` | `owner_user_id` + `scope` filter on search/delete |
| API | `findByIdForOwner`, list filtered by `owner_user_id` |
| Retriever | `scopeFilter` sets `ownerUserId` for `user` and `session` |
| RAG cache | `buildScopedCacheKey` includes `userId` + `sessionId` |

## Regression (S9-4)

Re-run before prod cutover:

```bash
npm run test:s5
npm run test:rag
npm run test:s9
```

| Check | Automated |
| ----- | --------- |
| Upload validation | `test:s5` |
| Tenant isolation (retriever + cache) | `test:rag` / `tenant-isolation.test.ts` |
| User API scope=user only | `test:s5` |
| Upload rate limit wired | `upload.rate-limit.test.ts` |
| yandex_file_search no embed/search | `yandex_file_search_no_pg.test.js` |

Manual: user A cannot `GET/DELETE` user B document by ID.
