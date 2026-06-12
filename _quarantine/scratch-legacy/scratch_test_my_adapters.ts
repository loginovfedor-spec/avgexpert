import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import gpt41 from '../src/modules/providers/adapters/openai_gpt4_1';
import gpt55 from '../src/modules/providers/adapters/openai_gpt5_5';
import yandex from '../src/modules/providers/adapters/yandex';
import yandexFs from '../src/modules/providers/adapters/yandex_file_search';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, 'yandex.env') });

type AdapterLike = {
  handleChat: (
    messages: Array<{ role: string; content: string }>,
    config: Record<string, unknown>,
    options: Record<string, unknown>
  ) => AsyncIterable<{ type: string; content?: string; usage?: unknown; calls?: unknown }>;
};

async function testAdapter(
  name: string,
  adapter: AdapterLike,
  config: Record<string, unknown>,
  options: Record<string, unknown> = {}
): Promise<void> {
  console.log(`\n================ Testing ${name} ================`);
  try {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant. Reply very concisely.' },
      { role: 'user', content: 'What is 2+2? Reply only with the number.' },
    ];

    const iterator = adapter.handleChat(messages, config, { stream: true, ...options });

    for await (const chunk of iterator) {
      if (chunk.type === 'delta') {
        process.stdout.write(chunk.content ?? '');
      } else if (chunk.type === 'done') {
        console.log('\n[DONE] Usage:', chunk.usage);
      } else if (chunk.type === 'tool_call') {
        console.log('\n[TOOL_CALL]', JSON.stringify(chunk.calls));
      }
    }
  } catch (e: unknown) {
    const err = e as Error & { response?: { data: unknown } };
    console.error(`\n[ERROR] ${name} failed:`, err.message);
    if (err.response) {
      console.error(err.response.data);
    }
  }
}

async function run(): Promise<void> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const yandexKey = process.env.YANDEX_CLOUD_API_KEY || process.env.YANDEX_API_KEY;
  const yandexFolderId = process.env.YANDEX_CLOUD_FOLDER || process.env.YANDEX_FOLDER_ID;
  const pgUrl = process.env.DATABASE_URL || process.env.PG_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

  console.log('Keys present:', {
    openai: !!openaiKey,
    yandex: !!yandexKey,
    folderId: !!yandexFolderId,
    pgUrl: !!pgUrl,
  });

  if (openaiKey) {
    await testAdapter('GPT-4.1', gpt41, { api_key: openaiKey, model_name: 'gpt-4.5-preview' });
    await testAdapter('GPT-5.5 (o1)', gpt55, { api_key: openaiKey, model_name: 'o1-mini' });
  } else {
    console.log('\nSkipping GPT tests, no OPENAI_API_KEY');
  }

  if (yandexKey && yandexFolderId) {
    await testAdapter('Yandex', yandex, {
      api_key: yandexKey,
      yandex_folder_id: yandexFolderId,
      provider: 'yandex',
    });
    await testAdapter('Yandex File Search', yandexFs, {
      api_key: yandexKey,
      yandex_folder_id: yandexFolderId,
      provider: 'yandex_file_search',
    });
  } else {
    console.log('\nSkipping Yandex tests, missing YANDEX_CLOUD_API_KEY or YANDEX_CLOUD_FOLDER');
  }
}

run().catch(console.error);
