const { listProviders, getProvider } = require('./src/modules/providers/provider.factory');
const providersConfig = require('./src/core/providers.config');

async function runTests() {
  console.log("=== Testing Providers Discovery ===");
  const providers = listProviders();
  console.log(`Discovered ${providers.length} providers from config/ directory.`);
  for (const p of providers) {
    console.log(`- ID: ${p.id} | Name: ${p.name} | Adapter: ${p.adapter}`);
  }

  console.log("\n=== Testing Adapters Configuration Parsing ===");
  const testIds = ['deepseek', 'google', 'qwen', 'grok', 'yandex_file_search', 'openai_gpt4_1', 'openai_gpt5_5'];

  for (const id of testIds) {
    if (!providersConfig[id]) {
      console.log(`[SKIP] Provider ${id} not found in merged config.`);
      continue;
    }
    const cfg = providersConfig[id];
    console.log(`\nTesting configuration for: ${id} (${cfg.name})`);
    const provider = getProvider(id);
    if (!provider) {
      console.log(`[ERROR] No adapter found for provider ID ${id} (Adapter requested: ${cfg.adapter})`);
      continue;
    }

    console.log(`[OK] Adapter loaded: ${provider.name} (ID: ${provider.id})`);
    console.log(`[INFO] Config Endpoint URL: ${cfg.endpoint_url || 'N/A'}`);
    console.log(`[INFO] Config API Key Length: ${cfg.api_key ? cfg.api_key.length : 0}`);

    // Try checkHealth if it exists
    if (typeof provider.checkHealth === 'function') {
      try {
         // Some adapters may fail if network/proxy is blocked, but we test if it executes
         const isHealthy = await provider.checkHealth(cfg);
         console.log(`[HEALTH] Provider ${id} checkHealth returned: ${isHealthy}`);
      } catch (err) {
         console.log(`[HEALTH] Provider ${id} checkHealth threw an error: ${err.message}`);
      }
    } else {
      console.log(`[HEALTH] No checkHealth method on ${id}`);
    }
  }
}

runTests().catch(console.error);
