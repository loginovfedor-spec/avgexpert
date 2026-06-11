#!/usr/bin/env bash
# Подготовка чистого Ubuntu-сервера: обновление, русская локаль, базовые пакеты.
# Запуск: sudo bash deploy/prod/scripts/prepare-server.sh
#
# После этого: sudo bash deploy/prod/install.sh
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Запустите от root: sudo bash deploy/prod/scripts/prepare-server.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
TZ_REGION="${TZ_REGION:-Europe/Moscow}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-8}"

echo "=== Подготовка сервера AvgExpert ==="
echo "Локаль: ru_RU.UTF-8 | Часовой пояс: $TZ_REGION"
echo ""

# --- 1. Обновление системы ---
echo "[1/7] Обновление пакетов..."
apt-get update
apt-get upgrade -y
apt-get dist-upgrade -y
apt-get autoremove -y

# --- 2. Базовые утилиты ---
echo "[2/7] Установка базовых пакетов..."
apt-get install -y \
  ca-certificates \
  curl \
  wget \
  git \
  gnupg \
  lsb-release \
  software-properties-common \
  apt-transport-https \
  locales \
  tzdata \
  nano \
  htop \
  jq \
  unzip \
  rsync \
  openssh-server \
  postgresql-client \
  ufw

# --- 3. Русская локаль UTF-8 ---
echo "[3/7] Настройка русской локали (ru_RU.UTF-8)..."
locale-gen ru_RU.UTF-8
update-locale LANG=ru_RU.UTF-8 LC_ALL=ru_RU.UTF-8 LANGUAGE=ru_RU:ru:en
localectl set-locale LANG=ru_RU.UTF-8 2>/dev/null || true

# Системные сообщения apt/journal на русском; приложения в UTF-8
cat >/etc/default/locale <<'EOF'
LANG=ru_RU.UTF-8
LC_ALL=ru_RU.UTF-8
LANGUAGE=ru_RU:ru:en
EOF

# --- 4. Часовой пояс ---
echo "[4/7] Часовой пояс: $TZ_REGION"
timedatectl set-timezone "$TZ_REGION"
timedatectl set-ntp true

# --- 5. Swap (16 GB RAM на vGPU-8-16-L4-8Q) ---
echo "[5/7] Swap ${SWAP_SIZE_GB}G..."
if [[ $(swapon --show | wc -l) -lt 1 ]]; then
  fallocate -l "${SWAP_SIZE_GB}G" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Меньше склонность вытеснять RAM при наличии swap
  sysctl -w vm.swappiness=10
  grep -q 'vm.swappiness' /etc/sysctl.d/99-avgexpert.conf 2>/dev/null || \
    echo 'vm.swappiness=10' >> /etc/sysctl.d/99-avgexpert.conf
else
  echo "  Swap уже включён"
fi

# --- 6. Firewall (базовый) ---
echo "[6/7] UFW: SSH + HTTP + HTTPS..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# --- 7. Проверка GPU (если уже установлен драйвер) ---
echo "[7/7] Проверка GPU..."
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
else
  echo "  nvidia-smi не найден — драйвер GPU обычно ставит провайдер ВМ."
  echo "  После перезагрузки выполните: nvidia-smi"
fi

echo ""
echo "=== Сервер подготовлен ==="
echo ""
echo "Текущие настройки:"
echo "  locale: $(locale | grep LANG= | head -1)"
echo "  time:   $(timedatectl | grep 'Time zone')"
echo "  swap:   $(swapon --show --bytes | tail -1 | awk '{print $3}' || echo 'нет')"
echo ""
echo "Рекомендуется перелогиниться (или reboot), затем:"
echo "  cd /opt/avgexpert/avgexpert   # или путь к проекту"
echo "  sudo bash deploy/prod/install.sh"
echo ""
echo "Если локаль не применилась в текущей сессии:"
echo "  export LANG=ru_RU.UTF-8 LC_ALL=ru_RU.UTF-8"
