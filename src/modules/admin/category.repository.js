const { getDatabasePort, ensureAppPgReady, isAppPgEnabled } = require('../../core/pg');

class CategoryRepository {
  async _db() {
    await ensureAppPgReady();
    return getDatabasePort();
  }

  _mapRow(row) {
    return {
      name: row.name,
      provider: row.provider,
      endpoint_url: row.endpoint_url,
      model_name: row.model_name,
      api_key: row.api_key,
      temperature: row.temperature != null ? parseFloat(row.temperature) : null,
      top_p: row.top_p != null ? parseFloat(row.top_p) : null,
      top_k: row.top_k != null ? parseInt(row.top_k, 10) : null,
      min_p: row.min_p != null ? parseFloat(row.min_p) : null,
      repeat_penalty: row.repeat_penalty != null ? parseFloat(row.repeat_penalty) : null,
      input_context_default: row.input_context_default != null ? parseInt(row.input_context_default, 10) : 1000000,
      input_context_max: row.input_context_max != null ? parseInt(row.input_context_max, 10) : 1000000,
      max_tokens: row.max_tokens != null ? parseInt(row.max_tokens, 10) : null,
      system_prompt: row.system_prompt,
      extra_params: row.extra_params ? JSON.parse(row.extra_params) : null,
      routing_mode: row.routing_mode || 'direct',
      fallback_provider: row.fallback_provider,
      yandex_folder_id: row.yandex_folder_id,
      debug_mode: !!row.debug_mode,
      complexity: row.complexity != null ? parseFloat(row.complexity) : 1.0,
      suggested_questions: row.suggested_questions || '',
      sort_index: row.sort_index != null ? parseInt(row.sort_index, 10) : 0,
      rag_allowed: !!row.rag_allowed,
      retrieval_tier: row.retrieval_tier || 'consultant',
    };
  }

  async findByName(name) {
    const db = await this._db();
    const row = await db.get('SELECT * FROM categories WHERE name = @name', { name });
    if (!row) return null;
    return this._mapRow(row);
  }

  async save(name, category) {
    const db = await this._db();
    const complexity = category.complexity != null
      ? parseFloat(parseFloat(category.complexity).toFixed(2))
      : 1.0;

    const extraParamsStr = category.extra_params
      ? (typeof category.extra_params === 'string' ? category.extra_params : JSON.stringify(category.extra_params))
      : null;

    await db.run(`
      INSERT INTO categories (
        name, provider, endpoint_url, model_name, api_key, 
        temperature, top_p, top_k, min_p, repeat_penalty, 
        input_context_default, input_context_max, max_tokens, system_prompt, extra_params, routing_mode, 
        fallback_provider, yandex_folder_id, debug_mode, complexity,
        suggested_questions, sort_index, rag_allowed, retrieval_tier
      )
      VALUES (
        @name, @provider, @endpoint_url, @model_name, @api_key, 
        @temperature, @top_p, @top_k, @min_p, @repeat_penalty, 
        @input_context_default, @input_context_max, @max_tokens, @system_prompt, @extra_params, @routing_mode, 
        @fallback_provider, @yandex_folder_id, @debug_mode, @complexity,
        @suggested_questions, @sort_index, @rag_allowed, @retrieval_tier
      )
      ON CONFLICT(name) DO UPDATE SET
        provider=excluded.provider,
        endpoint_url=excluded.endpoint_url,
        model_name=excluded.model_name,
        api_key=excluded.api_key,
        temperature=excluded.temperature,
        top_p=excluded.top_p,
        top_k=excluded.top_k,
        min_p=excluded.min_p,
        repeat_penalty=excluded.repeat_penalty,
        input_context_default=excluded.input_context_default,
        input_context_max=excluded.input_context_max,
        max_tokens=excluded.max_tokens,
        system_prompt=excluded.system_prompt,
        extra_params=excluded.extra_params,
        routing_mode=excluded.routing_mode,
        fallback_provider=excluded.fallback_provider,
        yandex_folder_id=excluded.yandex_folder_id,
        debug_mode=excluded.debug_mode,
        complexity=excluded.complexity,
        suggested_questions=excluded.suggested_questions,
        sort_index=excluded.sort_index,
        rag_allowed=excluded.rag_allowed,
        retrieval_tier=excluded.retrieval_tier
    `, {
      name,
      provider: category.provider || null,
      endpoint_url: category.endpoint_url || null,
      model_name: category.model_name || null,
      api_key: category.api_key || null,
      temperature: category.temperature != null ? parseFloat(category.temperature) : null,
      top_p: category.top_p != null ? parseFloat(category.top_p) : null,
      top_k: category.top_k != null ? parseInt(category.top_k, 10) : null,
      min_p: category.min_p != null ? parseFloat(category.min_p) : null,
      repeat_penalty: category.repeat_penalty != null ? parseFloat(category.repeat_penalty) : null,
      input_context_default: category.input_context_default != null ? parseInt(category.input_context_default, 10) : 1000000,
      input_context_max: category.input_context_max != null ? parseInt(category.input_context_max, 10) : 1000000,
      max_tokens: category.max_tokens != null ? parseInt(category.max_tokens, 10) : null,
      system_prompt: category.system_prompt || null,
      extra_params: extraParamsStr,
      routing_mode: category.routing_mode || 'direct',
      fallback_provider: category.fallback_provider || null,
      yandex_folder_id: category.yandex_folder_id ?? null,
      debug_mode: category.debug_mode ? 1 : 0,
      complexity,
      suggested_questions: category.suggested_questions || '',
      sort_index: category.sort_index != null ? parseInt(category.sort_index, 10) : 0,
      rag_allowed: category.rag_allowed ? 1 : 0,
      retrieval_tier: category.retrieval_tier || 'consultant',
    });
  }

  async listAll() {
    const db = await this._db();
    const rows = await db.all('SELECT * FROM categories ORDER BY sort_index ASC, name ASC');
    const result = {};
    for (const row of rows) {
      result[row.name] = this._mapRow(row);
    }
    return result;
  }

  async countTotal() {
    const db = await this._db();
    const row = await db.get(
      isAppPgEnabled()
        ? 'SELECT COUNT(*)::int AS c FROM categories'
        : 'SELECT COUNT(*) as c FROM categories'
    );
    return row.c;
  }

  async delete(name) {
    const db = await this._db();
    await db.run('DELETE FROM categories WHERE name = @name', { name });
  }
}

module.exports = new CategoryRepository();
