# Token Limits Backlog

> Статус: `backlog`  
> Дата создания: 2026-06-14  
> Область: формы `Пользователи`, `Пользователь`, `Категории`, `Категория`; backend users/categories/chat limits  
> Решение: лимиты задаются реальными токенами, без `*_credits`

---

## Цель

Перевести пользовательские и категорийные лимиты с кредитной модели на прямую модель токенов.

Новая модель:

- `input_context_limit` — лимит входного контекста пользователя в токенах.
- `output_generation_limit` — лимит выходной генерации пользователя в токенах.
- `input_context_default`, `input_context_max`, `max_tokens` — лимиты категории в токенах.

Старые поля `input_context_credits` и `output_generation_credits` удаляются без миграции данных: данных, которые нужно сохранить, пока нет.

---

## Правила лимитов

Все значения токенных лимитов:

- минимум: `4096`;
- шаг: `4096`;
- максимум: максимум адаптера;
- значение должно быть кратно `4096`;
- лимит пользователя не может превышать лимит категории;
- лимит категории не может превышать caps адаптера.

Для caps использовать:

- `caps.input` — максимум входного контекста;
- `caps.output` — максимум выходной генерации.

---

## Этапы

### Этап 0. Подготовка

Статус: `done`

Задачи:

- [ ] Зафиксировать новые поля пользователя: `input_context_limit`, `output_generation_limit`.
- [ ] Зафиксировать константу `TOKEN_LIMIT_STEP = 4096`.
- [ ] Определить общий helper валидации токенных лимитов.
- [ ] Проверить текущие caps адаптеров и место, откуда их брать для users/categories routes.

---

### Спринт TL-1. Модель данных и backend

Статус: `done`

Цель: перевести backend на прямые токенные лимиты и удалить кредитные поля.

Задачи:

- [x] Сделать миграцию БД: удалить `input_context_credits`, `output_generation_credits`.
- [x] Добавить в `users` поля `input_context_limit INTEGER NULL`, `output_generation_limit INTEGER NULL`.
- [x] Обновить `src/modules/auth/user.repository.ts`: типы, чтение, insert/update.
- [x] Обновить `src/modules/admin/admin.users.routes.ts`: schema, payload, validation.
- [x] Обновить `src/modules/auth/users.routes.ts`: schema, payload, profile update.
- [x] Удалить fallback/conversion `credits * 1000`.
- [x] Обновить ответы API, чтобы фронтенд получал только новые поля.

DoD:

- [x] В backend нет рабочих ссылок на `input_context_credits` и `output_generation_credits`.
- [x] Создание и обновление пользователя работают с `input_context_limit` и `output_generation_limit`.
- [x] Значения валидируются как токены.

---

### Спринт TL-2. Limit service и caps адаптеров

Статус: `done`

Цель: убрать credit-based расчеты из runtime-лимитов чата.

Задачи:

- [x] В `src/modules/chat/limit.service.ts` удалить `TOKENS_PER_CREDIT`.
- [x] Удалить `creditsToTokens`.
- [x] Удалить credit-based `USER_INPUT_MAX = 1000`, `USER_OUTPUT_MAX = 128`.
- [x] Добавить `TOKEN_LIMIT_STEP = 4096`.
- [x] Рассчитывать лимиты напрямую из `input_context_limit` и `output_generation_limit`.
- [x] Clamp делать по минимуму из user limit, category limit и adapter caps.
- [x] Обновить сообщения ошибок валидации.

DoD:

- [x] `4096` остается `4096`, без умножения на `1000`.
- [x] Значения ниже `4096`, некратные `4096` и выше caps отклоняются.
- [x] Chat runtime использует новые поля.

---

### Спринт TL-3. Категории

Статус: `done`

Цель: привести лимиты категорий к шагу `4096` и caps адаптеров.

Задачи:

- [x] В `src/modules/admin/admin.categories.routes.ts` добавить проверку кратности `4096`.
- [x] Проверять `input_context_default >= 4096`.
- [x] Проверять `input_context_max >= 4096`.
- [x] Проверять `max_tokens >= 4096`.
- [x] Проверять `input_context_default <= input_context_max`.
- [x] Проверять `input_context_max <= caps.input`.
- [x] Проверять `max_tokens <= caps.output`.
- [x] Заменить дефолты меньше `4096` в seed/config.

Кандидаты для проверки:

- `src/core/pg/seed.ts`
- `src/core/config.ts`
- provider defaults/routes, где встречаются `max_tokens` меньше `4096`

DoD:

- [x] Категорию нельзя сохранить с `1024`, `2048` или некратным шагу значением.
- [x] Категорийные лимиты не превышают caps адаптера.

---

### Спринт TL-4. Frontend: профиль пользователя

Статус: `done`

Цель: форма `Пользователь` управляет реальными токенами.

Задачи:

- [x] В `webui_src/index.html` переименовать `user-input-context-credits` в `user-input-context-limit`.
- [x] Переименовать `user-output-generation-credits` в `user-output-generation-limit`.
- [x] Установить controls `min="4096"`, `step="4096"`.
- [x] Выставлять `max` динамически по категории/адаптеру.
- [x] В `webui_src/ts/auth.ts` удалить деление/умножение на `1000`.
- [x] В `webui_src/ts/auth.ts` использовать `currentUser.input_context_limit`, `currentUser.output_generation_limit`.
- [x] В `webui_src/ts/main.ts` отправлять новые поля в payload.
- [x] Добавить frontend validation шага `4096`.

DoD:

- [x] В профиле пользователь видит значения токенов.
- [x] Сохранение `4096`, `8192`, `12288` проходит.
- [x] Сохранение `1024`, `5000` блокируется до отправки или backend-валидацией.

---

### Спринт TL-5. Frontend: админка пользователей

Статус: `done`

Цель: формы `Пользователи` и `Пользователь` в админке работают с токенными лимитами.

Задачи:

- [x] В `webui_src/index.html` переименовать `admin-input-context-credits` в `admin-input-context-limit`.
- [x] Переименовать `admin-output-generation-credits` в `admin-output-generation-limit`.
- [x] Установить controls `min="4096"`, `step="4096"`.
- [x] В `webui_src/ts/admin.ts` заменить чтение `u.input_context_credits` на `u.input_context_limit`.
- [x] Заменить чтение `u.output_generation_credits` на `u.output_generation_limit`.
- [x] В payload заменить `input_context_credits` на `input_context_limit`.
- [x] В payload заменить `output_generation_credits` на `output_generation_limit`.
- [x] При смене категории обновлять допустимые максимумы.
- [x] Добавить frontend validation шага `4096`.

DoD:

- [x] Админ может создать пользователя с токенными лимитами.
- [x] Админ может отредактировать лимиты пользователя.
- [x] Значения выше лимитов категории/caps отклоняются.

---

### Спринт TL-6. Frontend: категории

Статус: `done`

Цель: формы `Категории` и `Категория` используют движки/поля с шагом `4096`.

Задачи:

- [x] В `webui_src/index.html` для `admin-cat-input-context-default` установить `min="4096"`, `step="4096"`.
- [x] Для `admin-cat-input-context-max` установить `min="4096"`, `step="4096"`.
- [x] Для `admin-cat-max-tokens` установить `min="4096"`, `step="4096"`.
- [x] В `webui_src/ts/admin.ts` валидировать категорийные лимиты перед сохранением.
- [x] В списке категорий показывать лимиты как токены, форматированно.
- [x] Убрать терминологию кредитов из этих форм.

DoD:

- [x] Категорийные лимиты в UI задаются шагом `4096`.
- [x] Некратные значения не сохраняются.
- [x] Список категорий показывает токенные лимиты без слова "кредиты".

---

### Спринт TL-7. Типы и чистка хвостов

Статус: `done`

Цель: удалить старую терминологию из кода и типов.

Задачи:

- [x] В `webui_src/ts/types.ts` удалить `input_context_credits`.
- [x] Удалить `output_generation_credits`.
- [x] Добавить `input_context_limit?: number | null`.
- [x] Добавить `output_generation_limit?: number | null`.
- [x] Обновить backend interfaces/types.
- [x] Найти и удалить рабочие упоминания `TOKENS_PER_CREDIT`.
- [x] Найти и удалить рабочие упоминания `creditsToTokens`.
- [x] Найти и удалить тексты "в кредитах" для лимитов.
- [x] Не трогать billing-кредиты, если они относятся к оплате/балансу.

DoD:

- [x] В user/category limit path нет credit-based терминологии.
- [x] Billing path не сломан и отделен от token limits.

Примечание: повторный поиск нашел `input_context_credits`/`output_generation_credits` только в миграции удаления колонок, а тексты `в кредитах`/`кредитов` остались только в billing/балансе/покупке кредитов.

---

### Спринт TL-8. Проверка

Статус: `done`

Цель: подтвердить сквозную работу новой модели.

Задачи:

- [x] Запустить TypeScript build/check.
- [x] Проверить создание пользователя с `input_context_limit = 4096`.
- [x] Проверить отказ на `1024`.
- [x] Проверить отказ на `5000`.
- [x] Проверить отказ выше caps адаптера.
- [x] Проверить сохранение категории с `max_tokens = 4096`.
- [x] Проверить отказ категории с `max_tokens = 1024`.
- [x] Проверить профиль пользователя в UI.
- [x] Проверить админскую форму пользователя в UI.
- [x] Проверить форму категории в UI.
- [x] Проверить, что чат получает лимит напрямую.

DoD:

- [x] Build/check проходит.
- [x] Smoke-test UI пройден.
- [x] Runtime chat limits используют значения без скрытых множителей.

Примечание: 2026-06-14 выполнены `npm run typecheck`, `npm run build:web`,
`npx tsx --test tests/limit_service.test.ts tests/api.test.ts`,
одноразовый API smoke для `4096`/`1024`/`5000`/caps/category и Browser UI smoke.

---

## Глобальный список поиска перед закрытием

Перед переводом статуса из `backlog` в `in_progress` или `done` проверить:

- `input_context_credits`
- `output_generation_credits`
- `TOKENS_PER_CREDIT`
- `creditsToTokens`
- `в кредитах`
- `кредитов`

Контекст billing-кредитов не менять без отдельной задачи.

---

## Статус

`done`

TL-8 завершен.
