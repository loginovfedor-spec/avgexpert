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

Статус: `backlog`

Цель: привести лимиты категорий к шагу `4096` и caps адаптеров.

Задачи:

- [ ] В `src/modules/admin/admin.categories.routes.ts` добавить проверку кратности `4096`.
- [ ] Проверять `input_context_default >= 4096`.
- [ ] Проверять `input_context_max >= 4096`.
- [ ] Проверять `max_tokens >= 4096`.
- [ ] Проверять `input_context_default <= input_context_max`.
- [ ] Проверять `input_context_max <= caps.input`.
- [ ] Проверять `max_tokens <= caps.output`.
- [ ] Заменить дефолты меньше `4096` в seed/config.

Кандидаты для проверки:

- `src/core/pg/seed.ts`
- `src/core/config.ts`
- provider defaults/routes, где встречаются `max_tokens` меньше `4096`

DoD:

- [ ] Категорию нельзя сохранить с `1024`, `2048` или некратным шагу значением.
- [ ] Категорийные лимиты не превышают caps адаптера.

---

### Спринт TL-4. Frontend: профиль пользователя

Статус: `backlog`

Цель: форма `Пользователь` управляет реальными токенами.

Задачи:

- [ ] В `webui_src/index.html` переименовать `user-input-context-credits` в `user-input-context-limit`.
- [ ] Переименовать `user-output-generation-credits` в `user-output-generation-limit`.
- [ ] Установить controls `min="4096"`, `step="4096"`.
- [ ] Выставлять `max` динамически по категории/адаптеру.
- [ ] В `webui_src/ts/auth.ts` удалить деление/умножение на `1000`.
- [ ] В `webui_src/ts/auth.ts` использовать `currentUser.input_context_limit`, `currentUser.output_generation_limit`.
- [ ] В `webui_src/ts/main.ts` отправлять новые поля в payload.
- [ ] Добавить frontend validation шага `4096`.

DoD:

- [ ] В профиле пользователь видит значения токенов.
- [ ] Сохранение `4096`, `8192`, `12288` проходит.
- [ ] Сохранение `1024`, `5000` блокируется до отправки или backend-валидацией.

---

### Спринт TL-5. Frontend: админка пользователей

Статус: `backlog`

Цель: формы `Пользователи` и `Пользователь` в админке работают с токенными лимитами.

Задачи:

- [ ] В `webui_src/index.html` переименовать `admin-input-context-credits` в `admin-input-context-limit`.
- [ ] Переименовать `admin-output-generation-credits` в `admin-output-generation-limit`.
- [ ] Установить controls `min="4096"`, `step="4096"`.
- [ ] В `webui_src/ts/admin.ts` заменить чтение `u.input_context_credits` на `u.input_context_limit`.
- [ ] Заменить чтение `u.output_generation_credits` на `u.output_generation_limit`.
- [ ] В payload заменить `input_context_credits` на `input_context_limit`.
- [ ] В payload заменить `output_generation_credits` на `output_generation_limit`.
- [ ] При смене категории обновлять допустимые максимумы.
- [ ] Добавить frontend validation шага `4096`.

DoD:

- [ ] Админ может создать пользователя с токенными лимитами.
- [ ] Админ может отредактировать лимиты пользователя.
- [ ] Значения выше лимитов категории/caps отклоняются.

---

### Спринт TL-6. Frontend: категории

Статус: `backlog`

Цель: формы `Категории` и `Категория` используют движки/поля с шагом `4096`.

Задачи:

- [ ] В `webui_src/index.html` для `admin-cat-input-context-default` установить `min="4096"`, `step="4096"`.
- [ ] Для `admin-cat-input-context-max` установить `min="4096"`, `step="4096"`.
- [ ] Для `admin-cat-max-tokens` установить `min="4096"`, `step="4096"`.
- [ ] В `webui_src/ts/admin.ts` валидировать категорийные лимиты перед сохранением.
- [ ] В списке категорий показывать лимиты как токены, форматированно.
- [ ] Убрать терминологию кредитов из этих форм.

DoD:

- [ ] Категорийные лимиты в UI задаются шагом `4096`.
- [ ] Некратные значения не сохраняются.
- [ ] Список категорий показывает токенные лимиты без слова "кредиты".

---

### Спринт TL-7. Типы и чистка хвостов

Статус: `backlog`

Цель: удалить старую терминологию из кода и типов.

Задачи:

- [ ] В `webui_src/ts/types.ts` удалить `input_context_credits`.
- [ ] Удалить `output_generation_credits`.
- [ ] Добавить `input_context_limit?: number | null`.
- [ ] Добавить `output_generation_limit?: number | null`.
- [ ] Обновить backend interfaces/types.
- [ ] Найти и удалить рабочие упоминания `TOKENS_PER_CREDIT`.
- [ ] Найти и удалить рабочие упоминания `creditsToTokens`.
- [ ] Найти и удалить тексты "в кредитах" для лимитов.
- [ ] Не трогать billing-кредиты, если они относятся к оплате/балансу.

DoD:

- [ ] В user/category limit path нет credit-based терминологии.
- [ ] Billing path не сломан и отделен от token limits.

---

### Спринт TL-8. Проверка

Статус: `backlog`

Цель: подтвердить сквозную работу новой модели.

Задачи:

- [ ] Запустить TypeScript build/check.
- [ ] Проверить создание пользователя с `input_context_limit = 4096`.
- [ ] Проверить отказ на `1024`.
- [ ] Проверить отказ на `5000`.
- [ ] Проверить отказ выше caps адаптера.
- [ ] Проверить сохранение категории с `max_tokens = 4096`.
- [ ] Проверить отказ категории с `max_tokens = 1024`.
- [ ] Проверить профиль пользователя в UI.
- [ ] Проверить админскую форму пользователя в UI.
- [ ] Проверить форму категории в UI.
- [ ] Проверить, что чат получает лимит напрямую.

DoD:

- [ ] Build/check проходит.
- [ ] Smoke-test UI пройден.
- [ ] Runtime chat limits используют значения без скрытых множителей.

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

`backlog`

Документ готов к постановке в активную программу после завершения текущего D6 или по отдельному решению пользователя.
