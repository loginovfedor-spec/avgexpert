import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/test-env';
import { DeterministicProvider } from './mocks/deterministic_provider';

test('DeterministicProvider', async (t) => {
  await t.test('normal mode: returns delta + done', async () => {
    const provider = new DeterministicProvider({ response: 'Test response' });
    const events = [];
    for await (const event of provider.chat([{ role: 'user', content: 'hi' }])) {
      events.push(event);
    }
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'delta');
    assert.equal(events[0].text, 'Test response');
    assert.equal(events[1].type, 'done');
    assert.equal(events[1].finishReason, 'stop');
    assert.ok(events[1].usage);
  });

  await t.test('error mode: returns error event', async () => {
    const provider = new DeterministicProvider({
      shouldError: true,
      errorMessage: 'Boom!',
    });
    const events = [];
    for await (const event of provider.chat([])) {
      events.push(event);
    }
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'error');
    assert.equal(events[0].message, 'Boom!');
  });

  await t.test('multi-chunk mode: returns multiple deltas', async () => {
    const provider = new DeterministicProvider({
      chunks: ['Hello', ' ', 'World'],
    });
    const events = [];
    for await (const event of provider.chat([])) {
      events.push(event);
    }
    assert.equal(events.length, 4);
    assert.equal(events[0].text, 'Hello');
    assert.equal(events[1].text, ' ');
    assert.equal(events[2].text, 'World');
    assert.equal(events[3].type, 'done');
  });

  await t.test('tool call mode: returns tool_call + done', async () => {
    const tc = { id: 'call_1', name: 'search', arguments: '{"q":"test"}' };
    const provider = new DeterministicProvider({ toolCall: tc });
    const events = [];
    for await (const event of provider.chat([])) {
      events.push(event);
    }
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'tool_call');
    assert.deepEqual(events[0].toolCall, tc);
    assert.equal(events[1].type, 'done');
  });

  await t.test('healthCheck returns online', async () => {
    const provider = new DeterministicProvider();
    const result = await provider.healthCheck();
    assert.equal(result.status, 'online');
    assert.equal(result.provider, 'deterministic');
  });

  await t.test('delay mode: respects delayMs', async () => {
    const provider = new DeterministicProvider({ delayMs: 50, response: 'delayed' });
    const start = Date.now();
    const events = [];
    for await (const event of provider.chat([])) {
      events.push(event);
    }
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 40, `Expected >= 40ms delay, got ${elapsed}ms`);
    assert.equal(events[0].text, 'delayed');
  });
});
