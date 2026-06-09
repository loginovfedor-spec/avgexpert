const Grok = require('../src/modules/providers/adapters/grok');
const { OpenAICompatProvider } = require('../src/modules/providers/adapters/openai_compat');

(async () => {
  const messages = [{ role: 'user', content: 'hello' }];
  const config = { api_key: 'test', collection_ids: ['123'] };
  
  // mock super.handleChat
  let round = 0;
  OpenAICompatProvider.prototype.handleChat = async function*(m, c, o) {
    console.log("Called super.handleChat with messages len:", m.length);
    console.log("Messages:", JSON.stringify(m, null, 2));
    if (round === 0) {
      round++;
      yield { type: 'tool_call', toolCall: [{ index: 0, id: 'call_1', function: { name: 'collections_search', arguments: '{"query":"hi"}' } }] };
      yield { type: 'done', finishReason: 'stop' };
    } else {
      yield { type: 'delta', text: 'this is the answer' };
      yield { type: 'done', finishReason: 'stop' };
    }
  };
  
  // mock search
  Grok._searchCollections = async () => 'some chunk data';
  
  const stream = Grok.handleChat(messages, config, {});
  for await (const evt of stream) {
    console.log("YIELDED:", JSON.stringify(evt, null, 2));
  }
})();
