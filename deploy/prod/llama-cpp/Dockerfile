# CUDA llama.cpp server for NVIDIA L4 (Ada, compute 8.9)
FROM ghcr.io/ggml-org/llama.cpp:server-cuda

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
