/**
 * Offline validation of RU recall dataset (S0-7) + metric smoke test.
 */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert');
const { evaluateRetrieval } = require('./recall_metrics');

const corpus = require('./rag_recall_corpus.json');
const queries = require('./rag_recall_queries.json');

function hashEmbed(text) {
  const vec = new Array(64).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % 64] += text.charCodeAt(i) / 1000;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

function validateDataset() {
  assert.ok(corpus.length >= 50, `corpus must have >= 50 chunks, got ${corpus.length}`);
  assert.ok(queries.length >= 30, `queries must have >= 30, got ${queries.length}`);

  const ids = new Set(corpus.map(c => c.id));
  for (const q of queries) {
    assert.ok(q.query && q.query.length > 5, `${q.id}: query too short`);
    assert.ok(Array.isArray(q.relevant_chunk_ids) && q.relevant_chunk_ids.length > 0, `${q.id}: missing relevant_chunk_ids`);
    for (const cid of q.relevant_chunk_ids) {
      assert.ok(ids.has(cid), `${q.id}: unknown chunk ${cid}`);
    }
  }
}

function runSmokeEval() {
  const embeddings = {};
  for (const chunk of corpus) {
    embeddings[chunk.id] = hashEmbed(chunk.text);
  }
  return evaluateRetrieval(queries, embeddings, hashEmbed);
}

if (require.main === module) {
  validateDataset();
  const report = runSmokeEval();
  console.log(`RU recall dataset: ${corpus.length} chunks, ${queries.length} queries`);
  console.log(`Smoke metrics (hash embed): recall@3=${report.summary.recall_at_3.toFixed(3)}, MRR=${report.summary.mrr.toFixed(3)}`);

  const outPath = path.join(process.cwd(), 'docs/06_testing/EVALS_REPORT.json');
  let existing = {};
  if (fs.existsSync(outPath)) {
    try { existing = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch { /* ignore */ }
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({
    ...existing,
    rag_recall_dataset_chunks: corpus.length,
    rag_recall_dataset_queries: queries.length,
    rag_recall_smoke_last_run: new Date().toISOString(),
  }, null, 2));
  process.exit(0);
}

module.exports = { validateDataset, runSmokeEval };
