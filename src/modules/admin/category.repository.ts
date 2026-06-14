import { getDatabasePort, ensureAppPgReady, isAppPgEnabled } from '../../core/pg';

type CategoryRow = Record<string, unknown> & {
  name: string;
  provider?: string | null;
  endpoint_url?: string | null;
  model_name?: string | null;
  api_key?: string | null;
  temperature?: number | string | null;
  top_p?: number | string | null;
  top_k?: number | string | null;
  min_p?: number | string | null;
  repeat_penalty?: number | string | null;
  input_context_default?: number | string | null;
  input_context_max?: number | string | null;
  max_tokens?: number | string | null;
  system_prompt?: string | null;
  extra_params?: string | null;
  routing_mode?: string | null;
  fallback_provider?: string | null;
  yandex_folder_id?: string | null;
  debug_mode?: number | boolean | null;
  complexity?: number | string | null;
  suggested_questions?: string | null;
  sort_index?: number | string | null;
  rag_allowed?: number | boolean | null;
  retrieval_tier?: string | null;
};

type CategoryRecord = {
  name: string;
  provider: string | null | undefined;
  endpoint_url: string | null | undefined;
  model_name: string | null | undefined;
  api_key: string | null | undefined;
  temperature: number | null;
  top_p: number | null;
  top_k: number | null;
  min_p: number | null;
  repeat_penalty: number | null;
  input_context_default: number;
  input_context_max: number;
  max_tokens: number | null;
  system_prompt: string | null | undefined;
  extra_params: Record<string, unknown> | null;
  routing_mode: string;
  fallback_provider: string | null | undefined;
  yandex_folder_id: string | null | undefined;
  debug_mode: boolean;
  complexity: number;
  suggested_questions: string;
  sort_index: number;
  rag_allowed: boolean;
  retrieval_tier: string;
  [key: string]: unknown;
};

class CategoryRepository {
  async _db() {
    await ensureAppPgReady();
    return getDatabasePort();
  }

  _mapRow(row: CategoryRow): CategoryRecord {
    return {
      name: row.name,
      provider: row.provider,
      endpoint_url: row.endpoint_url,
      model_name: row.model_name,
      api_key: row.api_key,
      temperature: row.temperature != null ? parseFloat(String(row.temperature)) : null,
      top_p: row.top_p != null ? parseFloat(String(row.top_p)) : null,
      top_k: row.top_k != null ? parseInt(String(row.top_k), 10) : null,
      min_p: row.min_p != null ? parseFloat(String(row.min_p)) : null,
      repeat_penalty: row.repeat_penalty != null ? parseFloat(String(row.repeat_penalty)) : null,
      input_context_default: row.input_context_default != null ? parseInt(String(row.input_context_default), 10) : 1000000,
      input_context_max: row.input_context_max != null ? parseInt(String(row.input_context_max), 10) : 1000000,
      max_tokens: row.max_tokens != null ? parseInt(String(row.max_tokens), 10) : null,
      system_prompt: row.system_prompt,
      extra_params: row.extra_params ? JSON.parse(row.extra_params) as Record<string, unknown> : null,
      routing_mode: row.routing_mode || 'direct',
      fallback_provider: row.fallback_provider,
      yandex_folder_id: row.yandex_folder_id,
      debug_mode: !!row.debug_mode,
      complexity: row.complexity != null ? parseFloat(String(row.complexity)) : 1.0,
      suggested_questions: row.suggested_questions || '',
      sort_index: row.sort_index != null ? parseInt(String(row.sort_index), 10) : 0,
      rag_allowed: !!row.rag_allowed,
      retrieval_tier: row.retrieval_tier || 'consultant',
    };
  }

  async findByName(name: string): Promise<CategoryRecord | null> {
    const db = await this._db();
    const row = await db.get('SELECT * FROM categories WHERE name = @name', { name }) as CategoryRow | null;
    if (!row) return null;
    return this._mapRow(row);
  }

  async save(name: string, category: Partial<CategoryRecord>): Promise<void> {
    const db = await this._db();
    const complexity = category.complexity != null
      ? parseFloat(parseFloat(String(category.complexity)).toFixed(2))
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
      temperature: category.temperature != null ? parseFloat(String(category.temperature)) : null,
      top_p: category.top_p != null ? parseFloat(String(category.top_p)) : null,
      top_k: category.top_k != null ? parseInt(String(category.top_k), 10) : null,
      min_p: category.min_p != null ? parseFloat(String(category.min_p)) : null,
      repeat_penalty: category.repeat_penalty != null ? parseFloat(String(category.repeat_penalty)) : null,
      input_context_default: category.input_context_default != null ? parseInt(String(category.input_context_default), 10) : 1000000,
      input_context_max: category.input_context_max != null ? parseInt(String(category.input_context_max), 10) : 1000000,
      max_tokens: category.max_tokens != null ? parseInt(String(category.max_tokens), 10) : null,
      system_prompt: category.system_prompt || null,
      extra_params: extraParamsStr,
      routing_mode: category.routing_mode || 'direct',
      fallback_provider: category.fallback_provider || null,
      yandex_folder_id: category.yandex_folder_id ?? null,
      debug_mode: category.debug_mode ? 1 : 0,
      complexity,
      suggested_questions: category.suggested_questions || '',
      sort_index: category.sort_index != null ? parseInt(String(category.sort_index), 10) : 0,
      rag_allowed: category.rag_allowed ? 1 : 0,
      retrieval_tier: category.retrieval_tier || 'consultant',
    });
  }

  async listAll(): Promise<Record<string, CategoryRecord>> {
    const db = await this._db();
    const rows = await db.all('SELECT * FROM categories ORDER BY sort_index ASC, name ASC') as CategoryRow[];
    const result: Record<string, CategoryRecord> = {};
    for (const row of rows) {
      result[row.name] = this._mapRow(row);
    }
    return result;
  }

  async countTotal(): Promise<number> {
    const db = await this._db();
    const row = await db.get(
      isAppPgEnabled()
        ? 'SELECT COUNT(*)::int AS c FROM categories'
        : 'SELECT COUNT(*) as c FROM categories'
    ) as { c: number };
    return row.c;
  }

  async delete(name: string): Promise<void> {
    const db = await this._db();
    await db.run('DELETE FROM categories WHERE name = @name', { name });
  }
}

export = new CategoryRepository();
