import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/test-env';
import ProviderEvents from '../src/modules/providers/providerEvents';

test('ProviderEvents Contract Tests', async (t) => {
  await t.test('delta event has correct shape', () => {
    const event = ProviderEvents.delta('Hello');
    assert.equal(event.type, 'delta');
    assert.equal(event.text, 'Hello');
    assert.equal(Object.keys(event).length, 2);
  });

  await t.test('delta with empty string', () => {
    const event = ProviderEvents.delta('');
    assert.equal(event.type, 'delta');
    assert.equal(event.text, '');
  });

  await t.test('done event has correct shape', () => {
    const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
    const event = ProviderEvents.done('stop', usage);
    assert.equal(event.type, 'done');
    assert.equal(event.finishReason, 'stop');
    assert.deepEqual(event.usage, usage);
  });

  await t.test('done event defaults', () => {
    const event = ProviderEvents.done();
    assert.equal(event.finishReason, 'stop');
    assert.equal(event.usage, undefined);
  });

  await t.test('error event has correct shape', () => {
    const event = ProviderEvents.error('Provider timeout', 'provider_timeout');
    assert.equal(event.type, 'error');
    assert.equal(event.message, 'Provider timeout');
    assert.equal(event.code, 'provider_timeout');
  });

  await t.test('error event default code', () => {
    const event = ProviderEvents.error('Something failed');
    assert.equal(event.code, 'provider_error');
  });

  await t.test('toolCall event has correct shape', () => {
    const tc = { id: 'call_123', name: 'search', arguments: '{"q":"test"}' };
    const event = ProviderEvents.toolCall(tc);
    assert.equal(event.type, 'tool_call');
    assert.deepEqual(event.toolCall, tc);
  });
});
