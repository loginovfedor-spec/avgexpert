const { expect } = require('chai');
const sinon = require('sinon');
const chatService = require('../../src/modules/chat/chat.service');
const fallbackPolicy = require('../../src/modules/chat/fallbackPolicy');
const traceBus = require('../../src/modules/observability/trace.bus');

describe('Load Harness: Chat & Streams', () => {
  beforeEach(() => {
    traceBus.clear();
  });

  it('should handle multiple fast chats under backpressure limit', async () => {
    const limit = 5; // Simulating load
    const user = { username: 'testuser', category: 'Default' };
    const reqBase = {
      body: {
        messages: [{ role: 'user', content: 'hello' }]
      }
    };
    
    // Using a stub for categoryRepository and provider
    const catStub = sinon.stub(require('../../src/modules/admin/category.repository'), 'findByName').resolves({
      model_name: 'test-model'
    });
    const policyStub = sinon.stub(require('../../src/modules/chat/policyRouter'), 'resolveRoute').returns({
      providerId: 'deterministic', provider: {
        name: 'det',
        handleChat: async function*() {
          yield { type: 'delta', text: 'hi' };
          yield { type: 'done' };
        }
      }
    });

    const requests = Array.from({ length: limit }).map((_, i) => {
      const res = {
        req: { on: () => {}, off: () => {} },
        json: sinon.spy(),
        headersSent: false
      };
      return chatService.handleCompletion({ user, body: reqBase.body, res });
    });

    await Promise.allSettled(requests);

    const traces = traceBus.getRecentTraces();
    const completedTraces = traces.filter(t => t.action === 'model.completed');
    expect(completedTraces.length).to.be.greaterThan(0);

    catStub.restore();
    policyStub.restore();
  });
});
