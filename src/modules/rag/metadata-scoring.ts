import type { RetrievalTier } from '../vector/types';
import type { VectorHit } from '../vector/types';

const DOC_TYPE_BOOST: Record<string, number> = {
  canonical_book: 0.04,
  report: 0.05,
  policy: 0.03,
  faq: 0.02,
  contract: 0.03,
};

const MAX_METADATA_BOOST = 0.15;
const CANDIDATE_MULTIPLIER = 3;

export function candidateTopK(tier: RetrievalTier, finalTopK: number): number {
  if (tier === 'consultant') return finalTopK;
  return Math.max(finalTopK, finalTopK * CANDIDATE_MULTIPLIER);
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3);
}

export function normalizeTags(tags: unknown): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).toLowerCase()).filter(Boolean);
  }
  return [String(tags).toLowerCase()];
}

export function tagMatchesQuery(tag: string, queryTokens: string[]): boolean {
  const normalizedTag = tag.toLowerCase();
  const tagTokens = tokenize(tag);
  for (const token of queryTokens) {
    if (normalizedTag === token) return true;
    if (tagTokens.includes(token)) return true;
  }
  return false;
}

function recencyBoost(indexedAt: string | Date): number {
  const indexedMs = indexedAt instanceof Date ? indexedAt.getTime() : Date.parse(String(indexedAt));
  if (!Number.isFinite(indexedMs)) return 0;

  const ageDays = Math.max(0, (Date.now() - indexedMs) / (1000 * 60 * 60 * 24));
  if (ageDays <= 7) return 0.05;
  if (ageDays <= 30) return 0.03;
  if (ageDays <= 90) return 0.015;
  return 0;
}

export type MetadataScoreInput = {
  baseScore: number;
  docType?: string;
  domainTags?: unknown;
  indexedAt?: string | Date;
  query: string;
  tier: RetrievalTier;
};

export function computeMetadataBoost(input: MetadataScoreInput): number {
  if (input.tier === 'consultant') return 0;

  let boost = 0;

  if (input.docType && DOC_TYPE_BOOST[input.docType]) {
    boost += DOC_TYPE_BOOST[input.docType];
  }

  const tags = normalizeTags(input.domainTags);
  if (tags.length > 0) {
    const queryTokens = tokenize(input.query);
    const matches = tags.filter((tag) => tagMatchesQuery(tag, queryTokens));
    boost += Math.min(0.12, matches.length * 0.04);
  }

  if (input.tier === 'sage' && input.indexedAt) {
    boost += recencyBoost(input.indexedAt);
  }

  return Math.min(boost, MAX_METADATA_BOOST);
}

function readHitMetadata(hit: VectorHit): {
  docType?: string;
  domainTags?: unknown;
  indexedAt?: string | Date;
} {
  const meta = hit.metadata || {};
  return {
    docType: (meta.doc_type as string) || (meta.docType as string) || undefined,
    domainTags: meta.domain_tags ?? meta.domainTags,
    indexedAt: (meta.indexed_at as string) || (meta.indexedAt as string) || undefined,
  };
}

export function applyMetadataScoring(
  hits: VectorHit[],
  query: string,
  tier: RetrievalTier
): VectorHit[] {
  if (tier === 'consultant') {
    return [...hits].sort((a, b) => b.score - a.score);
  }

  return hits
    .map((hit) => {
      const { docType, domainTags, indexedAt } = readHitMetadata(hit);
      const boost = computeMetadataBoost({
        baseScore: hit.score,
        docType,
        domainTags,
        indexedAt,
        query,
        tier,
      });
      return {
        ...hit,
        score: Math.min(1, hit.score + boost),
      };
    })
    .sort((a, b) => b.score - a.score);
}

