import { discoverProviders } from '../src/modules/providers/configLoader';

async function testAdapter(id: string): Promise<void> {
  console.log(`\n===========================================`);
  console.log(`Testing Adapter: ${id}`);
  console.log(`===========================================`);

  const adapterModule = await import(`../src/modules/providers/adapters/${id}`);
  const adapter = adapterModule.default ?? adapterModule;

  const providersConfig = discoverProviders();
  const config = providersConfig[id];

  if (!config || !config.api_key) {
    console.error(`[SKIP] No API Key found for ${id}`);
    return;
  }

  const messages = [{ role: 'user', content: 'Say exactly: "Test complete"' }];

  try {
    console.log(`[+] Calling handleChat (Stream: true)...`);
    const stream = adapter.handleChat(messages, config, { stream: true });

    let fullText = '';
    const toolCalls: unknown[] = [];

    for await (const chunk of stream as AsyncIterable<Record<string, unknown>>) {
      if (chunk.type === 'delta') {
        fullText += chunk.text;
        process.stdout.write(String(chunk.text));
      } else if (chunk.type === 'tool_call') {
        toolCalls.push(chunk.tool_calls);
      } else if (chunk.type === 'done') {
        console.log(`\n\n[DONE] Finish Reason: ${chunk.finishReason}`);
        console.log(`[USAGE]`, chunk.usage);
      } else if (chunk.type === 'response.done' || chunk.type === 'done') {
        console.log('\n[RAW CHUNK]', chunk);
      } else if (chunk.type === 'error') {
        console.error(`\n[ERROR YIELD]`, chunk.message);
      }
    }

    if (toolCalls.length > 0) {
      console.log(`[TOOL CALLS DETECTED]`, JSON.stringify(toolCalls, null, 2));
    }

    console.log(`\n[RESULT] Stream test passed for ${id}!`);
  } catch (err: unknown) {
    console.error(`\n[FATAL ERROR] Testing ${id} failed:`, err);
  }
}

async function run(): Promise<void> {
  await testAdapter('openai_gpt4_1');
  await testAdapter('openai_gpt5_5');
  console.log(`\nAll tests finished.`);
}

void run();
