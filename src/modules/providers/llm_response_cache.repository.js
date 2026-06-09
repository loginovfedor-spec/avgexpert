const crypto = require('crypto');
const db = require('../../core/sqlite');
const logger = require('../../core/logger').scoped('LlmResponseCache');

function generateCacheKey(providerId, payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ providerId, ...payload }))
    .digest('hex');
}

function getCachedResponse(cacheKey) {
  try {
    const row = db
      .prepare('SELECT response_text, usage FROM llm_response_cache WHERE cache_key = ?')
      .get(cacheKey);
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

function setCachedResponse(cacheKey, providerId, text, usage) {
  try {
    db.prepare(`
      INSERT INTO llm_response_cache (cache_key, provider_id, response_text, usage, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO NOTHING
    `).run(cacheKey, providerId, text, JSON.stringify(usage || {}), Date.now());
  } catch (err) {
    logger.error('Cache write error', { message: err.message });
  }
}

module.exports = {
  generateCacheKey,
  getCachedResponse,
  setCachedResponse,
};
