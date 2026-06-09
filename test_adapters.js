// test_adapters.js
require('dotenv').config();

const { OpenAIGPT41Provider } = require('./src/modules/providers/adapters/openai_gpt4_1');
const { OpenAIGPT55Provider } = require('./src/modules/providers/adapters/openai_gpt5_5');
const { DeepSeekProvider } = require('./src/modules/providers/adapters/deepseek');
const { QwenProvider } = require('./src/modules/providers/adapters/qwen');
const { GrokProvider } = require('./src/modules/providers/adapters/grok');
const { LlamaCppProvider } = require('./src/modules/providers/adapters/llamacpp');

async function testProvider(provider, config) {
  console.log(`\n============================`);
  console.log(`Testing ${provider.name} (${provider.id})...`);
  try {
    const isHealthy = await provider.checkHealth(config);
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
  } catch (e) {
    console.error(`[Error]: ${e.message}`);
  }
}

async function runTests() {
  const providers = [
    { provider: new OpenAIGPT41Provider(), config: { api_key: process.env.OPENAI_API_KEY, endpoint_url: process.env.OPENAI_URL } },
    { provider: new OpenAIGPT55Provider(), config: { api_key: process.env.OPENAI_API_KEY, endpoint_url: process.env.OPENAI_URL } },
    { provider: new DeepSeekProvider(), config: { api_key: process.env.DEEPSEEK_API_KEY, endpoint_url: process.env.DEEPSEEK_URL } },
    { provider: new QwenProvider(), config: { api_key: process.env.QWEN_API_KEY, endpoint_url: process.env.QWEN_URL } },
    { provider: new GrokProvider(), config: { api_key: process.env.GROK_API_KEY, endpoint_url: process.env.GROK_URL } },
    { provider: new LlamaCppProvider(), config: { api_key: process.env.LLAMACPP_API_KEY, endpoint_url: process.env.LLAMACPP_URL } }
  ];

  for (const p of providers) {
    if (!p.config.api_key && p.provider.id !== 'llamacpp') {
        console.log(`\nSkipping ${p.provider.name} due to missing API key.`);
        continue;
    }
    await testProvider(p.provider, p.config);
  }
}

runTests().then(() => console.log('\nTesting complete.')).catch(console.error);
