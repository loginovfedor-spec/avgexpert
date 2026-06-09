import crypto = require('crypto');
import type { RetrievalTier, VectorScope } from '../vector/types';
import { RetrievalResult } from '../knowledge/knowledge.types';

export interface ScopedCacheKeyInput {
  query: string;
  namespace: string;
  tier: RetrievalTier;
  scopes: VectorScope[];
  userId: string;
  sessionId?: string;
  semanticGraphEnabled?: boolean;
}

type CacheEntry = {
  result: RetrievalResult;
  expiresAt: number;
};

type ScopedCacheOptions = {
  ttl?: number;
  maxSize?: number;
};

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildScopedCacheKey(input: ScopedCacheKeyInput): string {
  const payload = [
    normalizeQuery(input.query),
    input.namespace,
    input.tier,
    [...input.scopes].sort().join(','),
    input.userId,
    input.sessionId || '',
    input.semanticGraphEnabled ? '1' : '0',
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

export class ScopedRetrievalCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttl: number;
  private readonly maxSize: number;

  constructor(options: ScopedCacheOptions = {}) {
    this.ttl = options.ttl ?? 3600000;
    this.maxSize = options.maxSize ?? 1000;
  }

  get(key: string): RetrievalResult | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.result;
  }

  set(key: string, result: RetrievalResult): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.ttl,
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

export const scopedRetrievalCache = new ScopedRetrievalCache();

module.exports = {
  ScopedRetrievalCache,
  scopedRetrievalCache,
  buildScopedCacheKey,
  normalizeQuery,
};
