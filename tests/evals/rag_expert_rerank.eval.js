/**
 * S7b-2: Expert tier — metadata-only vs cross-encoder rerank (offline mock store).
 */
const fs = require('fs');
const path = require('path');

const corpus = require('./rag_recall_corpus.json');
const queries = require('./rag_recall_queries.json');

const EXPERT_TOP_K = 7;

function hashEmbed(text) {
  const vec = new Array(64).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % 64] += text.charCodeAt(i) / 1000;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function buildMockStore(corpusItems, namespace) {
  const byId = Object.fromEntries(
    corpusItems.map((chunk) => [chunk.id, {
      id: chunk.id,
      docId: chunk.id,
      namespace,
      scope: 'global',
      body: chunk.text,
      score: 0,
      metadata: {
        ...(chunk.metadata || {}),
        indexed_at: chunk.metadata?.indexed_at || new Date().toISOString(),
      },
    }])
  );

  return {
    async search({ embedding, topK }) {
      return Object.values(byId)
        .map((hit) => {
          const chunkEmb = hashEmbed(hit.body);
          let dot = 0;
          let na = 0;
          let nb = 0;
          for (let i = 0; i < embedding.length; i++) {
            dot += embedding[i] * chunkEmb[i];
            na += embedding[i] * embedding[i];
            nb += chunkEmb[i] * chunkEmb[i];
          }
          const score = na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
          return { ...hit, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    },
    async upsert() {},
    async delete() { return 0; },
    async health() { return true; },
  };
}

function recallAtK(rankedIds, relevantIds, k) {
  const top = rankedIds.slice(0, k);
  const hits = relevantIds.filter((id) => top.includes(id));
  return relevantIds.length ? hits.length / relevantIds.length : 0;
}

async function runExpertRerankEval() {
  const { TieredRetriever } = require('../../src/modules/vector/retrievers/tiered.retriever');
  const { MockRerankerProvider } = require('../../src/modules/vector/providers/mock.reranker');

  const namespace = 'expert-rerank-eval';
  const store = buildMockStore(corpus, namespace);
  const embedding = { embedQuery: async (query) => hashEmbed(query) };

  const metadataOnly = new TieredRetriever(embedding, store, namespace, null);
  const withReranker = new TieredRetriever(
    embedding,
    store,
    namespace,
    new MockRerankerProvider()
  );

  let metadataRecall = 0;
  let rerankRecall = 0;

  for (const q of queries) {
    const metadataChunks = await metadataOnly.retrieve(q.query, {
      userId: 'eval-user',
      tier: 'expert',
      scopes: ['global'],
      globalKbEnabled: true,
    });
    const rerankChunks = await withReranker.retrieve(q.query, {
      userId: 'eval-user',
      tier: 'expert',
      scopes: ['global'],
      globalKbEnabled: true,
    });

    metadataRecall += recallAtK(metadataChunks.map((c) => c.id), q.relevant_chunk_ids, EXPERT_TOP_K);
    rerankRecall += recallAtK(rerankChunks.map((c) => c.id), q.relevant_chunk_ids, EXPERT_TOP_K);
  }

  const queryCount = queries.length || 1;
  return {
    expert_top_k: EXPERT_TOP_K,
    query_count: queries.length,
    metadata_only: {
      recall_at_k: metadataRecall / queryCount,
    },
    with_reranker: {
      recall_at_k: rerankRecall / queryCount,
    },
    delta: (rerankRecall - metadataRecall) / queryCount,
    passed: queries.length >= 18
      && rerankRecall >= metadataRecall,
  };
}

if (require.main === module) {
  runExpertRerankEval()
    .then((report) => {
      console.log(`metadata-only recall@${report.expert_top_k}: ${report.metadata_only.recall_at_k.toFixed(3)}`);
      console.log(`with reranker recall@${report.expert_top_k}: ${report.with_reranker.recall_at_k.toFixed(3)}`);
      console.log(`delta: ${report.delta >= 0 ? '+' : ''}${report.delta.toFixed(3)}`);
      console.log(report.passed ? 'PASS' : 'FAIL');

      const outPath = path.join(process.cwd(), 'docs/06_testing/EVALS_REPORT.json');
      let existing = {};
      if (fs.existsSync(outPath)) {
        try { existing = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch { /* ignore */ }
      }
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify({
        ...existing,
        expert_rerank_comparison: {
          metadata_only: report.metadata_only,
          with_reranker: report.with_reranker,
          delta: report.delta,
          query_count: report.query_count,
        },
        expert_rerank_last_run: new Date().toISOString(),
        expert_rerank_passed: report.passed,
      }, null, 2));

      process.exit(report.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runExpertRerankEval, EXPERT_TOP_K };
