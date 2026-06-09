module.exports = {
  version: 27,
  name: 'llm_cache_and_consultant_providers',
  up: (txDb) => {
    txDb.exec(`
      CREATE TABLE IF NOT EXISTS llm_response_cache (
        cache_key TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        response_text TEXT NOT NULL,
        usage TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_llm_response_cache_provider
        ON llm_response_cache(provider_id);
    `);

    const baseRow = txDb.prepare('SELECT * FROM categories WHERE name = ?').get('Консультант');

    const defaults = {
      temperature: baseRow?.temperature ?? 0.7,
      top_p: baseRow?.top_p ?? 0.9,
      top_k: baseRow?.top_k ?? 40,
      min_p: baseRow?.min_p ?? 0.05,
      repeat_penalty: baseRow?.repeat_penalty ?? 1.1,
      input_context_default: baseRow?.input_context_default ?? 1000000,
      input_context_max: baseRow?.input_context_max ?? 1000000,
      max_tokens: baseRow?.max_tokens ?? 1024,
      system_prompt: baseRow?.system_prompt ?? null,
      extra_params: baseRow?.extra_params ?? null,
      routing_mode: baseRow?.routing_mode ?? 'direct',
      fallback_provider: baseRow?.fallback_provider ?? null,
      yandex_folder_id: baseRow?.yandex_folder_id ?? null,
      debug_mode: baseRow?.debug_mode ?? 0,
      complexity: baseRow?.complexity ?? 1.0,
      suggested_questions: baseRow?.suggested_questions ?? '',
    };

    txDb.prepare(`
      UPDATE categories
      SET provider = @provider,
          model_name = @model_name,
          rag_enabled = 1,
          retrieval_tier = 'consultant',
          sort_index = @sort_index
      WHERE name = 'Консультант'
    `).run({
      provider: 'yandex',
      model_name: 'aliceai-llm-flash/latest',
      sort_index: 10,
    });

    const insertConsultant = txDb.prepare(`
      INSERT OR IGNORE INTO categories (
        name, provider, model_name, temperature, top_p, top_k, min_p, repeat_penalty,
        input_context_default, input_context_max, max_tokens, system_prompt, extra_params,
        routing_mode, fallback_provider, yandex_folder_id, debug_mode, complexity,
        suggested_questions, sort_index, rag_enabled, retrieval_tier
      ) VALUES (
        @name, @provider, @model_name, @temperature, @top_p, @top_k, @min_p, @repeat_penalty,
        @input_context_default, @input_context_max, @max_tokens, @system_prompt, @extra_params,
        @routing_mode, @fallback_provider, @yandex_folder_id, @debug_mode, @complexity,
        @suggested_questions, @sort_index, 1, 'consultant'
      )
    `);

    const consultantVariants = [
      {
        name: 'Консультант (OpenAI)',
        provider: 'openai_gpt4_1',
        model_name: 'gpt-4.1-mini',
        sort_index: 11,
      },
      {
        name: 'Консультант (Grok)',
        provider: 'grok',
        model_name: 'grok-4-1-fast-non-reasoning',
        sort_index: 12,
      },
    ];

    for (const variant of consultantVariants) {
      insertConsultant.run({ ...defaults, ...variant });
    }
  },
};
