# Модуль `cost` — учёт затрат LLM

**Статус:** На согласовании и доработке

**Спецификация:** [docs/cost-system/SPEC-COST-TRACKING.md](../../../../docs/cost-system/SPEC-COST-TRACKING.md) (v1.15)

## Назначение

Персистентный учёт денежных затрат на LLM-запросы: справочник тарифов по моделям, запись детализации в БД.

Расчёт `cost_usd` выполняется **в этом модуле** (`cost_calculator.service.ts`); адаптеры вызывают `costCalculator.enrichUsage()` после `ProviderUtils.normalizeUsage()`. Модуль владеет расчётом, персистентностью и fallback-справочником тарифов. **Канонические цены — в `.env` модели** (см. SPEC §10); `rates.config.ts` применяется только когда в `.env` цен нет.

## Структура (план реализации)

```
src/modules/cost/
├── README.md                    # этот файл
├── rates.config.ts              # MODEL_RATES — fallback-тарифы (цены модели — в её .env)
├── cost_calculator.service.ts   # parseCostRates, calculateCost, enrichUsage
└── cost_logger.service.ts       # logRequestCost → request_cost_log (внутри транзакции)
```

> `provider_rates.service.ts` и таблица `provider_rates` **не входят** в v1 (см. аудит §1.4).

## Зависимости

| Направление | Модуль / файл | Связь |
|-------------|---------------|-------|
| Вход | `chat/token_usage.service.ts` | `recordUsageAndCost()` вызывает `costLogger.logRequestCost()` в одной транзакции с `addTokenUsage` |
| Расчёт | `cost/cost_calculator.service.ts` | `parseCostRates` (цены из `_env` → fallback `rates.config.ts`); `calculateCost`, `enrichUsage` |
| Нормализация | `providers/adapters/provider_utils.ts` | `normalizeUsage` (cached_input_tokens); cost-логики не содержит |
| Цены модели | `providers/config/*.env` (+ `deploy/prod/providers/*.env`) | **источник тарифов** (один `.env` = одна модель): плоские `COST_USD_PER_1M_*` / `COST_MODE` / `COST_CURRENCY` / `COST_EXCHANGE_RATE`; грузится в `_env` через `configLoader`. `MODELS` — каталог выбора для админа, на цену не влияет |
| БД | `core/pg/migrations/004_app_cost.sql` | `request_cost_log` (token: `rate_*_per_token`; compute: `compute_seconds`, `rate_usd_per_hour`; `cost_usd` `NUMERIC(18,8)`), `users.cost_usd_used` |
| Метрики | `chat/chat.service.ts`, `chat/chat.controller.ts` | `traceBus.emitTrace(..., { costUsd })` → `metrics.service` |

## Почему отдельный модуль

- `token_usage.service` отвечает за квоту токенов — USD-логика отделена.
- Цены модели задаются в её `.env` (вся специфика модели — там же); cost domain владеет расчётом и fallback-справочником `MODEL_RATES`, не размазывая cost-логику по адаптерам.
- Единая точка для будущих расширений (admin API, отчёты) без раздувания `chat/` или `providers/`.

## Контракт `cost_logger.service.ts`

```typescript
logRequestCost(options: {
  requestId?,   // run_id / runId — идемпотентность (UNIQUE request_id, provider_id)
  username,
  providerId,
  providerName,
  adapterType,
  modelName,
  usage,        // ModelUsage с cost_usd, cached_input_tokens
  category?,
  source?,      // 'chat' | 'heavy path' | 'fast path'
}, client): Promise<void>  // выполняется на клиенте транзакции recordUsageAndCost
```

INSERT в `request_cost_log` включает снапшот на момент запроса:
- **token-mode:** `rate_input_per_token`, `rate_cached_input_per_token`, `rate_output_per_token` (USD/токен), `currency`, `exchange_rate`; `compute_seconds=0`, `rate_usd_per_hour=0`
- **compute-mode (llamacpp, SPEC §8):** `compute_seconds`, `rate_usd_per_hour`, `cost_mode='compute'`; `rate_*_per_token=0`

**Не fire-and-forget:** вызывается внутри `recordUsageAndCost` (`db.withTransaction`) — ошибка откатывает всю запись (токены + USD), исключая race на `users.cost_usd_used`. Параметры — `@name` через `DatabasePort` (см. `user.repository.ts`).

## Контракт `cost_calculator.service.ts`

```typescript
parseCostRates(config, modelName): NormalizedRates;
// token: ставки за токен из _env.COST_USD_PER_1M_* (÷1_000_000) → fallback MODEL_RATES → 0
// compute: rate_usd_per_hour, minBillableSeconds из _env; token rates = 0

calculateCost(usage, rates): number;
// token: cost_usd = Σ tokens × rate_per_token (§1.1)
// compute: cost_usd = (max(minBillable, usage.compute_seconds) / 3600) × rate_usd_per_hour (§1.2)

enrichUsage(usage, ctx: {
  providerId, modelName, config,
  computeSeconds?,   // llamacpp: wall-clock inference в адаптере
}): ModelUsage;
// проставляет usage.cost_usd, usage.compute_seconds, cost_mode, снапшот rates
```

## Контракт `rates.config.ts` (fallback)

```typescript
export interface ModelRate {
  input: number;   // USD за 1M токенов (как в .env)
  cached?: number; // USD за 1M токенов
  output: number;  // USD за 1M токенов
  costMode?: string;
}

export const MODEL_RATES: Record<string, ModelRate>;
```

`parseCostRates(config, modelName)` (в `cost_calculator.service.ts`) — порядок: `_env.COST_USD_PER_1M_*` → `MODEL_RATES` (fallback по `DEFAULT_MODEL`) → `0`. Значения в `.env` и `MODEL_RATES` — **per-1M**; калькулятор нормализует в ставку **за токен** (`÷ 1_000_000`). Учёт затрат — в USD за токен, без `/1000`. Один `.env` = одна модель (см. SPEC §10).
