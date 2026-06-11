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

THREADS="${LLAMA_THREADS:-4}"
CTX_SIZE="${LLAMA_CTX_SIZE:-4096}"
BATCH="${LLAMA_BATCH:-256}"
N_GPU_LAYERS="${LLAMA_N_GPU_LAYERS:-24}"

echo "[llama-cpp] Starting CUDA server (ctx=${CTX_SIZE}, threads=${THREADS}, ngl=${N_GPU_LAYERS})"
exec /app/llama-server \
  -m "$MODEL_PATH" \
  -c "$CTX_SIZE" \
  -t "$THREADS" \
  -b "$BATCH" \
  -ngl "$N_GPU_LAYERS" \
  --host 0.0.0.0 \
  --port 8080
