import crypto from 'crypto';
import { getDatabasePort, ensureAppPgReady } from '../../core/pg';
import logger from '../../core/logger';
const cacheLogger = logger.scoped('LlmResponseCache');

type CachedResponse = {
  response_text: string;
  usage: unknown;
};


function generateCacheKey(providerId: string, payload: Record<string, unknown>): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ providerId, ...payload }))
    .digest('hex');
}

async function getCachedResponse(cacheKey: string): Promise<CachedResponse | null> {
  try {
    await ensureAppPgReady();
    const db = getDatabasePort();
    const row = await db.get<{ response_text: string; usage: string }>(
      'SELECT response_text, usage FROM llm_response_cache WHERE cache_key = @cacheKey',
      { cacheKey }
    );
    if (!row) return null;
    return {
      response_text: row.response_text,
      usage: JSON.parse(row.usage),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    cacheLogger.error('Cache read error', { message });
    return null;
  }
}

async function setCachedResponse(
  cacheKey: string,
  providerId: string,
  text: string,
  usage: unknown
): Promise<void> {
  try {
    await ensureAppPgReady();
    const db = getDatabasePort();
    await db.run(`
      INSERT INTO llm_response_cache (cache_key, provider_id, response_text, usage, created_at)
      VALUES (@cacheKey, @providerId, @text, @usage, @createdAt)
      ON CONFLICT(cache_key) DO NOTHING
    `, {
      cacheKey,
      providerId,
      text,
      usage: JSON.stringify(usage || {}),
      createdAt: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    cacheLogger.error('Cache write error', { message });
  }
}

export = {
  generateCacheKey,
  getCachedResponse,
  setCachedResponse,
};
