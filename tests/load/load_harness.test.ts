import test from 'node:test';
import assert from 'node:assert/strict';
import chatService from '../../src/modules/chat/chat.service';
import modelGateway from '../../src/modules/chat/model.gateway';
import policyRouter from '../../src/modules/chat/policyRouter';
import traceBus from '../../src/modules/observability/trace.bus';
import type { StreamEvent } from '../../src/types/chat.types';
import { asMock } from '../helpers/cast';
import type { Response } from 'express';

test('Load Harness: Chat & Streams — completes chat and emits model.completed trace', async () => {
  traceBus.clear();

  const user = { username: 'testuser', category: 'Default' };
  const body = { messages: [{ role: 'user' as const, content: 'hello' }] };
  const catSettings = {
    model_name: 'mock',
    provider: 'deterministic',
    rag_enabled: false,
    sandbox_enabled: false,
  };

  const originalResolveRoute = policyRouter.resolveRoute.bind(policyRouter);
  const originalHandleChat = modelGateway.handleChat.bind(modelGateway);

  policyRouter.resolveRoute = () => ({
    providerId: 'deterministic',
    provider: { id: 'deterministic', name: 'det', handleChat: async function* () {} },
    mode: 'direct',
    fallbackProviderId: null,
    endpointUrl: null,
  });

  modelGateway.handleChat = async function* (): AsyncIterable<StreamEvent> {
    yield { type: 'provider_selected', providerId: 'deterministic', providerName: 'det', model: 'mock' };
    yield { type: 'delta', text: 'hi' };
    yield {
      type: 'done',
      finishReason: 'stop',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
  };

  try {
    const res = {
      req: { on: () => {}, off: () => {} },
      json: () => {},
      headersSent: false,
      status: () => res,
    };

    await chatService.handleCompletion({
      user,
      body,
      catSettings,
      res: asMock<Response>(res),
    });

    const traces = traceBus.getRecentTraces();
    assert.ok(traces.some((t) => t.action === 'model.completed'));
  } finally {
    modelGateway.handleChat = originalHandleChat;
    policyRouter.resolveRoute = originalResolveRoute;
  }
});
