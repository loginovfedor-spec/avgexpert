const assert = require('node:assert');
const chatService = require('../../src/modules/chat/chat.service');
const fallbackPolicy = require('../../src/modules/chat/fallbackPolicy');
const { describe, it } = require('node:test');

describe('Chaos Tests: Graceful Degradation', () => {
  it('should fallback when primary provider times out', async () => {
    const err = new Error('Provider timeout');
    err.code = 'ETIMEDOUT';
    
    assert.strictEqual(fallbackPolicy.shouldFallback(err), true);
  });

  it('should handle LiteLLM unavailability (502 Bad Gateway) and fallback', async () => {
    const err = new Error('Bad Gateway');
    err.status = 502;
    
    assert.strictEqual(fallbackPolicy.shouldFallback(err), true);
  });

  it('should trigger backpressure limit and fallback to another provider', async () => {
    const user = { username: 'chaosuser', category: 'Default' };
    const reqBase = { body: { messages: [{ role: 'user', content: 'test' }] } };
    
    const categoryRepository = require('../../src/modules/admin/category.repository');
    const policyRouter = require('../../src/modules/chat/policyRouter');
    
    const originalFindByName = categoryRepository.findByName;
    const originalResolveRoute = policyRouter.resolveRoute;
    
    categoryRepository.findByName = async () => ({});
    policyRouter.resolveRoute = () => ({
      providerId: 'overloaded',
      provider: {
        name: 'over',
        handleChat: async function*() {
          // Delay to hold request
          await new Promise(r => setTimeout(r, 10));
          yield { type: 'done' };
        }
      },
      fallbackProviderId: 'fallback1',
      fallbackProvider: {
        name: 'fall',
        handleChat: async function*() {
          yield { type: 'done' };
        }
      }
    });

    try {
      const requests = Array.from({ length: 60 }).map((_, i) => {
        const res = { req: { on: () => {}, off: () => {} }, json: () => {}, headersSent: false, status: () => res };
        return chatService.handleCompletion({ user, body: reqBase.body, res }).catch(e => e);
      });

      const results = await Promise.allSettled(requests);
      assert.strictEqual(results.length, 60);
    } finally {
      categoryRepository.findByName = originalFindByName;
      policyRouter.resolveRoute = originalResolveRoute;
    }
  });
});
