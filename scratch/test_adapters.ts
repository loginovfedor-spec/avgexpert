/**
 * Run: tsx scratch/test_adapters.ts
 */
import dotenv from 'dotenv';
import openaiGpt41 from '../src/modules/providers/adapters/openai_gpt4_1';
import openaiGpt55 from '../src/modules/providers/adapters/openai_gpt5_5';
import deepseek from '../src/modules/providers/adapters/deepseek';
import qwen from '../src/modules/providers/adapters/qwen';
import grok from '../src/modules/providers/adapters/grok';
import llamacpp from '../src/modules/providers/adapters/llamacpp';

dotenv.config();

type ProviderLike = {
  id: string;
  name?: string;
  checkHealth?: (config: Record<string, unknown>) => Promise<boolean>;
  handleChat: (
    messages: Array<{ role: string; content: string }>,
    config: Record<string, unknown>,
    options: Record<string, unknown>
  ) => AsyncIterable<{ type: string; text?: string; message?: string }>;
};

async function testProvider(provider: ProviderLike, config: Record<string, unknown>): Promise<void> {
  console.log(`\n============================`);
  console.log(`Testing ${provider.name} (${provider.id})...`);
  try {
    const isHealthy = await provider.checkHealth?.(config);
    console.log(`[Health]: ${isHealthy ? 'OK' : 'FAIL'}`);

    if (isHealthy) {
      console.log(`[Chat]: Testing basic completion...`);
      const messages = [{ role: 'user', content: 'Say "hello world" in lowercase only, nothing else.' }];

      let resultText = '';
      const stream = provider.handleChat(messages, config, { stream: false, max_tokens: 20 });
      for await (const event of stream) {
        if (event.type === 'delta') {
          resultText += event.text || '';
        } else if (event.type === 'error') {
          console.error(`[Stream Error]:`, event.message);
        }
      }
      console.log(`[Response]: ${resultText.trim()}`);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[Error]: ${message}`);
  }
}

async function runTests(): Promise<void> {
  const providers: Array<{ provider: ProviderLike; config: Record<string, unknown> }> = [
    {
      provider: openaiGpt41,
      config: { api_key: process.env.OPENAI_API_KEY, endpoint_url: process.env.OPENAI_URL },
    },
    {
      provider: openaiGpt55,
      config: { api_key: process.env.OPENAI_API_KEY, endpoint_url: process.env.OPENAI_URL },
    },
    {
      provider: deepseek,
      config: { api_key: process.env.DEEPSEEK_API_KEY, endpoint_url: process.env.DEEPSEEK_URL },
    },
    {
      provider: qwen,
      config: { api_key: process.env.QWEN_API_KEY, endpoint_url: process.env.QWEN_URL },
    },
    {
      provider: grok,
      config: { api_key: process.env.GROK_API_KEY, endpoint_url: process.env.GROK_URL },
    },
    {
      provider: llamacpp,
      config: { api_key: process.env.LLAMACPP_API_KEY, endpoint_url: process.env.LLAMACPP_URL },
    },
  ];

  for (const p of providers) {
    if (!p.config.api_key && p.provider.id !== 'llamacpp') {
      console.log(`\nSkipping ${p.provider.name} due to missing API key.`);
      continue;
    }
    await testProvider(p.provider, p.config);
  }
}

runTests()
  .then(() => console.log('\nTesting complete.'))
  .catch(console.error);
