const { listProviders } = require('./src/modules/providers/provider.factory');
const providers = listProviders();
const grok = providers.find(p => p.id === 'grok');
console.log('GROK MODELS:', JSON.stringify(grok.models, null, 2));
