import http from 'node:http';
import { createRequire } from 'node:module';
import gpt41 from '../src/modules/providers/adapters/openai_gpt4_1';
import gpt55 from '../src/modules/providers/adapters/openai_gpt5_5';
import yandex from '../src/modules/providers/adapters/yandex';

const require = createRequire(import.meta.url);
const configLoader = require('../src/modules/providers/configLoader') as {
  getAdapterConfig: () => Record<string, unknown>;
};

async function runMockTest(): Promise<void> {
  let lastBody: Record<string, unknown> | string | null = null;

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        lastBody = JSON.parse(body) as Record<string, unknown>;
      } catch {
        lastBody = body;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'mock_resp',
          object: 'response',
          status: 'completed',
          model: 'mock-model',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'mock reply' }],
            },
          ],
          usage: { total_tokens: 10 },
        })
      );
    });
  });

  server.listen(0, async () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const mockBaseUrl = `http://localhost:${port}/v1`;

    console.log(`Mock server running on ${mockBaseUrl}`);

    const testOptions = {
      temperature: 0.8,
      top_p: 0.9,
      parallel_tool_calls: false,
      reasoning: { effort: 'high' },
      store: true,
      text: { format: { type: 'text' } },
      tool_choice: 'auto',
      tools: [{ type: 'function', function: { name: 'test' } }],
      truncation: { type: 'auto' },
      user: 'test_user',
      metadata: { test: 1 },
    };

    const testConfig = {
      api_key: 'mock_key',
      yandex_folder_id: 'mock_folder',
      endpoint_url: mockBaseUrl,
      YANDEX_CLOUD_BASE_URL: mockBaseUrl,
      ...testOptions,
    };

    const testConfigYandex = {
      api_key: 'mock_key',
      yandex_folder_id: 'mock_folder',
      YANDEX_CLOUD_BASE_URL: `http://localhost:${port}/v1`,
      ...testOptions,
    };

    const messages = [{ role: 'user', content: 'test' }];
    const options = { max_tokens: 100 };

    console.log('\n--- Testing openai_gpt4_1 ---');
    try {
      const it = gpt41.handleChat(messages, testConfig, options);
      for await (const _chunk of it) {
        /* drain stream */
      }
      if (lastBody && typeof lastBody === 'object') {
        console.log('Passed parameters to API:', Object.keys(lastBody));
        console.log('parallel_tool_calls:', lastBody.parallel_tool_calls);
        console.log('store:', lastBody.store);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(message);
    }

    console.log('\n--- Testing openai_gpt5_5 ---');
    try {
      const it = gpt55.handleChat(messages, testConfig, options);
      for await (const _chunk of it) {
        /* drain stream */
      }
      if (lastBody && typeof lastBody === 'object') {
        console.log('Passed parameters to API:', Object.keys(lastBody));
        console.log('temperature:', lastBody.temperature);
        console.log('reasoning:', lastBody.reasoning);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(message);
    }

    console.log('\n--- Testing yandex ---');
    const origGetConfig = configLoader.getAdapterConfig;
    configLoader.getAdapterConfig = () => ({
      YANDEX_CLOUD_BASE_URL: mockBaseUrl,
      YANDEX_CLOUD_API_KEY: 'test',
      YANDEX_CLOUD_FOLDER: 'test',
    });

    try {
      const it = yandex.handleChat(messages, testConfigYandex, options);
      for await (const _chunk of it) {
        /* drain stream */
      }
      if (lastBody && typeof lastBody === 'object') {
        console.log('Passed parameters to API:', Object.keys(lastBody));
        console.log('temperature:', lastBody.temperature);
        console.log('store:', lastBody.store);
        console.log('metadata:', lastBody.metadata);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(message);
    }

    console.log('\n--- Testing yandex_file_search ---');
    try {
      testConfigYandex.endpoint_url = mockBaseUrl;
      const adapter = (await import('../src/modules/providers/adapters/yandex_file_search')).default as {
        handleChat: typeof gpt41.handleChat;
        _embedQuery: () => Promise<number[]>;
        _searchVectorStore: () => Promise<string>;
        _ensureCacheTable: () => Promise<void>;
        _getCachedResponse: () => Promise<null>;
        _setCachedResponse: () => Promise<void>;
      };
      adapter._embedQuery = async () => [0.1, 0.2];
      adapter._searchVectorStore = async () => 'mock context';
      adapter._ensureCacheTable = async () => {};
      adapter._getCachedResponse = async () => null;
      adapter._setCachedResponse = async () => {};

      const it = adapter.handleChat(messages, testConfigYandex, options);
      for await (const _chunk of it) {
        /* drain stream */
      }
      if (lastBody && typeof lastBody === 'object') {
        console.log('Passed parameters to API:', Object.keys(lastBody));
        console.log('instructions included:', !!lastBody.instructions);
        console.log('input format:', JSON.stringify(lastBody.input));
        console.log('store:', lastBody.store);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(message);
    }

    configLoader.getAdapterConfig = origGetConfig;
    server.close();
    process.exit(0);
  });
}

runMockTest().catch(console.error);
