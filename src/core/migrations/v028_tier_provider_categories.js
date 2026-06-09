module.exports = {
  version: 28,
  name: 'tier_provider_categories',
  up: (txDb) => {
    const baseExpert = txDb.prepare('SELECT * FROM categories WHERE name = ?').get('Эксперт');
    const baseSage = txDb.prepare('SELECT * FROM categories WHERE name = ?').get('Мудрец');

    const expertDefaults = {
      temperature: baseExpert?.temperature ?? 0.7,
      top_p: baseExpert?.top_p ?? 0.9,
      top_k: baseExpert?.top_k ?? 40,
      min_p: baseExpert?.min_p ?? 0.05,
      repeat_penalty: baseExpert?.repeat_penalty ?? 1.1,
      input_context_default: baseExpert?.input_context_default ?? 1000000,
      input_context_max: baseExpert?.input_context_max ?? 1000000,
      max_tokens: baseExpert?.max_tokens ?? 4096,
      system_prompt: baseExpert?.system_prompt ?? null,
      extra_params: baseExpert?.extra_params ?? null,
      routing_mode: baseExpert?.routing_mode ?? 'direct',
      fallback_provider: baseExpert?.fallback_provider ?? null,
      yandex_folder_id: baseExpert?.yandex_folder_id ?? null,
      debug_mode: baseExpert?.debug_mode ?? 0,
      complexity: baseExpert?.complexity ?? 1.5,
      suggested_questions: baseExpert?.suggested_questions ?? '',
    };

    const sageDefaults = {
      temperature: baseSage?.temperature ?? 0.7,
      top_p: baseSage?.top_p ?? 0.9,
      top_k: baseSage?.top_k ?? 40,
      min_p: baseSage?.min_p ?? 0.05,
      repeat_penalty: baseSage?.repeat_penalty ?? 1.1,
      input_context_default: baseSage?.input_context_default ?? 1000000,
      input_context_max: baseSage?.input_context_max ?? 1000000,
      max_tokens: baseSage?.max_tokens ?? 8192,
      system_prompt: baseSage?.system_prompt ?? null,
      extra_params: baseSage?.extra_params ?? null,
      routing_mode: baseSage?.routing_mode ?? 'direct',
      fallback_provider: baseSage?.fallback_provider ?? null,
      yandex_folder_id: baseSage?.yandex_folder_id ?? null,
      debug_mode: baseSage?.debug_mode ?? 0,
      complexity: baseSage?.complexity ?? 2.0,
      suggested_questions: baseSage?.suggested_questions ?? '',
    };

    txDb.prepare(`
      UPDATE categories
      SET provider = @provider,
          model_name = @model_name,
          rag_enabled = 1,
          retrieval_tier = 'expert',
          sort_index = @sort_index
      WHERE name = 'Эксперт'
    `).run({
      provider: 'openai_gpt4_1',
      model_name: 'gpt-4.1',
      sort_index: 20,
    });

    txDb.prepare(`
      UPDATE categories
      SET provider = @provider,
          model_name = @model_name,
          rag_enabled = 1,
          retrieval_tier = 'sage',
          sort_index = @sort_index
      WHERE name = 'Мудрец'
    `).run({
      provider: 'openai_gpt5_5',
      model_name: 'gpt-5.5',
      sort_index: 30,
    });

    const insertTierCategory = txDb.prepare(`
      INSERT OR IGNORE INTO categories (
        name, provider, model_name, temperature, top_p, top_k, min_p, repeat_penalty,
        input_context_default, input_context_max, max_tokens, system_prompt, extra_params,
        routing_mode, fallback_provider, yandex_folder_id, debug_mode, complexity,
        suggested_questions, sort_index, rag_enabled, retrieval_tier
      ) VALUES (
        @name, @provider, @model_name, @temperature, @top_p, @top_k, @min_p, @repeat_penalty,
        @input_context_default, @input_context_max, @max_tokens, @system_prompt, @extra_params,
        @routing_mode, @fallback_provider, @yandex_folder_id, @debug_mode, @complexity,
        @suggested_questions, @sort_index, 1, @retrieval_tier
      )
    `);

    const expertVariants = [
      {
        name: 'Эксперт (OpenAI)',
        provider: 'openai_gpt4_1',
        model_name: 'gpt-4.1',
        sort_index: 21,
        retrieval_tier: 'expert',
      },
      {
        name: 'Эксперт (Grok)',
        provider: 'grok',
        model_name: 'grok-4-1-fast-reasoning',
        sort_index: 22,
        retrieval_tier: 'expert',
      },
    ];

    const sageVariants = [
      {
        name: 'Мудрец (OpenAI)',
        provider: 'openai_gpt5_5',
        model_name: 'gpt-5.5',
        sort_index: 31,
        retrieval_tier: 'sage',
      },
      {
        name: 'Мудрец (Grok)',
        provider: 'grok',
        model_name: 'grok-4.3',
        sort_index: 32,
        retrieval_tier: 'sage',
      },
    ];

    for (const variant of expertVariants) {
      insertTierCategory.run({ ...expertDefaults, ...variant });
    }

    for (const variant of sageVariants) {
      insertTierCategory.run({ ...sageDefaults, ...variant });
    }
  },
};
