# Compose stack profiles (prod / pilot)

Профиль задаётся переменной **`COMPOSE_STACK`** в `deploy/prod/.env` (или `ssh-deploy.env` для удалённых команд с ноутбука).

| Профиль | GPU | TEI embed | Llama | Когда использовать |
|---------|-----|-----------|-------|-------------------|
| **`cpu-pilot`** | нет | CPU | CPU | Текущий pilot без `nvidia-smi` |
| **`gpu-l4`** | L4, TEI+Llama на GPU | GPU | GPU (гибрид 24 слоя) | Полный L4 vGPU-8-16-L4-8Q |
| **`gpu-l4-8gb`** | L4, TEI на CPU | CPU | GPU (99 слоёв) | Максимум VRAM под Llama 7B |

## Быстрый старт

```bash
# В deploy/prod/.env:
COMPOSE_STACK=cpu-pilot   # или gpu-l4 / gpu-l4-8gb

# Любая compose-команда:
bash deploy/prod/scripts/compose-stack.sh run ps
bash deploy/prod/scripts/compose-stack.sh run up -d --build app
bash deploy/prod/scripts/post-deploy.sh
```

С ноутбука (после `ssh-deploy.env`):

```bash
npm run prod:ssh-update
```

## Переключение CPU → GPU

1. На сервере установить драйвер NVIDIA + Container Toolkit (`deploy/prod/install.sh` шаг 2).
2. Проверить: `nvidia-smi`.
3. В `deploy/prod/.env` сменить профиль и при необходимости параметры из `deploy/prod/presets/`:
   ```bash
   COMPOSE_STACK=gpu-l4-8gb
   # или gpu-l4 для TEI+Llama на GPU
   ```
4. Пересобрать стек:
   ```bash
   bash deploy/prod/scripts/compose-stack.sh run up -d --build
   sudo bash deploy/prod/scripts/post-deploy.sh
   ```

## Файлы override по профилям

**cpu-pilot:** `compose.yml` + tei-cpu + llama-cpu + deps + server  
**gpu-l4:** `compose.yml` + server  
**gpu-l4-8gb:** `compose.yml` + tei-cpu + server  

Presets env-переменных: `deploy/prod/presets/cpu-pilot.env`, `gpu-l4.env`, `gpu-l4-8gb.env`.
