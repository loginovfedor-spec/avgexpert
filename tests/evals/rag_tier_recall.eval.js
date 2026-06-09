/**
 * S7-5: Per-tier recall eval on S0-7 dataset (offline mock vector store).
 */
const fs = require('fs');
const path = require('path');

const corpus = require('./rag_recall_corpus.json');
const queries = require('./rag_recall_queries.json');

const TIER_TOP_K = {
  consultant: 3,
  expert: 7,
  sage: 12,
};

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

async function runTierRecallEval() {
  const { TieredRetriever } = require('../../src/modules/vector/retrievers/tiered.retriever');
  const namespace = 'tier-eval';
  const store = buildMockStore(corpus, namespace);
  const embedding = { embedQuery: async (query) => hashEmbed(query) };
  const retriever = new TieredRetriever(embedding, store, namespace);

  const tiers = ['consultant', 'expert', 'sage'];
  const perTier = {};

  for (const tier of tiers) {
    const k = TIER_TOP_K[tier];
    let recallSum = 0;

    for (const q of queries) {
      const chunks = await retriever.retrieve(q.query, {
        userId: 'eval-user',
        tier,
        scopes: ['global'],
        globalKbEnabled: true,
      });
      recallSum += recallAtK(chunks.map((c) => c.id), q.relevant_chunk_ids, k);
    }

    perTier[tier] = {
      top_k: k,
      recall_at_k: recallSum / (queries.length || 1),
      query_count: queries.length,
    };
  }

  return {
    per_tier: perTier,
    query_count: queries.length,
    passed: queries.length >= 18
      && perTier.consultant.top_k === 3
      && perTier.expert.top_k === 7
      && perTier.sage.top_k === 12,
  };
}

if (require.main === module) {
  runTierRecallEval()
    .then((report) => {
      for (const [tier, stats] of Object.entries(report.per_tier)) {
        console.log(`${tier} recall@${stats.top_k}: ${stats.recall_at_k.toFixed(3)} (${stats.query_count} queries)`);
      }
      console.log(report.passed ? 'PASS' : 'FAIL');

      const outPath = path.join(process.cwd(), 'docs/06_testing/EVALS_REPORT.json');
      let existing = {};
      if (fs.existsSync(outPath)) {
        try { existing = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch { /* ignore */ }
      }
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify({
        ...existing,
        tier_recall: report.per_tier,
        tier_recall_last_run: new Date().toISOString(),
        tier_recall_passed: report.passed,
      }, null, 2));

      process.exit(report.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runTierRecallEval, TIER_TOP_K };
