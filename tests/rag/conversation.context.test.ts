import test from 'node:test';
import assert from 'node:assert/strict';

test('truncateConversationMessages keeps recent messages within token budget', async () => {
  const { truncateConversationMessages } = await import('../../src/modules/rag/conversation.context');

  const messages = [
    { role: 'system' as const, content: 'System prompt' },
    { role: 'user' as const, content: 'old message '.repeat(200) },
    { role: 'assistant' as const, content: 'old reply '.repeat(200) },
    { role: 'user' as const, content: 'latest question' },
  ];

  const truncated = await truncateConversationMessages(messages, { maxTokens: 120 });

  assert.equal(truncated[0].role, 'system');
  assert.equal(truncated[truncated.length - 1].content, 'latest question');
  assert.ok(truncated.length < messages.length);
});

test('defaultSummarizeHook returns null (post-v1 stub)', async () => {
  const { defaultSummarizeHook } = await import('../../src/modules/rag/conversation.context');
  const summary = await defaultSummarizeHook([{ role: 'user', content: 'hello' }]);
  assert.equal(summary, null);
});
