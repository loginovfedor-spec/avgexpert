/**
 * Recall@k gate eval (S0-6): Yandex 256d baseline vs candidate embedders.
 *
 * Корпус и запросы: tests/evals/rag_recall_corpus.json, rag_recall_queries.json (S0-7)
 *
 * Запуск:
 *   npm run eval:recall-at-k
 *   tsx tests/evals/recall_at_k.eval.ts --json=scratch/recall_at_k_report.json
 *   tsx tests/evals/recall_at_k.eval.ts --validate-only
 *   tsx tests/evals/recall_at_k.eval.ts --only=yandex-rag,qwen-8b
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { validateDataset } from './rag_recall.eval';
import { mrr, rankChunks, recallAtK } from './recall_metrics';
import corpus from './rag_recall_corpus.json';
import queries from './rag_recall_queries.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

dotenv.config({ path: path.join(ROOT, '.env'), override: true });
dotenv.config({ path: path.join(ROOT, 'src/modules/providers/config/yandex_file_search.env') });

const ARGS = process.argv.slice(2);
const FLAG = (name: string) => ARGS.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const HAS_FLAG = (name: string) => ARGS.includes(`--${name}`);
const JSON_OUT = FLAG('json') || 'scratch/recall_at_k_report.json';
const VALIDATE_ONLY = HAS_FLAG('validate-only');
const ONLY = FLAG('only') ? new Set(FLAG('only')!.split(',').map((s) => s.trim())) : null;
const QUIET = HAS_FLAG('quiet');

const YANDEX_API_KEY = process.env.YANDEX_CLOUD_API_KEY || process.env.YANDEX_EMBEDDINGS_API_KEY;
const YANDEX_FOLDER =
  process.env.YANDEX_CLOUD_FOLDER ||
  (process.env.YANDEX_EMBEDDINGS_MODEL || '').match(/^emb:\/\/([^/]+)\//)?.[1];
const YANDEX_EMB_URL =
  process.env.YANDEX_EMBEDDINGS_BASE_URL || 'https://ai.api.cloud.yandex.net/foundationModels/v1/textEmbedding';
const YANDEX_DOC_SUFFIX = 'text-search-doc/latest';
const YANDEX_QUERY_SUFFIX = 'text-search-query/latest';
const QWEN_API_KEY = process.env.QWEN_API_KEY;
const QWEN_BASE_URL = process.env.QWEN_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

type EmbedProvider = {
  id: string;
  label: string;
  role: 'yandex-rag' | 'qwen';
  dims?: number;
};

const PROVIDERS: EmbedProvider[] = [
  { id: 'yandex-rag', label: 'Yandex RAG 256d (baseline)', role: 'yandex-rag' },
  { id: 'qwen-8b', label: 'Qwen3-Embedding-8B (self-hosted proxy)', role: 'qwen', dims: 1024 },
];

type EvalReport = {
  queries: Array<{ id: string; recall_at_3: number; recall_at_7: number; mrr: number; top3: string[] }>;
  summary: { recall_at_3: number; recall_at_7: number; mrr: number; count: number };
};

function log(...args: unknown[]) {
  if (!QUIET) console.log(...args);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function yandexEmbed(text: string, suffix: string): Promise<number[]> {
  const modelUri = `emb://${YANDEX_FOLDER}/${suffix}`;
  const resp = await fetch(YANDEX_EMB_URL, {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${YANDEX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ modelUri, text }),
  });
  const data = (await resp.json()) as { message?: string; embedding?: number[] };
  if (!resp.ok) throw new Error(data.message || JSON.stringify(data));
  return data.embedding!;
}

const qwenClient = QWEN_API_KEY ? new OpenAI({ apiKey: QWEN_API_KEY, baseURL: QWEN_BASE_URL }) : null;

async function qwenEmbed(texts: string[], dims: number): Promise<number[][]> {
  const res = await qwenClient!.embeddings.create({
    model: 'text-embedding-v4',
    input: texts,
    dimensions: dims,
    encoding_format: 'float',
  });
  return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function embedCorpus(provider: EmbedProvider): Promise<Record<string, number[]>> {
  const embeddings: Record<string, number[]> = {};
  if (provider.role === 'yandex-rag') {
    for (let i = 0; i < corpus.length; i++) {
      if (i > 0) await sleep(120);
      embeddings[corpus[i].id] = await yandexEmbed(corpus[i].text, YANDEX_DOC_SUFFIX);
    }
    return embeddings;
  }
  if (provider.role === 'qwen') {
    const BATCH = 8;
    for (let i = 0; i < corpus.length; i += BATCH) {
      const batch = corpus.slice(i, i + BATCH);
      const embs = await qwenEmbed(
        batch.map((c) => c.text),
        provider.dims!
      );
      batch.forEach((c, j) => {
        embeddings[c.id] = embs[j];
      });
      if (i + BATCH < corpus.length) await sleep(300);
    }
    return embeddings;
  }
  throw new Error(`Unknown provider role: ${provider.role}`);
}

async function embedQuery(provider: EmbedProvider, text: string): Promise<number[]> {
  if (provider.role === 'yandex-rag') {
    return yandexEmbed(text, YANDEX_QUERY_SUFFIX);
  }
  if (provider.role === 'qwen') {
    const [emb] = await qwenEmbed([text], provider.dims!);
    return emb;
  }
  throw new Error(`Unknown provider role: ${provider.role}`);
}

function canRun(provider: EmbedProvider): string | null {
  if (provider.role === 'yandex-rag' && (!YANDEX_API_KEY || !YANDEX_FOLDER)) {
    return 'Yandex credentials missing';
  }
  if (provider.role === 'qwen' && !qwenClient) return 'QWEN_API_KEY missing';
  return null;
}

async function evalProvider(provider: EmbedProvider): Promise<EvalReport | { error: string }> {
  const skip = canRun(provider);
  if (skip) return { error: skip };

  log(`\nEmbedding corpus (${corpus.length} chunks) — ${provider.label}...`);
  const chunkEmbeddings = await embedCorpus(provider);

  const asyncReport: EvalReport = {
    queries: [],
    summary: { recall_at_3: 0, recall_at_7: 0, mrr: 0, count: queries.length },
  };
  let r3 = 0;
  let r7 = 0;
  let mrrSum = 0;

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    if (i > 0) await sleep(provider.role === 'yandex-rag' ? 120 : 200);
    const queryEmb = await embedQuery(provider, q.query);
    const chunkIds = Object.keys(chunkEmbeddings);
    const chunkEmbs = chunkIds.map((id) => chunkEmbeddings[id]);
    const ranked = rankChunks(queryEmb, chunkEmbs, chunkIds).map((r) => r.id);
    const qR3 = recallAtK(ranked, q.relevant_chunk_ids, 3);
    const qR7 = recallAtK(ranked, q.relevant_chunk_ids, 7);
    const qMrr = mrr(ranked, q.relevant_chunk_ids);
    r3 += qR3;
    r7 += qR7;
    mrrSum += qMrr;
    asyncReport.queries.push({ id: q.id, recall_at_3: qR3, recall_at_7: qR7, mrr: qMrr, top3: ranked.slice(0, 3) });
    log(`  [${q.id}] r@3=${qR3.toFixed(2)} top3=${ranked.slice(0, 3).join(',')}`);
  }

  const n = queries.length;
  asyncReport.summary = {
    recall_at_3: r3 / n,
    recall_at_7: r7 / n,
    mrr: mrrSum / n,
    count: n,
  };
  return asyncReport;
}

export async function runRecallAtKEval() {
  validateDataset();
  log(`Corpus: ${corpus.length} chunks | Queries: ${queries.length}`);

  if (VALIDATE_ONLY) {
    log('Dataset validation OK (--validate-only)');
    return null;
  }

  const providers = ONLY ? PROVIDERS.filter((p) => ONLY.has(p.id)) : PROVIDERS;
  const results: Record<string, EvalReport | { error: string }> = {};

  for (const provider of providers) {
    log(`\n${'═'.repeat(60)}\n  ${provider.label}\n${'═'.repeat(60)}`);
    try {
      results[provider.id] = await evalProvider(provider);
      const s = (results[provider.id] as EvalReport).summary;
      log(
        `\n  recall@3=${(s.recall_at_3 * 100).toFixed(1)}% recall@7=${(s.recall_at_7 * 100).toFixed(1)}% MRR=${s.mrr.toFixed(3)}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR: ${message}`);
      results[provider.id] = { error: message };
    }
  }

  const baseline = results['yandex-rag'] as EvalReport | undefined;
  const candidate = results['qwen-8b'] as EvalReport | undefined;
  let gate: Record<string, unknown> | null = null;
  if (baseline?.summary && candidate?.summary) {
    gate = {
      criterion: 'recall@3 candidate >= baseline Yandex',
      passed: candidate.summary.recall_at_3 >= baseline.summary.recall_at_3,
      baseline_recall_at_3: baseline.summary.recall_at_3,
      candidate_recall_at_3: candidate.summary.recall_at_3,
      note: 'Final gate uses self-hosted bge-m3/multilingual-e5 in S1; qwen-8b is interim proxy',
    };
    log(
      `\nGate: ${gate.passed ? 'PASS' : 'FAIL'} (candidate r@3 ${(gate.candidate_recall_at_3 as number).toFixed(3)} vs baseline ${(gate.baseline_recall_at_3 as number).toFixed(3)})`
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    sprint: 'S0-6',
    corpusChunks: corpus.length,
    queryCount: queries.length,
    providers: results,
    gate,
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  runRecallAtKEval()
    .then((payload) => {
      if (!payload) {
        process.exit(0);
      }

      const outPath = path.isAbsolute(JSON_OUT) ? JSON_OUT : path.join(process.cwd(), JSON_OUT);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
      log(`\nJSON → ${outPath}`);

      const docsPath = path.join(process.cwd(), 'docs/06_testing/RECALL_AT_K_REPORT.json');
      fs.mkdirSync(path.dirname(docsPath), { recursive: true });
      fs.writeFileSync(docsPath, JSON.stringify(payload, null, 2));

      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal:', err);
      process.exit(1);
    });
}
