import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleGenerativeAI } from '@google/generative-ai';
import googleProvider from '../../src/modules/providers/adapters/google';
import { StreamEvent } from '../../src/types/chat.types';

test('GoogleProvider handleChat normalizes cachedContentTokenCount and enriches cost', async () => {
  const originalGetModel = GoogleGenerativeAI.prototype.getGenerativeModel;

  const mockResponse = {
    text: () => 'Hello user!',
    usageMetadata: {
      promptTokenCount: 1000,
      candidatesTokenCount: 200,
      totalTokenCount: 1200,
      cachedContentTokenCount: 400
    }
  };

  const mockModel = {
    startChat: () => ({
      sendMessage: async (msg: string) => ({
        response: mockResponse
      })
    })
  };

  GoogleGenerativeAI.prototype.getGenerativeModel = () => mockModel as any;

  try {
    const config = {
      api_key: 'test-key',
      model_name: 'gemini-3.5-flash',
      // Внедрим тестовые цены в .env config для Gemini
      COST_USD_PER_1M_INPUT: '1.50',
      COST_USD_PER_1M_CACHED_INPUT: '0.15',
      COST_USD_PER_1M_OUTPUT: '9.00',
      COST_MODE: 'standard',
      COST_CURRENCY: 'USD',
      COST_EXCHANGE_RATE: '1.0'
    };

    const events: StreamEvent[] = [];
    for await (const event of googleProvider.handleChat([{ role: 'user', content: 'Hi' }], config, { stream: false })) {
      events.push(event);
    }

    // Должно быть два события: delta (текст) и done (статистика)
    assert.equal(events.length, 2);
    
    const deltaEvent = events[0];
    assert.equal(deltaEvent.type, 'delta');
    assert.equal(deltaEvent.text, 'Hello user!');

    const doneEvent = events[1];
    assert.equal(doneEvent.type, 'done');
    assert.ok(doneEvent.usage);
    
    const usage = doneEvent.usage!;
    assert.equal(usage.prompt_tokens, 1000);
    assert.equal(usage.cached_input_tokens, 400);
    assert.equal(usage.completion_tokens, 200);
    assert.equal(usage.total_tokens, 1200);

    // Считаем стоимость:
    // fresh_input = 1000 - 400 = 600
    // cost = (600 * 1.5e-6) + (400 * 0.15e-6) + (200 * 9e-6)
    // cost = 0.0009 + 0.00006 + 0.0018 = 0.00276 USD
    assert.equal(usage.cost_usd, 0.00276);

  } finally {
    GoogleGenerativeAI.prototype.getGenerativeModel = originalGetModel;
  }
});
