# Подготовка чистого сервера (русский язык + prod)

Пошаговая инструкция для **чистой Ubuntu** перед установкой AvgExpert.

Целевой сервер: **Tesla L4 vGPU-8-16-L4-8Q** (8 vCPU, 16 GB RAM, 8192 MB VRAM).

---

## Порядок действий

```
1. prepare-server.sh   → обновление ОС, ru_RU.UTF-8, swap, firewall
2. install.sh          → Docker, GPU runtime, compose up
3. .env + providers    → секреты и API-ключи
4. post-deploy.sh      → миграции PG, smoke
```

---

## Шаг 1. Первый вход по SSH

С вашего ПК:

```powershell
ssh root@IP_СЕРВЕРА
# или
ssh ubuntu@IP_СЕРВЕРА
```

Создайте пользователя с sudo (если зашли как root):

```bash
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

---

## Шаг 2. Клонирование проекта

```bash
sudo mkdir -p /opt/avgexpert
sudo chown $USER:$USER /opt/avgexpert
git clone <URL-репозитория> /opt/avgexpert
cd /opt/avgexpert/avgexpert
```

---

## Шаг 3. Подготовка системы (русский + обновления)

```bash
sudo bash deploy/prod/scripts/prepare-server.sh
```

Скрипт выполняет:

| Действие | Результат |
|----------|-----------|
| `apt update && upgrade` | Актуальные патчи безопасности |
| `ru_RU.UTF-8` | Русская локаль, UTF-8 для кириллицы |
| `Europe/Moscow` | Часовой пояс (переопределить: `TZ_REGION=Asia/Yekaterinburg`) |
| Swap 8 GB | Нужен для 16 GB RAM + Llama CPU offload |
| UFW | Открыты 22, 80, 443 |
| Пакеты | git, curl, jq, htop, rsync… |

Перезагрузка (рекомендуется после первого `dist-upgrade`):

```bash
sudo reboot
```

После reboot проверьте:

```bash
locale
# LANG=ru_RU.UTF-8

nvidia-smi
# Tesla L4, ~8192 MiB

timedatectl
```

---

## Шаг 4. Установка Docker и приложения

```bash
cd /opt/avgexpert/avgexpert
sudo bash deploy/prod/install.sh
```

---

## Шаг 5. Конфигурация

```bash
nano deploy/prod/.env
cp deploy/prod/providers/openai_gpt4_1.env.example deploy/prod/providers/openai_gpt4_1.env
nano deploy/prod/providers/openai_gpt4_1.env

docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml up -d
bash deploy/prod/scripts/post-deploy.sh
```

---

## Русский язык в приложении

| Уровень | Что настроено |
|---------|----------------|
| **ОС** | `ru_RU.UTF-8` — корректная кириллица в логах, путях, `nano` |
| **AvgExpert** | UI и чат изначально на русском (`webui_src`) |
| **LLM** | Qwen2.5-Instruct хорошо работает с русским |
| **RAG** | bge-m3 поддерживает многоязычный поиск, включая RU |

Дополнительно в `.env` не требуется — UTF-8 на сервере обязателен для загрузки PDF/DOCX с кириллицей.

---

## С ПК одной командой (SSH)

```bash
# prepare-server.sh на удалённой машине
ssh user@IP "cd /opt/avgexpert/avgexpert && sudo bash deploy/prod/scripts/prepare-server.sh"
```

Или расширьте `ssh-deploy.sh` — см. [SSH_DEPLOY.md](SSH_DEPLOY.md).

---

## Частые вопросы

**Нужен ли русский язык в консоли Ubuntu?**  
Для сервера достаточно локали `ru_RU.UTF-8`. Полная русификация GUI не нужна (сервер без рабочего стола).

**Драйвер NVIDIA не виден**  
На облачных GPU-ВМ драйвер часто предустановлен. Если `nvidia-smi` пустой — перезагрузка или тикет провайдеру.

**Другой часовой пояс**

```bash
sudo TZ_REGION=Asia/Novosibirsk bash deploy/prod/scripts/prepare-server.sh
# или после установки:
sudo timedatectl set-timezone Asia/Novosibirsk
```

---

## Чеклист готовности

- [ ] `locale` → `ru_RU.UTF-8`
- [ ] `apt upgrade` выполнен, reboot сделан
- [ ] `nvidia-smi` → L4
- [ ] swap 8G активен
- [ ] `ufw status` → 22, 80, 443
- [ ] `install.sh` завершился без ошибок
- [ ] `curl localhost:8200/health` → ok
