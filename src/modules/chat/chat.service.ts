import type { Response } from 'express';
import policyRouter from './policyRouter';
import modelGateway from './model.gateway';
import mapper from './chat_completion.mapper';
import missionBinding from './mission_binding.service';
import providersConfig from '../../core/providers.config';
import { PROVIDER_TIMEOUT,
  KNOWLEDGE_GATEWAY_ENABLED,
  CONVERSATION_MAX_TOKENS, } from '../../core/config';
import { validateProviderUrl } from '../../core/utils';
import traceBus from '../observability/trace.bus';
import * as limits from './limit.service';
import { writeChatCompletionStream, writeErrorResponse } from './stream_response.service';
import { buildRecordUsageParams, assertUserCanSpendFunds } from './billing.helpers';
import { recordUsageAndCost } from './token_usage.service';
import logger from '../../core/logger';
import { isRagEffective } from '../rag/rag.policy';
import knowledgeGateway from '../knowledge/knowledge.gateway';
import { ragOrchestrator } from '../rag/rag.orchestrator';
import { truncateConversationMessages } from '../rag/conversation.context';
import type { ChatMessage } from '../../types/chat.types';
import type { RetrievalResult } from '../knowledge/knowledge.types';
import { getDatabasePort } from '../../core/pg';

const chatServiceLogger = logger.scoped('ChatService');

type ChatUser = Record<string, unknown> & {
  username: string;
};

type ChatBody = Record<string, unknown> & {
  messages: ChatMessage[];
  stream?: boolean;
  run_id?: string;
  runId?: string;
  session_id?: string;
  sessionId?: string;
};

type ChatCategorySettings = Record<string, unknown> & {
  model_name?: string;
  input_context_max?: number | string;
};

type ProviderError = Error & {
  status?: number;
  code?: string;
};

async function truncateMessages(messages: ChatMessage[], catSettings: ChatCategorySettings): Promise<ChatMessage[]> {
  const categoryMax = parseInt(String(catSettings.input_context_max), 10);
  const maxTokens = Number.isFinite(categoryMax) && categoryMax > 0
    ? categoryMax
    : CONVERSATION_MAX_TOKENS;
  return truncateConversationMessages(messages, { maxTokens });
}

class ChatService {
  async handleCompletion({
    user,
    body,
    catSettings,
    res,
    missionId,
  }: {
    user: ChatUser;
    body: ChatBody;
    catSettings: ChatCategorySettings;
    res: Response;
    missionId?: string;
  }): Promise<void> {
    const runId = body.run_id || body.runId;

    const route = policyRouter.resolveRoute(catSettings);

    const startTimestamp = Date.now();
    traceBus.emitTrace('ChatService', 'model.requested', {
      providerId: route.providerId,
      modelName: catSettings.model_name,
      runId,
    });
    const providerCfg = providersConfig[route.providerId] || {};

    const { messages: baseMessages, injectionDetected } = mapper.prepareMessages({
      messages: body.messages,
      user,
      categorySettings: catSettings,
    });

    let { options, mergedSettings } = mapper.mapOptions(body, catSettings, user, providerCfg);

    if (injectionDetected && missionId) {
      chatServiceLogger.warn('Prompt injection attempt detected', { username: user.username, missionId });
      missionBinding.addConflict(missionId, { type: 'SECURITY_INJECTION', message: 'Prompt injection detected' });
    }

    let retrievalResult: unknown = null;
    let messages = await truncateMessages([...baseMessages], catSettings);
    const sessionId = body.session_id || body.sessionId;
    const ragOrchestratorInstance = ragOrchestrator;
    const ragCatSettings = catSettings as Record<string, unknown>;
    const useRagV2 = ragOrchestratorInstance.shouldUseRagV2(ragCatSettings, user);

    if (useRagV2) {
      mergedSettings = ragOrchestratorInstance.resolve({ catSettings: ragCatSettings, mergedSettings }) as typeof mergedSettings;

      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
      const query = lastUserMessage?.content || '';

      retrievalResult = await ragOrchestratorInstance.retrieve({
        query,
        catSettings: ragCatSettings,
        user,
        sessionId,
      });

      if ((retrievalResult as { metadata: { shouldRefuse?: boolean } }).metadata.shouldRefuse) {
        this._handleRefusal(res, retrievalResult);
        return;
      }

      const contextText = ragOrchestratorInstance.formatContext(retrievalResult as RetrievalResult);
      if (contextText) {
        let injected = false;
        messages = messages.map((m) => {
          if (!injected && m.role === 'user' && m.content === query) {
            injected = true;
            return { ...m, content: `${contextText}\n\nUser Query: ${m.content}` };
          }
          return m;
        });
      }
    } else if (KNOWLEDGE_GATEWAY_ENABLED && isRagEffective(catSettings, user)) {
      const kgw = knowledgeGateway;
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
      const query = lastUserMessage?.content || '';

      retrievalResult = await kgw.retrieve(query, { settings: { ...catSettings, sessionId } });

      if ((retrievalResult as { metadata: { shouldRefuse?: boolean } }).metadata.shouldRefuse) {
        this._handleRefusal(res, retrievalResult);
        return;
      }

      const contextText = kgw.formatContext(retrievalResult as RetrievalResult);
      if (contextText) {
        let injected = false;
        messages = messages.map((m) => {
          if (!injected && m.role === 'user' && m.content === query) {
            injected = true;
            return { ...m, content: `${contextText}\n\nUser Query: ${m.content}` };
          }
          return m;
        });
      }
    }

    limits.validateInputLimit(messages, user, catSettings, providerCfg);

    const effectiveEndpointUrl = providerCfg.endpoint_url || null;
    const isLocalProvider = ['llamacpp', 'ollama', 'deterministic'].includes(providerCfg.adapter || '');
    if (effectiveEndpointUrl) {
      validateProviderUrl(effectiveEndpointUrl, isLocalProvider);
    }

    const ac = new AbortController();
    const reqCloseHandler = () => ac.abort(new Error('Client disconnected'));
    res.req.on('close', reqCloseHandler);
    const providerTimeoutMs = limits.getProviderTimeout(providerCfg, PROVIDER_TIMEOUT);
    const timeoutId = setTimeout(
      () => ac.abort(new Error(`Provider timeout (${providerTimeoutMs}ms)`)),
      providerTimeoutMs
    );

    if (!user.is_admin) {
      const db = getDatabasePort();
      const fresh = await db.get<{ balance_usd: number | string; credit_limit_usd?: number | string; is_blocked: boolean }>(
        'SELECT balance_usd, credit_limit_usd, is_blocked FROM users WHERE username = @username',
        { username: user.username }
      );
      if (fresh) {
        assertUserCanSpendFunds(fresh);
      }
    }

    try {
      const stream = await modelGateway.handleChat({
        messages,
        settings: {
          ...providerCfg,
          ...mergedSettings,
          extra_params: {
            ...(providerCfg.extra_params || {}),
            ...(mergedSettings.extra_params || {}),
          },
          endpoint_url: mergedSettings.extra_params?.endpoint_url || mergedSettings.endpoint_url || providerCfg.endpoint_url,
          api_key: mergedSettings.extra_params?.api_key || mergedSettings.api_key || providerCfg.api_key,
        },
        options: { ...options, signal: ac.signal },
        route: route as Parameters<typeof modelGateway.handleChat>[0]['route'],
      });

      const result = await writeChatCompletionStream({
        stream,
        res,
        modelName: catSettings.model_name,
        isStreaming: options.stream,
        retrievalResult,
      });

      await recordUsageAndCost(
        buildRecordUsageParams({
          user,
          result,
          providerCfg,
          catSettings,
          body: { run_id: runId },
          source: 'heavy path',
        })
      );

      traceBus.emitTrace('ChatService', 'model.completed', {
        providerId: result.providerId,
        modelName: catSettings.model_name,
        latencyMs: Date.now() - startTimestamp,
        costUsd: result.usage?.cost_usd,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message !== 'Client disconnected') {
        chatServiceLogger.error('Chat service failed', { providerId: route.providerId, message });
        traceBus.emitTrace('ChatService', 'model.failed', { providerId: route.providerId, error: message });
        writeErrorResponse(err, res);
      }
    } finally {
      clearTimeout(timeoutId);
      res.req.off('close', reqCloseHandler);
    }
  }

  _handleRefusal(res: Response, retrievalResult: unknown): void {
    const refusalMessage = "I don't have enough information in the provided context to answer this query.";
    const response = mapper.buildResponse(null, refusalMessage, { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
    res.json({
      ...response,
      _retrieval: retrievalResult,
    });
  }


}

export = new ChatService();
