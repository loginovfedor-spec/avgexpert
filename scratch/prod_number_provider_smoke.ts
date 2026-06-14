/**
 * Smoke: openai_gpt4_1_Number provider on prod config dir.
 * Run on server: npx tsx scratch/prod_number_provider_smoke.ts
 */
import openaiGpt41 from '../src/modules/providers/adapters/openai_gpt4_1';
import { discoverProviders } from '../src/modules/providers/configLoader';

async function main(): Promise<void> {
  const id = 'openai_gpt4_1_Number';
  const cfg = discoverProviders()[id];
  if (!cfg) {
    console.error('FAIL: no config for', id);
    process.exit(1);
  }

  const settings = {
    api_key: cfg.api_key,
    endpoint_url: cfg.endpoint_url,
    model_name: cfg.defaultModel,
    extra_params: cfg.extra_params,
    DEFAULT_MODEL: cfg.defaultModel,
  };

  console.log('provider:', id);
  console.log('endpoint:', cfg.endpoint_url);
  console.log('model:', cfg.defaultModel);

  let text = '';
  for await (const ev of openaiGpt41.handleChat(
    [{ role: 'user', content: 'Say test-ok only' }],
    settings,
    { stream: false, max_tokens: 20 }
  )) {
    if (ev.type === 'delta') text += ev.text || '';
    if (ev.type === 'done') {
      console.log('OK:', text.trim().slice(0, 120));
      return;
    }
    if (ev.type === 'error') {
      console.error('FAIL:', ev.message);
      process.exit(1);
    }
  }
  console.error('FAIL: no done event');
  process.exit(1);
}

main().catch((e: unknown) => {
  console.error('FAIL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
