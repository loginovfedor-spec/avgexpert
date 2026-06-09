import { RetrievalResult } from './knowledge.types';

type CacheEntry = {
  result: RetrievalResult;
  expiresAt: number;
};

type KnowledgeCacheOptions = {
  ttl?: number;
  maxSize?: number;
  cleanupIntervalMs?: number;
};

class KnowledgeCache {
  private cache: Map<string, CacheEntry>;
  private ttl: number;
  private maxSize: number;
  private cleanupIntervalMs: number;
  private lastCleanupMs: number;

  constructor(options: KnowledgeCacheOptions = {}) {
    this.cache = new Map();
    this.ttl = options.ttl || 3600000; // 1 hour
    this.maxSize = options.maxSize || 1000;
    this.cleanupIntervalMs = options.cleanupIntervalMs || 60000;
    this.lastCleanupMs = 0;
  }

  get(query: string): RetrievalResult | null {
    const key = this._normalize(query);
    const cached = this.cache.get(key);

    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.result;
  }

  set(query: string, result: RetrievalResult): void {
    this._cleanupExpired();

    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    const key = this._normalize(query);
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.ttl
    });
  }

  clear(): void {
    this.cache.clear();
    this.lastCleanupMs = 0;
  }

  private _normalize(query: string): string {
    return query.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private _cleanupExpired(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastCleanupMs < this.cleanupIntervalMs) {
      return;
    }

    this.lastCleanupMs = now;
    for (const [key, value] of this.cache) {
      if (now > value.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

export = new KnowledgeCache();
