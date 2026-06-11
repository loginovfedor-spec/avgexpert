#!/bin/sh
set -e

MODEL_DIR=/models
MODEL_FILE="${LLAMA_MODEL_FILE:-Qwen2.5-7B-Instruct-Q4_K_M.gguf}"
MODEL_PATH="${MODEL_DIR}/${MODEL_FILE}"
MODEL_URL="${LLAMA_MODEL_URL:-https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf}"

mkdir -p "$MODEL_DIR"

if [ ! -s "$MODEL_PATH" ]; then
  echo "[llama-cpp] Downloading ${MODEL_FILE} (~4.7 GB)..."
  curl -fL --retry 3 --retry-delay 5 -o "${MODEL_PATH}.partial" "$MODEL_URL"
  mv "${MODEL_PATH}.partial" "$MODEL_PATH"
  echo "[llama-cpp] Download complete."
else
  echo "[llama-cpp] Model ready: $MODEL_PATH"
fi

THREADS="${LLAMA_THREADS:-8}"
CTX_SIZE="${LLAMA_CTX_SIZE:-16384}"
BATCH="${LLAMA_BATCH:-512}"

echo "[llama-cpp] Starting server (ctx=${CTX_SIZE}, threads=${THREADS})"
exec /app/llama-server \
  -m "$MODEL_PATH" \
  -c "$CTX_SIZE" \
  -t "$THREADS" \
  -b "$BATCH" \
  --host 0.0.0.0 \
  --port 8080
