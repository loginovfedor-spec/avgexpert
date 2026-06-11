const crypto = require('crypto');
const { getDatabasePort, ensureAppPgReady } = require('../../core/pg');
const logger = require('../../core/logger').scoped('LlmResponseCache');

function generateCacheKey(providerId, payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ providerId, ...payload }))
    .digest('hex');
}

async function getCachedResponse(cacheKey) {
  try {
    await ensureAppPgReady();
    const db = getDatabasePort();
    const row = await db.get(
      'SELECT response_text, usage FROM llm_response_cache WHERE cache_key = @cacheKey',
      { cacheKey }
    );
    if (!row) return null;
    return {
      response_text: row.response_text,
      usage: JSON.parse(row.usage),
    };
  } catch (err) {
    logger.error('Cache read error', { message: err.message });
    return null;
  }
}

async function setCachedResponse(cacheKey, providerId, text, usage) {
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
  } catch (err) {
    logger.error('Cache write error', { message: err.message });
  }
}

module.exports = {
  generateCacheKey,
  getCachedResponse,
  setCachedResponse,
};
