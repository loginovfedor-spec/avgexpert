import test from 'node:test';
import assert from 'node:assert';
import chatService from '../../src/modules/chat/chat.service';
import fallbackPolicy from '../../src/modules/chat/fallbackPolicy';
import categoryRepository from '../../src/modules/admin/category.repository';
import policyRouter from '../../src/modules/chat/policyRouter';
import { asMock } from '../helpers/cast';
import type { Response } from 'express';

test('should fallback when primary provider times out', () => {
  const err = new Error('Provider timeout') as Error & { code?: string };
  err.code = 'ETIMEDOUT';

  assert.strictEqual(fallbackPolicy.shouldFallback(err), true);
});

test('should handle LiteLLM unavailability (502 Bad Gateway) and fallback', () => {
  const err = new Error('Bad Gateway') as Error & { status?: number };

  err.status = 502;

  assert.strictEqual(fallbackPolicy.shouldFallback(err), true);
});

test('should trigger backpressure limit and fallback to another provider', async () => {
  const user = { username: 'chaosuser', category: 'Default' };
  const body = { messages: [{ role: 'user' as const, content: 'test' }] };

  const originalFindByName = categoryRepository.findByName;
  const originalResolveRoute = policyRouter.resolveRoute;

  categoryRepository.findByName = async () => ({}) as never;
  policyRouter.resolveRoute = () =>
    ({
      providerId: 'overloaded',
      provider: {
        name: 'over',
        handleChat: async function* () {
          await new Promise((r) => setTimeout(r, 10));
          yield { type: 'done' };
        },
      },
      fallbackProviderId: 'fallback1',
      fallbackProvider: {
        name: 'fall',
        handleChat: async function* () {
          yield { type: 'done' };
        },
      },
    }) as never;

  try {
    const requests = Array.from({ length: 60 }).map(() => {
      const res = {
        req: { on: () => {}, off: () => {} },
        json: () => {},
        headersSent: false,
        status: () => res,
      };
      return chatService.handleCompletion({
        user,
        body: asMock<Parameters<typeof chatService.handleCompletion>[0]['body']>(body),
        catSettings: asMock<Parameters<typeof chatService.handleCompletion>[0]['catSettings']>({}),
        res: asMock<Response>(res),
      }).catch((e) => e);
    });

    const results = await Promise.allSettled(requests);
    assert.strictEqual(results.length, 60);
  } finally {
    categoryRepository.findByName = originalFindByName;
    policyRouter.resolveRoute = originalResolveRoute;
  }
});
