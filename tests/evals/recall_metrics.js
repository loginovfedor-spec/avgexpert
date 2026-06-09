/**
 * Recall@k and MRR metrics for RAG retrieval eval.
 */

function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function rankChunks(queryEmb, chunkEmbs, chunkIds) {
  return chunkIds
    .map((id, i) => ({ id, score: cosineSim(queryEmb, chunkEmbs[i]) }))
    .sort((a, b) => b.score - a.score);
}

function recallAtK(rankedIds, relevantIds, k) {
  const top = rankedIds.slice(0, k);
  const hits = relevantIds.filter(id => top.includes(id));
  return relevantIds.length === 0 ? 0 : hits.length / relevantIds.length;
}

function mrr(rankedIds, relevantIds) {
  for (let i = 0; i < rankedIds.length; i++) {
    if (relevantIds.includes(rankedIds[i])) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function evaluateRetrieval(queries, embeddingsByChunkId, embedQuery) {
  const results = [];
  let recall3 = 0;
  let recall7 = 0;
  let mrrSum = 0;

  const chunkIds = Object.keys(embeddingsByChunkId);
  const chunkEmbs = chunkIds.map(id => embeddingsByChunkId[id]);

  for (const q of queries) {
    const queryEmb = embedQuery(q.query);
    const ranked = rankChunks(queryEmb, chunkEmbs, chunkIds);
    const rankedIds = ranked.map(r => r.id);
    const r3 = recallAtK(rankedIds, q.relevant_chunk_ids, 3);
    const r7 = recallAtK(rankedIds, q.relevant_chunk_ids, 7);
    const m = mrr(rankedIds, q.relevant_chunk_ids);
    recall3 += r3;
    recall7 += r7;
    mrrSum += m;
    results.push({ id: q.id, recall_at_3: r3, recall_at_7: r7, mrr: m, top3: rankedIds.slice(0, 3) });
  }

  const n = queries.length || 1;
  return {
    queries: results,
    summary: {
      recall_at_3: recall3 / n,
      recall_at_7: recall7 / n,
      mrr: mrrSum / n,
      count: queries.length,
    },
  };
}

module.exports = {
  cosineSim,
  rankChunks,
  recallAtK,
  mrr,
  evaluateRetrieval,
};
