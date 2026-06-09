# Протокол работы агентов по спринтам RAG v2

Каждый спринт выполняется в **отдельном чате Cursor**. Бесшовность обеспечивается **файлами в репозитории**, а не историей чата.

## Источники правды (читать в этом порядке)

| # | Файл | Зачем |
|---|------|-------|
| 1 | [`SPRINT_STATE.md`](./SPRINT_STATE.md) | Текущий спринт, что сделано, блокеры, ключевые решения |
| 2 | `S{NN}-*.md` | Бриф **вашего** спринта (задачи, DoD, файлы, тесты) |
| 3 | [`../architecture/RAG_MIGRATION_PLAN.md`](../architecture/RAG_MIGRATION_PLAN.md) | Архитектура, NFR, §11 решения |
| 4 | `HANDOFF-{NN}.md` предыдущего спринта | Итог и контекст от предшественника |

## Как открыть новый чат спринта

Скопируйте в **первое сообщение** нового чата:

```text
Спринт: S{N} — {название}
Репозиторий: avgexpert (ветка main)

Перед началом работы:
1. Прочитай docs/sprints/SPRINT_STATE.md
2. Прочитай docs/sprints/S{NN}-*.md (бриф спринта)
3. Прочитай docs/sprints/HANDOFF-{N-1}.md (если есть)
4. Сверься с docs/architecture/RAG_MIGRATION_PLAN.md §6 и §11

Правила:
- Делай только задачи текущего спринта (Sx-y из брифа)
- Не меняй архитектурные решения §11 без явного согласования
- В конце спринта: тесты → HANDOFF → SPRINT_STATE → commit → push
- Сообщи, что прочитал, и предложи план по задачам брифа
```

Пример для Спринта 1:

```text
Спринт: S1 — Vector Foundation
Репозиторий: avgexpert (ветка main)

Перед началом работы:
1. Прочитай docs/sprints/SPRINT_STATE.md
2. Прочитай docs/sprints/S01-vector-foundation.md
3. Прочитай docs/sprints/HANDOFF-00.md (если есть)
4. Сверься с docs/architecture/RAG_MIGRATION_PLAN.md §6 Этап 1 и §11

Правила: (как выше)
```

## Цикл агента внутри спринта

```
START → Read STATE + Brief + HANDOFF → Plan → Implement (по задачам Sx-y)
     → Test (команды из брифа) → HANDOFF-{N}.md → Update SPRINT_STATE.md
     → git commit + push → Report пользователю
```

## Обязательный handoff в конце спринта

Агент **обязан** создать/обновить:

### 1. `HANDOFF-{NN}.md`

Шаблон — [`_HANDOFF_TEMPLATE.md`](./_HANDOFF_TEMPLATE.md).

### 2. `SPRINT_STATE.md`

- `current_sprint` → следующий
- `completed_sprints` → добавить текущий
- `decisions` → новые технические решения (модель, dims, env-переменные)
- `blockers` → открытые или снятые
- `next_agent_notes` → 3–5 предложений для следующего чата

### 3. Git

Один или несколько коммитов с префиксом `S{N}:` в сообщении.

## Карта спринтов

| Спринт | Бриф | Этап |
|--------|------|------|
| S0 | [S00-preparation.md](./S00-preparation.md) | Подготовка |
| S1 | [S01-vector-foundation.md](./S01-vector-foundation.md) | Vector Foundation |
| S2 | [S02-ingestion-reindex.md](./S02-ingestion-reindex.md) | Vector Foundation |
| S3 | [S03-rag-integration.md](./S03-rag-integration.md) | RAG Integration |
| S4 | [S04-llm-cutover.md](./S04-llm-cutover.md) | RAG Integration |
| S5 | [S05-user-kb.md](./S05-user-kb.md) | User/Session KB |
| S6 | [S06-session-kb.md](./S06-session-kb.md) | User/Session KB |
| S7 | [S07-tiers.md](./S07-tiers.md) | Tiers |
| S7b | [S07b-reranker.md](./S07b-reranker.md) | Tiers (follow-up) |
| S8 | [S08-semantic-spike.md](./S08-semantic-spike.md) | R&D spike |
| S9 | [S09-hardening.md](./S09-hardening.md) | Deprecation |
| S10 | [S10-prod-cutover.md](./S10-prod-cutover.md) | Prod cutover |

## Что НЕ передавать через чат

- Устные договорённости без записи в `SPRINT_STATE.md` или `HANDOFF-*.md`
- Незакоммиченный код
- Секреты (API keys) — только имена env-переменных

## Gate между спринтами

Следующий агент **не начинает**, пока в `SPRINT_STATE.md`:

- [ ] `status: completed` для предыдущего спринта
- [ ] `HANDOFF-{N}.md` существует
- [ ] Критерий выхода из брифа отмечен
