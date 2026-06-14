import categoryRepository from '../src/modules/admin/category.repository';
import providersConfig from '../src/core/providers.config';

async function sync(): Promise<void> {
  try {
    const categories = await categoryRepository.listAll();
    console.log('Current categories:', Object.keys(categories));

    for (const [providerId, cfg] of Object.entries(providersConfig)) {
      if (providerId === 'mcp' || providerId === 'test') continue;

      const models = Object.keys(cfg.models || {});
      for (const modelName of models) {
        const catName = `${cfg.name} (${modelName})`;

        const template: Record<string, unknown> = {
          endpoint_url: cfg.endpoint_url || '',
          api_key: cfg.api_key || '',
          temperature: 0.7,
          max_tokens: 2048,
          ...cfg.extra_params,
        };

        if (cfg.models[modelName].extra_params) {
          Object.assign(template, cfg.models[modelName].extra_params);
        }

        console.log(`Syncing category: ${catName}`);
        await categoryRepository.save(catName, {
          provider: providerId,
          model_name: modelName,
          extra_params: template,
          system_prompt: 'Ты — полезный ИИ-ассистент. Отвечай точно и по существу.',
        });
      }
    }
    console.log('Sync completed.');
  } catch (err: unknown) {
    console.error('Sync failed:', err);
  }
}

void sync();
