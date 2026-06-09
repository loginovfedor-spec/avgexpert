/**
 * Provider: Yandex Cloud + File Search
 * Models: aliceai-llm-flash/latest, aliceai-llm/latest, yandexgpt-5.1
 * Endpoint: https://ai.api.cloud.yandex.net/v1
 * Features: PostgreSQL (pgvector) File Search, Result Caching, OpenAI SDK Integration
 */
const OpenAI = require('openai');
const BaseProvider = require('../base.provider');
const { getAdapterConfig } = require('../configLoader');
const { ProviderUtils } = require('./provider_utils');
const fetch = require('node-fetch');
const crypto = require('crypto');
const path = require('path');
const { createRequire } = require('module');
const logger = require('../../../core/logger').scoped('YandexFileSearch');

const pgPools = new Map();
let PgPool = null;
const adapterPgRequire = createRequire(path.join(__dirname, 'yandex_file_search_pg', 'package.json'));

function readPositiveInt(name, fallback) {
  const value = parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getPgPoolClass() {
  if (PgPool) return PgPool;

  try {
    PgPool = adapterPgRequire('pg').Pool;
    return PgPool;
  } catch (err) {
    throw new Error(
      'Yandex File Search requires adapter-local package "pg". ' +
      'Run: npm install --prefix src/modules/providers/adapters/yandex_file_search_pg'
    );
  }
}

function getDbPool(connectionString) {
  if (!pgPools.has(connectionString)) {
    const Pool = getPgPoolClass();
    const pool = new Pool({
      connectionString,
      max: readPositiveInt('YANDEX_FILE_SEARCH_PG_MAX', 10),
      idleTimeoutMillis: readPositiveInt('YANDEX_FILE_SEARCH_PG_IDLE_TIMEOUT_MS', 30000),
      connectionTimeoutMillis: readPositiveInt('YANDEX_FILE_SEARCH_PG_CONNECTION_TIMEOUT_MS', 5000)
    });

    pool.on('error', (err) => {
      logger.error('PostgreSQL pool error', { message: err.message });
      pgPools.delete(connectionString);
      pool.end().catch(() => {});
    });

    pgPools.set(connectionString, pool);
  }

  return pgPools.get(connectionString);
}

class YandexFileSearchProvider extends BaseProvider {
  constructor() {
    super({
      id: 'yandex_file_search',
      name: 'Yandex Prompt + File Search',
      models: [
        'aliceai-llm-flash/latest',
        'aliceai-llm/latest',
        'yandexgpt-5.1'
      ],
      defaultModel: 'aliceai-llm/latest',
      capabilities: { stream: true, tools: false, retrieval: true }
    });
  }

  _formatModel(model, folderId) {
    if (!model || model === 'default') return `gpt://${folderId}/${this.defaultModel}`;
    if (model.startsWith('gpt://')) {
      if (model.endsWith('/default')) {
        return model.replace('/default', `/${this.defaultModel}`);
      }
      return model;
    }
    const cleanModel = model.includes(':') ? model.substring(model.indexOf(':') + 1) : model;
    if (cleanModel === 'default') return `gpt://${folderId}/${this.defaultModel}`;
    return `gpt://${folderId}/${cleanModel}`;
  }

  _convertMessages(messages, additionalContext) {
    let instructions = '';
    const input = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        instructions += (instructions ? '\n' : '') + msg.content;
      } else if (msg.role === 'user') {
        input.push({
          role: 'user',
          content: [{ type: 'input_text', text: msg.content }]
        });
      } else if (msg.role === 'assistant') {
        input.push({
          role: 'assistant',
          content: [{ type: 'output_text', text: msg.content }]
        });
      }
    }

    if (additionalContext) {
        instructions += (instructions ? '\n\n' : '') + additionalContext;
    }

    return { instructions, input };
  }

  _generateCacheKey(body) {
    return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  }

  async _embedQuery(query, apiKey, folderId) {
    const embedModelUrl = process.env.YANDEX_EMBEDDINGS_BASE_URL || 'https://ai.api.cloud.yandex.net/foundationModels/v1/textEmbedding';
    const modelUri = process.env.YANDEX_EMBEDDINGS_MODEL || `emb://${folderId}/text-search-query/latest`;
    
    const response = await fetch(embedModelUrl, {
      method: 'POST',
      headers: {
        'authorization': `Api-Key ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        modelUri: modelUri,
        text: query
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Embedding failed: ${data.message || data.error?.message || response.statusText}`);
    }
    const embedding = data.embedding || data.embeddings?.[0];
    if (!Array.isArray(embedding)) throw new Error('Invalid embedding response format');
    return embedding;
  }

  async _searchVectorStore(pool, embedding, limit = 5) {
    const vectorLiteral = `[${embedding.join(',')}]`;
    const result = await pool.query(
      `
      SELECT id, title, body, 1 - (embedding <=> $1::vector) AS score
      FROM avg_vector_chunks
      ORDER BY embedding <=> $1::vector
      LIMIT $2
      `,
      [vectorLiteral, limit]
    );
    return result.rows.map(r => `--- Документ: ${r.title} ---\n${r.body}`).join('\n\n');
  }

  async _ensureCacheTable(pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS yandex_llm_cache (
        cache_key TEXT PRIMARY KEY,
        response_text TEXT NOT NULL,
        usage JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  async _getCachedResponse(pool, cacheKey) {
    const res = await pool.query('SELECT response_text, usage FROM yandex_llm_cache WHERE cache_key = $1', [cacheKey]);
    return res.rows[0] || null;
  }

  async _setCachedResponse(pool, cacheKey, text, usage) {
    await pool.query(
      'INSERT INTO yandex_llm_cache (cache_key, response_text, usage) VALUES ($1, $2, $3) ON CONFLICT (cache_key) DO NOTHING',
      [cacheKey, text, JSON.stringify(usage)]
    );
  }

  async *handleChat(messages, categoryConfig, options = {}) {
    const ProviderEvents = require('../providerEvents');
    const { ProviderError } = require('../providerErrors');
    const adapterConfig = getAdapterConfig(categoryConfig.provider || 'yandex_file_search');
    
    const apiKey = adapterConfig.YANDEX_CLOUD_API_KEY || adapterConfig.YANDEX_API_KEY || categoryConfig.api_key;
    const folderId = adapterConfig.YANDEX_CLOUD_FOLDER || adapterConfig.YANDEX_FOLDER_ID || categoryConfig.yandex_folder_id;
    const baseUrl = adapterConfig.YANDEX_CLOUD_BASE_URL || this.defaultBaseUrl || 'https://ai.api.cloud.yandex.net/v1';
    const dbUrl = adapterConfig.DATABASE_URL || adapterConfig.PG_URL || process.env.DATABASE_URL || process.env.PG_URL;

    if (!apiKey) throw new ProviderError('Yandex Cloud: API key не задан.', 401);
    if (!folderId) throw new ProviderError('Yandex Cloud: Folder ID не задан.', 400);
    if (!dbUrl) throw new ProviderError('PostgreSQL: DATABASE_URL не задан для File Search.', 500);

    const pool = getDbPool(dbUrl);
    await this._ensureCacheTable(pool);

    let lastUserQuery = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserQuery = messages[i].content;
        break;
      }
    }

    let additionalContext = '';
    if (lastUserQuery && adapterConfig.VECTOR_STORE_ENABLED !== 'false') {
      try {
        const queryEmbedding = await this._embedQuery(lastUserQuery, apiKey, folderId);
        const contextText = await this._searchVectorStore(pool, queryEmbedding, 5);
        if (contextText) {
          additionalContext = 'Контекст из базы знаний:\n' + contextText;
        }
      } catch (err) {
        logger.error('File Search failed', { message: err.message });
      }
    }

    const { instructions, input } = this._convertMessages(messages, additionalContext);
    const targetModel = this._formatModel(categoryConfig.model_name || adapterConfig.YANDEX_CLOUD_MODEL || this.defaultModel, folderId);

    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: baseUrl,
      defaultHeaders: {
        'OpenAI-Project': folderId
      }
    });

    const params = {
      model: targetModel,
      input,
      stream: !!options.stream
    };
    if (instructions) params.instructions = instructions;

    const temperature = categoryConfig.temperature !== undefined ? categoryConfig.temperature : parseFloat(adapterConfig.YANDEX_CLOUD_TEMPERATURE || '0.3');
    if (temperature !== undefined) params.temperature = temperature;

    const maxTokens = options.max_tokens || parseInt(adapterConfig.YANDEX_CLOUD_MAX_OUTPUT_TOKENS || '1500');
    if (maxTokens) params.max_output_tokens = maxTokens;

    if (categoryConfig.top_p !== undefined) params.top_p = categoryConfig.top_p;
    if (categoryConfig.parallel_tool_calls !== undefined) params.parallel_tool_calls = categoryConfig.parallel_tool_calls;
    if (categoryConfig.reasoning !== undefined) params.reasoning = categoryConfig.reasoning;
    if (categoryConfig.store !== undefined) params.store = categoryConfig.store;
    if (categoryConfig.text !== undefined) params.text = categoryConfig.text;
    if (categoryConfig.tool_choice !== undefined) params.tool_choice = categoryConfig.tool_choice;
    if (categoryConfig.tools !== undefined || options.tools !== undefined) params.tools = categoryConfig.tools || options.tools;
    if (categoryConfig.truncation !== undefined) params.truncation = categoryConfig.truncation;
    if (categoryConfig.user !== undefined) params.user = categoryConfig.user;
    if (categoryConfig.metadata !== undefined) params.metadata = categoryConfig.metadata;

    const responseFormat = adapterConfig.YANDEX_CLOUD_RESPONSE_FORMAT || categoryConfig.response_format;
    if (responseFormat === 'json_schema') {
      params.text = {
        format: {
          type: 'json_schema',
          name: 'yandex_qa_response',
          strict: true,
          schema: {
             type: 'object',
             properties: {
               answer: { type: 'string' },
               certainty: { type: 'string', enum: ['high', 'medium', 'low'] },
               constraints: { type: 'array', items: { type: 'string' } }
             },
             required: ['answer', 'certainty', 'constraints']
          }
        }
      };
    }

    ProviderUtils.cleanUnsupportedParams(params, ['reasoning', 'reasoning_effort']);

    const cacheKey = this._generateCacheKey({ model: targetModel, input, instructions, responseFormat: params.text });
    try {
      const cached = await this._getCachedResponse(pool, cacheKey);
      if (cached) {
        yield ProviderEvents.delta(cached.response_text);
        yield ProviderEvents.done('stop', cached.usage);
        return;
      }
    } catch (err) {
      logger.error('Cache read error', { message: err.message });
    }

    try {
      if (params.stream) {
        const stream = await client.responses.create(params);
        let fullContent = '';
        let finalUsage = null;
        let lastFinishReason = 'stop';

        for await (const chunk of stream) {
          if (chunk.type === 'response.output_text.delta') {
            fullContent += chunk.delta;
            yield ProviderEvents.delta(chunk.delta);
          }
          if (chunk.type === 'response.completed') {
            lastFinishReason = chunk.response?.finish_reason || 'stop';
            if (chunk.response?.usage) {
               finalUsage = chunk.response.usage;
            }
          }
        }
        
        const usageToCache = ProviderUtils.normalizeUsage(finalUsage) || {prompt_tokens: 0, completion_tokens: 0, total_tokens: 0};
        await this._setCachedResponse(pool, cacheKey, fullContent, usageToCache);
        yield ProviderEvents.done(lastFinishReason, usageToCache);

      } else {
        const response = await client.responses.create(params);
        let text = '';
        if (response.output) {
          for (const item of response.output) {
            if (item.type === 'message' && item.content) {
              for (const part of item.content) {
                if (part.type === 'output_text') text += part.text;
              }
            }
          }
        }
        const usage = ProviderUtils.normalizeUsage(response.usage) || {prompt_tokens: 0, completion_tokens: 0, total_tokens: 0};
        
        if (text) {
          await this._setCachedResponse(pool, cacheKey, text, usage);
          yield ProviderEvents.delta(text);
        }
        yield ProviderEvents.done(response.finish_reason || 'stop', usage);
      }
    } catch (err) {
      throw new ProviderError(`Yandex Cloud File Search: ${err.message}`, 502);
    }
  }

  async checkHealth(categoryConfig) {
    const adapterConfig = getAdapterConfig(categoryConfig?.provider || 'yandex_file_search');
    const apiKey = adapterConfig.YANDEX_CLOUD_API_KEY || categoryConfig?.api_key;
    const folderId = adapterConfig.YANDEX_CLOUD_FOLDER || categoryConfig?.yandex_folder_id;
    const dbUrl = adapterConfig.DATABASE_URL || adapterConfig.PG_URL || process.env.DATABASE_URL || process.env.PG_URL;
    if (!apiKey || !folderId || !dbUrl) return false;
    
    try {
      const pool = getDbPool(dbUrl);
      await pool.query('SELECT 1');
      return true;
    } catch (e) {
      return false;
    }
  }
}

const instance = new YandexFileSearchProvider();
module.exports = instance;
module.exports.YandexFileSearchProvider = YandexFileSearchProvider;
