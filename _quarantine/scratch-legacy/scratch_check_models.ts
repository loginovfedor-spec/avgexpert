import providerFactory from '../src/modules/providers/provider.factory';

const providers = providerFactory.listProviders();
const grok = providers.find((p) => p.id === 'grok');
console.log('GROK MODELS:', JSON.stringify(grok?.models, null, 2));
