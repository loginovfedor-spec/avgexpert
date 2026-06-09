/**
 * S4-4: Consultant tier recall@3 eval on S0-7 dataset (offline mock vector store).
 */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert');
const { evaluateRetrieval } = require('./recall_metrics');
const { validateDataset } = require('./rag_recall.eval');

const corpus = require('./rag_recall_corpus.json');
const queries = require('./rag_recall_queries.json');

const BASELINE_RECALL_AT_3_LIVE = 0.85;

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
      metadata: { title: chunk.id },
    }])
  );

  return {
    async search({ embedding, topK }) {
      const ranked = Object.values(byId)
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
      return ranked;
    },
    async upsert() {},
    async delete() { return 0; },
    async health() { return true; },
  };
}

async function runConsultantRecallEval() {
  validateDataset();

  const { TieredRetriever } = require('../../src/modules/vector/retrievers/tiered.retriever');
  const namespace = 'consultant-eval';
  const store = buildMockStore(corpus, namespace);
  const embedding = { embedQuery: async (query) => hashEmbed(query) };
  const retriever = new TieredRetriever(embedding, store, namespace);

  const queryResults = [];
  for (const q of queries) {
    const chunks = await retriever.retrieve(q.query, {
      userId: 'eval-user',
      tier: 'consultant',
      scopes: ['global'],
      globalKbEnabled: true,
    });
    queryResults.push({
      id: q.id,
      relevant_chunk_ids: q.relevant_chunk_ids,
      ranked_ids: chunks.map((c) => c.id),
    });
  }

  const embeddings = {};
  for (const chunk of corpus) {
    embeddings[chunk.id] = hashEmbed(chunk.text);
  }

  const adaptedQueries = queryResults.map((row) => ({
    id: row.id,
    query: queries.find((q) => q.id === row.id).query,
    relevant_chunk_ids: row.relevant_chunk_ids,
    ranked_ids: row.ranked_ids,
  }));

  let recall3Sum = 0;
  for (const row of adaptedQueries) {
    const top3 = row.ranked_ids.slice(0, 3);
    const hits = row.relevant_chunk_ids.filter((id) => top3.includes(id));
    recall3Sum += row.relevant_chunk_ids.length
      ? hits.length / row.relevant_chunk_ids.length
      : 0;
  }
  const recallAt3 = recall3Sum / (queries.length || 1);

  const directReport = evaluateRetrieval(queries, embeddings, hashEmbed);
  const baselineRecallAt3 = directReport.summary.recall_at_3;

  return {
    consultant_recall_at_3: recallAt3,
    baseline_recall_at_3: baselineRecallAt3,
    live_baseline_threshold: BASELINE_RECALL_AT_3_LIVE,
    passed: Math.abs(recallAt3 - baselineRecallAt3) < 0.001,
    query_count: queries.length,
  };
}

if (require.main === module) {
  runConsultantRecallEval()
    .then((report) => {
      console.log(`Consultant recall@3 (TieredRetriever topK=3): ${report.consultant_recall_at_3.toFixed(3)}`);
      console.log(`Baseline recall@3 (direct ranking): ${report.baseline_recall_at_3.toFixed(3)}`);
      console.log(`Threshold (live embedder gate): ${report.live_baseline_threshold}`);
      console.log(report.passed ? 'PASS' : 'FAIL');

      const outPath = path.join(process.cwd(), 'docs/06_testing/EVALS_REPORT.json');
      let existing = {};
      if (fs.existsSync(outPath)) {
        try { existing = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch { /* ignore */ }
      }
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify({
        ...existing,
        consultant_recall_at_3: report.consultant_recall_at_3,
        consultant_recall_baseline: report.baseline_recall_at_3,
        consultant_recall_last_run: new Date().toISOString(),
        consultant_recall_passed: report.passed,
      }, null, 2));

      process.exit(report.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runConsultantRecallEval, BASELINE_RECALL_AT_3_LIVE };
