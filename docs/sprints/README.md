# Спринты RAG v2

## Для вас (минимум действий)

**Новый чат:** «продолжай RAG» / «делай» / описание проблемы. Номера и copy-paste не нужны.

**Вы отвечаете только когда:**
- противоречие с планом или §11;
- архитектурное решение вне §11;
- отклонение от scope;
- **утверждение оптимизаций:** `ок OPT-001, OPT-003` или `reject OPT-002`.

## Два файла + §12 плана

| Файл | Содержание |
|------|------------|
| [`RAG_MIGRATION_PLAN.md`](../architecture/RAG_MIGRATION_PLAN.md) §6 | Задачи, DoD |
| [`RAG_MIGRATION_PLAN.md`](../architecture/RAG_MIGRATION_PLAN.md) §12 | Backlog оптимизаций (OPT-*) |
| [`SPRINT_STATE.md`](./SPRINT_STATE.md) | Прогресс, RETRO, Bugbot-итоги |

## Конец спринта (агент, автоматически)

1. Тесты
2. **Bugbot-review** изменений спринта (обязательно)
3. RETRO в `SPRINT_STATE.md`
4. Предложения OPT-* → §12 (`proposed`)
5. commit + push
6. Краткий отчёт; вопросы — только при расхождениях или OPT, требующих решения

## Карта спринтов

[`RAG_MIGRATION_PLAN.md` §6](../architecture/RAG_MIGRATION_PLAN.md): S0…S10 (+ S7b).
