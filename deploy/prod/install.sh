#!/usr/bin/env bash
# Bootstrap AvgExpert on Linux GPU server (vGPU-8-16-L4-8Q)
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/prod/install.sh"
  exit 1
fi

APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEPLOY_DIR="$APP_ROOT/deploy/prod"
ENV_FILE="$DEPLOY_DIR/.env"

echo "=== AvgExpert production install ==="
echo "Target: Tesla L4 vGPU-8-16-L4-8Q (8 vCPU, 16 GB RAM, 8192 MB VRAM)"
echo "App root: $APP_ROOT"

# --- Docker ---
if ! command -v docker >/dev/null 2>&1; then
  echo "[1/6] Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "[1/6] Docker already installed"
fi

# --- NVIDIA Container Toolkit ---
if command -v nvidia-smi >/dev/null 2>&1; then
  if ! docker info 2>/dev/null | grep -qi nvidia; then
    echo "[2/6] Installing NVIDIA Container Toolkit..."
    distribution=$(. /etc/os-release; echo "${ID}${VERSION_ID}")
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
      | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -fsSL "https://nvidia.github.io/libnvidia-container/${distribution}/libnvidia-container.list" \
      | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
      > /etc/apt/sources.list.d/nvidia-container-toolkit.list
    apt-get update
    apt-get install -y nvidia-container-toolkit
    nvidia-ctk runtime configure --runtime=docker
    systemctl restart docker
  else
    echo "[2/6] NVIDIA Container Toolkit OK"
  fi
  nvidia-smi || true
else
  echo "[2/6] WARNING: nvidia-smi not found — GPU services may fail"
fi

# --- Env file ---
echo "[3/6] Preparing .env..."
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$DEPLOY_DIR/env.example" "$ENV_FILE"
  SECRET=$(openssl rand -hex 24)
  PG_PASS=$(openssl rand -hex 16)
  sed -i "s/change-me-strong-password/$PG_PASS/" "$ENV_FILE"
  sed -i "s/replace-with-at-least-32-random-characters/$SECRET/" "$ENV_FILE"
  echo "Created $ENV_FILE — edit PUBLIC_DOMAIN, ADMIN_PASSWORD, provider API keys"
else
  echo "Using existing $ENV_FILE"
fi

# --- Provider configs ---
echo "[4/6] Provider configs..."
PROVIDERS_DIR="$DEPLOY_DIR/providers"
for example in "$PROVIDERS_DIR"/*.env.example; do
  [[ -f "$example" ]] || continue
  target="${example%.example}"
  if [[ ! -f "$target" ]]; then
    cp "$example" "$target"
    echo "  created $(basename "$target") from example — add API keys"
  fi
done

# --- Swap (если prepare-server.sh ещё не создал) ---
echo "[5/6] Swap..."
if [[ $(swapon --show | wc -l) -lt 1 ]]; then
  echo "  Creating 8G swap (required for 16 GB RAM)..."
  fallocate -l 8G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  echo "  Swap already enabled (prepare-server.sh)"
fi

# --- Build & start ---
echo "[6/6] Starting stack (first run: model downloads 30–90 min)..."
cd "$APP_ROOT"
docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/compose.yml" up -d --build

echo ""
echo "=== Stack starting ==="
echo "  docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml ps"
echo "  docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml logs -f tei-bge-m3 llama-cpp"
echo ""
echo "After all services healthy:"
echo "  bash deploy/prod/scripts/post-deploy.sh"
echo ""
echo "WEB: http://<server-ip>/  (nginx) or http://127.0.0.1:8200 (localhost)"
echo "Edit deploy/prod/.env → AVGEXPERT_ADMIN_PASSWORD before first login"
