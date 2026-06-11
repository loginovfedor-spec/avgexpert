module.exports = {
  version: 30,
  name: 'consultant_local_llamacpp',
  up: (txDb) => {
    const baseRow = txDb.prepare('SELECT * FROM categories WHERE name = ?').get('Консультант');

    const defaults = {
      temperature: 0.4,
      top_p: baseRow?.top_p ?? 0.9,
      top_k: baseRow?.top_k ?? 40,
      min_p: baseRow?.min_p ?? 0.05,
      repeat_penalty: baseRow?.repeat_penalty ?? 1.1,
      input_context_default: 16384,
      input_context_max: 16384,
      max_tokens: baseRow?.max_tokens ?? 1024,
      system_prompt: baseRow?.system_prompt
        ?? 'Ты — Консультант: отвечай по предоставленным материалам, на русском языке, точно и по существу. Если контекста недостаточно — явно скажи об ограничениях.',
      extra_params: JSON.stringify({
        global_kb_enabled: true,
        user_kb_enabled: true,
        session_kb_enabled: true,
      }),
      routing_mode: baseRow?.routing_mode ?? 'direct',
      fallback_provider: baseRow?.fallback_provider ?? null,
      yandex_folder_id: null,
      debug_mode: baseRow?.debug_mode ?? 0,
      complexity: baseRow?.complexity ?? 1.0,
      suggested_questions: baseRow?.suggested_questions ?? '',
    };

    txDb.prepare(`
      INSERT OR IGNORE INTO categories (
        name, provider, model_name, temperature, top_p, top_k, min_p, repeat_penalty,
        input_context_default, input_context_max, max_tokens, system_prompt, extra_params,
        routing_mode, fallback_provider, yandex_folder_id, debug_mode, complexity,
        suggested_questions, sort_index, rag_allowed, retrieval_tier
      ) VALUES (
        @name, @provider, @model_name, @temperature, @top_p, @top_k, @min_p, @repeat_penalty,
        @input_context_default, @input_context_max, @max_tokens, @system_prompt, @extra_params,
        @routing_mode, @fallback_provider, @yandex_folder_id, @debug_mode, @complexity,
        @suggested_questions, @sort_index, 1, 'consultant'
      )
    `).run({
      name: 'Консультант (Local)',
      provider: 'llamacpp',
      model_name: 'qwen2.5-7b-instruct',
      sort_index: 13,
      ...defaults,
    });
  },
};
