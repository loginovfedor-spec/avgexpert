import modelGateway from '../src/modules/chat/model.gateway';
import providerFactory from '../src/modules/providers/provider.factory';
import type { ChatMessage, StreamEvent } from '../src/types/chat.types';

async function run(): Promise<void> {
  console.log('Testing ModelGateway stream directly...');
  try {
    const provider = providerFactory.getProvider('deepseek');
    if (!provider) throw new Error('Provider not found');

    if (!provider.handleChat) throw new Error('Provider missing handleChat');

    const stream = modelGateway.handleChat({
      messages: [{ role: 'user', content: 'hello' }],
      settings: {
        model_name: 'test-model',
        adapter: 'deepseek',
        endpoint_url: 'http://127.0.0.1:8080/deepseek',
      },
      options: { stream: true },
      route: {
        providerId: 'deepseek',
        provider: {
          name: provider.name ?? 'deepseek',
          handleChat: provider.handleChat as (
            messages: ChatMessage[],
            settings: Record<string, unknown>,
            options: Record<string, unknown>
          ) => AsyncIterable<StreamEvent>,
        },
      },
    });

    for await (const chunk of stream) {
      console.log('Chunk:', chunk);
    }
    console.log('Stream finished.');
  } catch (err) {
    console.error('Error:', err);
  }
}

void run();
