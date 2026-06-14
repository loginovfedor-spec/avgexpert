import type { RetrievalTier } from '../vector/types';
import type { VectorHit } from '../vector/types';
import { normalizeTags, tagMatchesQuery, tokenize } from './metadata-scoring';

export function shouldApplyDomainTagsFilter(tier: RetrievalTier): boolean {
  return tier === 'expert' || tier === 'sage';
}

function readDomainTags(hit: VectorHit): string[] {
  const meta = hit.metadata || {};
  return normalizeTags(meta.domain_tags ?? meta.domainTags);
}

/**
 * When the query matches domain_tags on at least one candidate, keep only hits
 * that share those tags. Untagged chunks are retained as fallback.
 */
export function applyDomainTagsFilter(
  hits: VectorHit[],
  query: string,
  tier: RetrievalTier
): VectorHit[] {
  if (!shouldApplyDomainTagsFilter(tier) || hits.length === 0) {
    return hits;
  }

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return hits;
  }

  const hasDomainSignal = hits.some((hit) => {
    const tags = readDomainTags(hit);
    return tags.some((tag) => tagMatchesQuery(tag, queryTokens));
  });

  if (!hasDomainSignal) {
    return hits;
  }

  return hits.filter((hit) => {
    const tags = readDomainTags(hit);
    if (tags.length === 0) return true;
    return tags.some((tag) => tagMatchesQuery(tag, queryTokens));
  });
}

