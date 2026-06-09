const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, 'yandex.env') });

const gpt41 = require('./src/modules/providers/adapters/openai_gpt4_1');
const gpt55 = require('./src/modules/providers/adapters/openai_gpt5_5');
const yandex = require('./src/modules/providers/adapters/yandex');
const yandexFs = require('./src/modules/providers/adapters/yandex_file_search');

async function testAdapter(name, adapter, config, options = {}) {
    console.log(`\n================ Testing ${name} ================`);
    try {
        const messages = [
            { role: 'system', content: 'You are a helpful assistant. Reply very concisely.' },
            { role: 'user', content: 'What is 2+2? Reply only with the number.' }
        ];

        let result = '';
        const iterator = adapter.handleChat(messages, config, { stream: true, ...options });
        
        for await (const chunk of iterator) {
            if (chunk.type === 'delta') {
                result += chunk.content;
                process.stdout.write(chunk.content);
            } else if (chunk.type === 'done') {
                console.log('\n[DONE] Usage:', chunk.usage);
            } else if (chunk.type === 'tool_call') {
                console.log('\n[TOOL_CALL]', JSON.stringify(chunk.calls));
            }
        }
    } catch (e) {
        console.error(`\n[ERROR] ${name} failed:`, e.message);
        if (e.response) {
            console.error(e.response.data);
        }
    }
}

async function run() {
    const openaiKey = process.env.OPENAI_API_KEY;
    const yandexKey = process.env.YANDEX_CLOUD_API_KEY || process.env.YANDEX_API_KEY;
    const yandexFolderId = process.env.YANDEX_CLOUD_FOLDER || process.env.YANDEX_FOLDER_ID;
    const pgUrl = process.env.DATABASE_URL || process.env.PG_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

    console.log('Keys present:', { 
        openai: !!openaiKey, 
        yandex: !!yandexKey, 
        folderId: !!yandexFolderId,
        pgUrl: !!pgUrl 
    });

    if (openaiKey) {
        await testAdapter('GPT-4.1', gpt41, { api_key: openaiKey, model_name: 'gpt-4.5-preview' });
        await testAdapter('GPT-5.5 (o1)', gpt55, { api_key: openaiKey, model_name: 'o1-mini' });
    } else {
        console.log('\nSkipping GPT tests, no OPENAI_API_KEY');
    }

    if (yandexKey && yandexFolderId) {
        await testAdapter('Yandex', yandex, { api_key: yandexKey, yandex_folder_id: yandexFolderId, provider: 'yandex' });
        await testAdapter('Yandex File Search', yandexFs, { api_key: yandexKey, yandex_folder_id: yandexFolderId, provider: 'yandex_file_search' });
    } else {
        console.log('\nSkipping Yandex tests, missing YANDEX_CLOUD_API_KEY or YANDEX_CLOUD_FOLDER');
    }
}

run().catch(console.error);
