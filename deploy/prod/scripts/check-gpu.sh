#!/usr/bin/env bash
# Quick VRAM/RAM check for vGPU-8-16-L4-8Q
set -euo pipefail

echo "=== GPU ==="
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu --format=csv
else
  echo "nvidia-smi not found"
fi

echo ""
echo "=== RAM ==="
free -h

echo ""
echo "=== Docker (avgexpert) ==="
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ENV_FILE="$ROOT/deploy/prod/.env"
COMPOSE_FILE="$ROOT/deploy/prod/compose.yml"

if [[ -f "$ENV_FILE" ]]; then
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps 2>/dev/null || true
fi

echo ""
echo "Target: 8192 MB VRAM total. If OOM — see deploy/prod/presets/8gb-vram.env"
