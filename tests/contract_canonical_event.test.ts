/**
 * Contract tests for AsyncIterable semantics of provider adapters.
 * Validates that all providers conform to the CanonicalChatEvent contract (SPEC-001).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/test-env';
import { DeterministicProvider } from './mocks/deterministic_provider';
import ProviderEvents from '../src/modules/providers/providerEvents';
import type { StreamEvent } from '../src/types/chat.types';

const VALID_EVENT_TYPES = new Set(['delta', 'tool_call', 'done', 'error']);

function validateEventStream(events: StreamEvent[]): void {
  assert.ok(events.length > 0, 'Stream must produce at least one event');

  const lastEvent = events[events.length - 1];
  assert.ok(
    lastEvent.type === 'done' || lastEvent.type === 'error',
    `Stream must end with 'done' or 'error', got '${lastEvent.type}'`
  );

  let terminated = false;
  for (const event of events) {
    assert.ok(!terminated, 'No events allowed after terminal event (done/error)');
    assert.ok(VALID_EVENT_TYPES.has(event.type), `Invalid event type: '${event.type}'`);

    switch (event.type) {
      case 'delta':
        assert.ok(typeof event.text === 'string', 'delta.text must be a string');
        break;
      case 'tool_call':
        assert.ok(event.toolCall && typeof event.toolCall === 'object', 'tool_call.toolCall must be an object');
        break;
      case 'done':
        terminated = true;
        if (event.finishReason !== undefined) {
          assert.ok(typeof event.finishReason === 'string', 'done.finishReason must be a string');
        }
        break;
      case 'error':
        terminated = true;
        assert.ok(typeof event.message === 'string', 'error.message must be a string');
        break;
    }
  }
}

test('AsyncIterable Contract Tests (SPEC-001)', async (t) => {
  await t.test('handleChat returns AsyncIterable', async () => {
    const provider = new DeterministicProvider({ response: 'test' });
    const stream = provider.handleChat([{ role: 'user', content: 'hi' }], {}, { stream: true });
    assert.ok(stream[Symbol.asyncIterator], 'handleChat must return an AsyncIterable');
  });

  await t.test('AsyncIterable yields CanonicalChatEvent objects', async () => {
    const provider = new DeterministicProvider({ response: 'Hello world' });
    const events: StreamEvent[] = [];
    for await (const event of provider.handleChat([], {}, { stream: true })) {
      events.push(event);
    }
    validateEventStream(events);
  });

  await t.test('Stream terminates with done event on success', async () => {
    const provider = new DeterministicProvider({ response: 'OK' });
    const events: StreamEvent[] = [];
    for await (const event of provider.handleChat([], {}, {})) {
      events.push(event);
    }
    const last = events[events.length - 1];
    assert.equal(last.type, 'done');
  });

  await t.test('Stream terminates with error event on failure', async () => {
    const provider = new DeterministicProvider({ shouldError: true, errorMessage: 'Fail' });
    const events: StreamEvent[] = [];
    for await (const event of provider.handleChat([], {}, {})) {
      events.push(event);
    }
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'error');
    assert.equal(events[0].message, 'Fail');
  });

  await t.test('Multi-chunk stream maintains event ordering', async () => {
    const provider = new DeterministicProvider({ chunks: ['a', 'b', 'c'] });
    const events: StreamEvent[] = [];
    for await (const event of provider.handleChat([], {}, {})) {
      events.push(event);
    }
    const doneIdx = events.findIndex((e) => e.type === 'done');
    for (let i = 0; i < doneIdx; i++) {
      assert.equal(events[i].type, 'delta', `Event at index ${i} should be delta`);
    }
    assert.equal(events[doneIdx].type, 'done');
  });

  await t.test('Tool call stream follows valid ordering', async () => {
    const tc = { id: 'call_1', name: 'fn', arguments: '{}' };
    const provider = new DeterministicProvider({ toolCall: tc });
    const events: StreamEvent[] = [];
    for await (const event of provider.handleChat([], {}, {})) {
      events.push(event);
    }
    validateEventStream(events);
    assert.equal(events[0].type, 'tool_call');
    assert.equal(events[1].type, 'done');
  });

  await t.test('No events after done (terminal check)', async () => {
    const provider = new DeterministicProvider({ response: 'ok' });
    const events: StreamEvent[] = [];
    for await (const event of provider.handleChat([], {}, {})) {
      events.push(event);
    }
    validateEventStream(events);
  });

  await t.test('Usage payload in done event has correct shape', async () => {
    const usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
    const provider = new DeterministicProvider({ response: 'ok', usage });
    const events: StreamEvent[] = [];
    for await (const event of provider.handleChat([], {}, {})) {
      events.push(event);
    }
    const done = events.find((e) => e.type === 'done');
    assert.ok(done?.usage);
    assert.equal(done.usage?.prompt_tokens, 100);
    assert.equal(done.usage?.completion_tokens, 50);
    assert.equal(done.usage?.total_tokens, 150);
  });

  await t.test('Factory functions produce valid events', () => {
    const delta = ProviderEvents.delta('hi');
    const done = ProviderEvents.done('stop', { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 });
    const error = ProviderEvents.error('bad', 'err_code');
    const tool = ProviderEvents.toolCall({ id: '1', name: 'f', arguments: '{}' });

    assert.equal(delta.type, 'delta');
    assert.equal(done.type, 'done');
    assert.equal(error.type, 'error');
    assert.equal(tool.type, 'tool_call');
  });
});
