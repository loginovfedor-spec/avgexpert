import openaiGpt41 from '../src/modules/providers/adapters/openai_gpt4_1';
import openaiGpt55 from '../src/modules/providers/adapters/openai_gpt5_5';
import { discoverProviders } from '../src/modules/providers/configLoader';

async function test(name: string, adapter: typeof openaiGpt41, id: string) {
  const cfg = discoverProviders()[id];
  if (!cfg) {
    console.log(name, 'no config');
    return;
  }
  const settings = {
    api_key: cfg.api_key,
    endpoint_url: cfg.endpoint_url,
    model_name: cfg.defaultModel,
    extra_params: cfg.extra_params,
    DEFAULT_MODEL: cfg.defaultModel,
  };
  console.log(name, 'endpoint:', cfg.endpoint_url, 'reasoning:', JSON.stringify(cfg.extra_params?.reasoning));
  try {
    let text = '';
    for await (const ev of adapter.handleChat(
      [{ role: 'user', content: 'Say test-ok only' }],
      settings,
      { stream: false, max_tokens: 20 }
    )) {
      if (ev.type === 'delta') text += ev.text || '';
      if (ev.type === 'done') console.log(name, 'OK:', text.trim().slice(0, 100));
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(name, 'FAIL:', msg.slice(0, 200));
  }
}

async function main() {
  await test('gpt4_1', openaiGpt41, 'openai_gpt4_1');
  await test('gpt5_5', openaiGpt55, 'openai_gpt5_5');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
