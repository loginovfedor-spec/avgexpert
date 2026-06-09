# EMBEDDING_CHECKLIST — self-hosted bge-m3 (§11.1)

Чеклист embedder для VectorKB. **Единственный утверждённый провайдер:** self-hosted (ONNX / TEI / bge-m3).

## Файл параметров

`src/modules/vector/config/bge_m3.env` — источник по умолчанию (переопределяется корневым `.env`).

| Переменная | Значение (default) |
|------------|-------------------|
| `EMBEDDING_PROVIDER` | `self-hosted` |
| `EMBEDDING_MODEL` | `bge-m3` |
| `EMBEDDING_DIMS` | `1024` |
| `EMBEDDING_NAMESPACE` | `bge-m3-v1` *(финальная фиксация — после gate S0-6)* |
| `EMBEDDING_API_URL` | `http://83.166.253.250:8080/embed` |
| `EMBEDDING_API_FORMAT` | `tei` (Text Embeddings Inference) |

Селектор конфига: `VECTOR_EMBEDDING_CONFIG=bge_m3`

## Smoke

```bash
cd avgexpert
npm run embedding:smoke
# dev/test без live endpoint:
EMBEDDING_MOCK=true npm run embedding:smoke
```

## Ручной чеклист

| # | Проверка | Критерий |
|---|----------|----------|
| 1 | Конфиг загружается | `resolveEmbeddingSettings()` → `apiUrl`, `dimensions=1024` |
| 2 | TEI отвечает | `POST {EMBEDDING_API_URL}` body `{"inputs":"test"}` → массив float[1024] |
| 3 | Latency | embed query < 300 ms (NFR-1, excl. LLM) |
| 4 | Namespace | не менять до recall@k gate (§11.3) |
| 5 | Приватность | документы user/session **не** уходят в облачный embed API |

## Не использовать для production embed

- OpenAI / Yandex Cloud / DashScope Qwen — только baseline eval (S0-6) или запасной план B (§11.1), не основной путь.
