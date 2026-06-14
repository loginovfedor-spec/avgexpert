/**
 * AvgExpert Provider Audit Script
 * Verifies connectivity and basic functionality of all configured LLM providers.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import providersConfig from '../src/core/providers.config';
import providerFactory from '../src/modules/providers/provider.factory';
import type { ChatMessage } from '../src/types/chat.types';
import type { StreamEvent } from '../src/types/chat.types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const { adapters } = providerFactory as {
  adapters: Record<
    string,
    {
      handleChat: (
        messages: ChatMessage[],
        config: Record<string, unknown>,
        options: Record<string, unknown>
      ) => AsyncIterable<StreamEvent>;
    }
  >;
};

const REPORT_PATH = path.join(__dirname, '../test_providers_report.md');

type AuditResult = {
  success: boolean;
  model?: string;
  text?: string;
  duration?: number;
  ttft?: number | null;
  chunks?: number;
  error?: string | null;
};

async function testProvider(providerId: string, config: Record<string, unknown>): Promise<AuditResult> {
  const adapterName = config.adapter as string;
  const adapter = adapters[adapterName];
  if (!adapter) {
    return { success: false, error: `Adapter ${adapterName} not found` };
  }

  const models = (config.models as Record<string, unknown>) || {};
  const modelNames = Object.keys(models);
  if (modelNames.length === 0) {
    return { success: false, error: 'No models configured' };
  }

  const testModel = modelNames[0];
  const messages: ChatMessage[] = [{ role: 'user', content: 'Say "test-ok" once and nothing else.' }];
  const options = { stream: true };

  const adapterConfig = {
    ...config,
    model_name: testModel,
    api_key: config.api_key,
    endpoint_url: config.endpoint_url,
  };

  console.log(`[Audit] Testing ${providerId} (${testModel})...`);

  let fullText = '';
  let assistantText = '';
  let chunksCount = 0;
  const startTime = Date.now();
  let firstChunkTime: number | null = null;

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

    if (providerId === 'test' && assistantText.includes('DeterministicProvider')) success = true;

    return {
      success,
      model: testModel,
      text: (assistantText || fullText).trim(),
      duration,
      ttft: firstChunkTime,
      chunks: chunksCount,
      error: success
        ? null
        : fullText
          ? `Unexpected response: "${(assistantText || fullText).slice(0, 50).replace(/\n/g, ' ')}..."`
          : 'Empty response',
    };
  } catch (err) {
    return {
      success: false,
      model: testModel,
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - startTime,
    };
  }
}

async function run(): Promise<void> {
  console.log('=== AvgExpert Provider Audit ===');
  const results: Record<string, AuditResult> = {};

  const toTest = Object.entries(providersConfig).filter(([id]) => {
    if (id === 'test') return true;
    if (id === 'google' && !process.env.GEMINI_API_KEY) return false;
    return true;
  });

  for (const [id, config] of toTest) {
    results[id] = await testProvider(id, config as Record<string, unknown>);
  }

  let md = `# Provider Audit Report (${new Date().toLocaleString()})\n\n`;
  md += '| Provider | Model | Status | Latency | TTFT | Chunks | Notes |\n';
  md += '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';

  for (const [id, res] of Object.entries(results)) {
    const status = res.success ? '✅ OK' : '❌ FAIL';
    const latency = res.duration ? `${res.duration}ms` : '-';
    const ttft = res.ttft ? `${res.ttft}ms` : '-';
    const chunks = res.chunks || 0;
    const notes = res.error ? `**Error:** ${res.error}` : res.text ? `"${res.text}"` : '';

    md += `| **${id}** | ${res.model || '-'} | ${status} | ${latency} | ${ttft} | ${chunks} | ${notes} |\n`;
  }

  fs.writeFileSync(REPORT_PATH, md);
  console.log(`\nReport generated: ${REPORT_PATH}`);

  if (Object.values(results).every((r) => r.success)) {
    console.log('✅ All providers passed!');
  } else {
    console.warn('⚠️ Some providers failed. Check the report.');
  }
}

run().catch(console.error);
