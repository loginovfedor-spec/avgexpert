import type { RerankerProvider } from '../vector/ports/reranker.provider';
import type { VectorHit } from '../vector/types';

export async function applyCrossEncoderRerank(
  hits: VectorHit[],
  query: string,
  reranker: RerankerProvider
): Promise<VectorHit[]> {
  if (hits.length === 0) return hits;

  const texts = hits.map((hit) => hit.body);
  const scores = await reranker.rerank(query, texts);

  return hits
    .map((hit, index) => ({
      ...hit,
      score: scores[index] ?? hit.score,
    }))
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  applyCrossEncoderRerank,
};
