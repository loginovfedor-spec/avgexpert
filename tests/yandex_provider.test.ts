import test from 'node:test';
import assert from 'node:assert';
import yandexProvider from '../src/modules/providers/adapters/yandex';

test('Yandex Cloud Provider Adapter', async (t) => {
  await t.test('Initial properties', () => {
    assert.strictEqual(yandexProvider.id, 'yandex');
    assert.strictEqual(yandexProvider.name, 'Yandex Cloud');
    assert.ok(yandexProvider.models.includes('aliceai-llm-flash/latest'));
  });

  await t.test('Model formatting helper', () => {
    const formatted = yandexProvider._formatModel('aliceai-llm/latest', 'folder123');
    assert.strictEqual(formatted, 'gpt://folder123/aliceai-llm/latest');

    const rawGpt = yandexProvider._formatModel('gpt://folder123/custom-model', 'folder123');
    assert.strictEqual(rawGpt, 'gpt://folder123/custom-model');
  });

  await t.test('Message format conversion', () => {
    const messages = [
      { role: 'system' as const, content: 'You are Alice' },
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there' },
    ];

    const { instructions, input } = yandexProvider._convertMessages(messages);

    assert.strictEqual(instructions, 'You are Alice');
    assert.strictEqual(input.length, 2);
    assert.strictEqual(input[0].role, 'user');
    assert.strictEqual(input[0].content[0].text, 'Hello');
    assert.strictEqual(input[1].role, 'assistant');
    assert.strictEqual(input[1].content[0].text, 'Hi there');
  });
});
