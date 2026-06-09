# S2 — Ingestion + Re-index (2 недели)

**Этап:** 1 | **Предшественник:** [S1](./S01-vector-foundation.md) | **Следующий:** [S3](./S03-rag-integration.md)

## Цель

Chunking, ingestion pipeline, admin ingest API, re-index канонических книг (§11.4).

## Prereqs

- [ ] `HANDOFF-01.md`
- [ ] Vector module из S1 работает

## Задачи

| ID | Задача | DoD |
|----|--------|-----|
| S2-1 | `ChunkingService` | section-aware, md/txt |
| S2-2 | `IngestionPipeline` | CLI `npm run kb:ingest` |
| S2-3 | Admin API global ingest | POST /admin/kb/documents |
| S2-4 | Health vector section | /health |
| S2-5 | Re-index канонических книг | metadata §11.4, validation report |

## Метаданные чанка (§11.4)

`doc_type=canonical_book`, `book_id`, `book_title`, `chapter_*`, `section_*`, `section_path`, `page_from/to`, `chunk_index`, `checksum`.

Обогащение body: `Контекст: [Книга] | [Глава] | [Раздел]\n\n[Текст]`

## Источники книг

- `webui_src/assets/books/*.md`

## Тесты

```bash
npm run kb:ingest -- --scope=global --file webui_src/assets/books/tom-1.md
# validation: chunk count, metadata completeness
```

## Критерий выхода

- [ ] global docs в PG, search по query вручную работает
- [ ] Yandex 256d векторы **не** копировались

## Handoff → S3

Передать: CLI ingest пример, sample query + top hits, путь к validation report.
