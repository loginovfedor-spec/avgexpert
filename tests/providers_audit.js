/**
 * AvgExpert Provider Audit Script
 * Verifies connectivity and basic functionality of all configured LLM providers.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const providersConfig = require('../src/core/providers.config');
const { adapters } = require('../src/modules/providers/provider.factory');

const REPORT_PATH = path.join(__dirname, '../test_providers_report.md');

async function testProvider(providerId, config) {
  const adapter = adapters[config.adapter];
  if (!adapter) {
    return { success: false, error: `Adapter ${config.adapter} not found` };
  }

  const modelNames = Object.keys(config.models);
  if (modelNames.length === 0) {
    return { success: false, error: 'No models configured' };
  }

  const testModel = modelNames[0];
  const messages = [{ role: 'user', content: 'Say "test-ok" once and nothing else.' }];
  const options = { stream: true };

  // Prepare specific config for the adapter call
  const adapterConfig = {
    ...config,
    model_name: testModel,
    api_key: config.api_key,
    endpoint_url: config.endpoint_url
  };

  console.log(`[Audit] Testing ${providerId} (${testModel})...`);
  
  let fullText = '';
  let assistantText = '';
  let chunksCount = 0;
  let startTime = Date.now();
  let firstChunkTime = null;

  try {
    const stream = adapter.handleChat(messages, adapterConfig, options);
    
    for await (const event of stream) {
      if (event.type === 'delta' && event.text) {
        if (chunksCount === 0) firstChunkTime = Date.now() - startTime;
        fullText += event.text;
        assistantText += event.text;
        chunksCount++;
      }
      if (event.type === 'error') {
        throw new Error(event.message || 'Unknown provider error');
      }
    }

    const duration = Date.now() - startTime;
    let success = assistantText.toLowerCase().includes('test-ok');
    
    // Special cases
    if (providerId === 'test' && assistantText.includes('DeterministicProvider')) success = true;

    return {
      success,
      model: testModel,
      text: (assistantText || fullText).trim(),
      duration,
      ttft: firstChunkTime,
      chunks: chunksCount,
      error: success ? null : (fullText ? `Unexpected response: "${(assistantText || fullText).slice(0, 50).replace(/\n/g, ' ')}..."` : 'Empty response')
    };
  } catch (err) {
    return {
      success: false,
      model: testModel,
      error: err.message,
      duration: Date.now() - startTime
    };
  }
}

async function run() {
  console.log('=== AvgExpert Provider Audit ===');
  const results = {};
  
  // Skip some providers that are known to be disabled or internal
  const toTest = Object.entries(providersConfig).filter(([id]) => {
    if (id === 'test') return true; // Keep test for baseline
    if (id === 'google' && !process.env.GEMINI_API_KEY) return false;
    return true;
  });

  for (const [id, config] of toTest) {
    results[id] = await testProvider(id, config);
  }

  // Generate Report
  let md = `# Provider Audit Report (${new Date().toLocaleString()})\n\n`;
  md += '| Provider | Model | Status | Latency | TTFT | Chunks | Notes |\n';
  md += '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';

  for (const [id, res] of Object.entries(results)) {
    const status = res.success ? '✅ OK' : `❌ FAIL`;
    const latency = res.duration ? `${res.duration}ms` : '-';
    const ttft = res.ttft ? `${res.ttft}ms` : '-';
    const chunks = res.chunks || 0;
    const notes = res.error ? `**Error:** ${res.error}` : (res.text ? `"${res.text}"` : '');
    
    md += `| **${id}** | ${res.model || '-'} | ${status} | ${latency} | ${ttft} | ${chunks} | ${notes} |\n`;
  }

  fs.writeFileSync(REPORT_PATH, md);
  console.log(`\nReport generated: ${REPORT_PATH}`);
  
  if (Object.values(results).every(r => r.success)) {
    console.log('✅ All providers passed!');
  } else {
    console.warn('⚠️ Some providers failed. Check the report.');
  }
}

run().catch(console.error);
