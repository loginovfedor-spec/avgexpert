const modelGateway = require('../src/modules/chat/model.gateway');
const { getProvider } = require('../src/modules/providers/provider.factory');

async function run() {
  console.log('Testing ModelGateway stream directly...');
  try {
    const provider = getProvider('deepseek');
    if (!provider) throw new Error('Provider not found');

    const stream = await modelGateway.handleChat({
      messages: [{ role: 'user', content: 'hello' }],
      settings: {
        model_name: 'test-model',
        adapter: 'deepseek',
        endpoint_url: 'http://127.0.0.1:8080/deepseek', // using envoy proxy
      },
      options: { stream: true },
      route: { providerId: 'deepseek', provider }
    });

    for await (const chunk of stream) {
      console.log('Chunk:', chunk);
    }
    console.log('Stream finished.');
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
