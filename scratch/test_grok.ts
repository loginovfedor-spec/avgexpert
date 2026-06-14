import Grok from '../src/modules/providers/adapters/grok';
// @ts-expect-error openai_compat module removed; kept for legacy mock test
import { OpenAICompatProvider } from '../src/modules/providers/adapters/openai_compat';

void (async () => {
  const messages = [{ role: 'user', content: 'hello' }];
  const config = { api_key: 'test', collection_ids: ['123'] };

  let round = 0;
  OpenAICompatProvider.prototype.handleChat = async function* (
    m: unknown[],
    _c: unknown,
    _o: unknown
  ): AsyncGenerator<{ type: string; toolCall?: unknown[]; text?: string; finishReason?: string }> {
    console.log('Called super.handleChat with messages len:', m.length);
    console.log('Messages:', JSON.stringify(m, null, 2));
    if (round === 0) {
      round++;
      yield {
        type: 'tool_call',
        toolCall: [{ index: 0, id: 'call_1', function: { name: 'collections_search', arguments: '{"query":"hi"}' } }],
      };
      yield { type: 'done', finishReason: 'stop' };
    } else {
      yield { type: 'delta', text: 'this is the answer' };
      yield { type: 'done', finishReason: 'stop' };
    }
  };

  (Grok as { _searchCollections?: () => Promise<string> })._searchCollections = async () => 'some chunk data';

  const stream = Grok.handleChat(messages, config, {});
  for await (const evt of stream) {
    console.log('YIELDED:', JSON.stringify(evt, null, 2));
  }
})();
