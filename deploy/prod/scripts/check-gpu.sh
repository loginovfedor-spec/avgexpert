#!/usr/bin/env bash
# Quick VRAM/RAM check for vGPU-8-16-L4-8Q
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ENV_FILE="$ROOT/deploy/prod/.env"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== GPU ==="
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu --format=csv
else
  echo "nvidia-smi not found (COMPOSE_STACK=cpu-pilot is OK)"
fi

echo ""
echo "=== RAM ==="
free -h

echo ""
echo "=== Docker (avgexpert) ==="
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=compose-stack.sh
  source "$SCRIPT_DIR/compose-stack.sh"
  echo "COMPOSE_STACK=$COMPOSE_STACK"
  compose_prod ps 2>/dev/null || true
fi

echo ""
echo "Profiles: deploy/prod/stacks/README.md"
echo "Target GPU: 8192 MB VRAM — presets in deploy/prod/presets/"
