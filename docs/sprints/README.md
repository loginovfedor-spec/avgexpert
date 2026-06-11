# Спринты

## Для вас — один чат, одна фраза

**Новый чат:** напишите **`продолжай`** или **`делай`**.

План, ADR и номер спринта **в чат не копировать** — агент читает:

1. [`SPRINT_STATE.md`](./SPRINT_STATE.md) — **главный файл**
2. [`.cursor/rules/pg18-sprint-handoff.mdc`](../../.cursor/rules/pg18-sprint-handoff.mdc) — регламент (подключён автоматически)

Вы отвечаете только когда:

- противоречие с планом или ADR;
- архитектурное решение вне ADR;
- scope change;
- утверждение OPT-* (legacy RAG): `ок OPT-001` / `reject OPT-002`.

---

## Активная программа: PG 18 + Docker (D0…D6)

| Что | Где |
|-----|-----|
| Прогресс, задачи, ADR | [`SPRINT_STATE.md`](./SPRINT_STATE.md) |
| Полный план, DoD по спринтам | [`PG18_DOCKER_UNIFIED_PLAN.md`](../plans/PG18_DOCKER_UNIFIED_PLAN.md) §6 |
| Dev ноутбук → remote Docker | [`DEV_REMOTE.md`](../../deploy/dev/DEV_REMOTE.md) |

**Один спринт = один чат.** После RETRO агент скажет: «новый чат → продолжай».

---

## Legacy: RAG v2 (S0…S10) — завершена

| Файл | Содержание |
|------|------------|
| [`RAG_MIGRATION_PLAN.md`](../architecture/RAG_MIGRATION_PLAN.md) | §3.5.1 upload, §11, §12 OPT |
| [`SPRINT_STATE.md`](./SPRINT_STATE.md) | RETRO S0…S10 |

Политики upload / `stripNativeRag` — по-прежнему в [`rag-sprint-handoff.mdc`](../../.cursor/rules/rag-sprint-handoff.mdc).

---

## Конец спринта D (делает агент)

1. Тесты  
2. Bugbot-review  
3. RETRO в `SPRINT_STATE.md`  
4. Обновить `current_sprint` + таблицу задач следующего спринта  
5. commit + push  
6. Вам: «новый чат → **продолжай**»
