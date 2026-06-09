const categoryRepository = require('../admin/category.repository');
const policyRouter = require('./policyRouter');
const modelGateway = require('./model.gateway');
const mapper = require('./chat_completion.mapper');
const missionBinding = require('./mission_binding.service');
const providersConfig = require('../../core/providers.config');
const { PROVIDER_TIMEOUT, KNOWLEDGE_GATEWAY_ENABLED } = require('../../core/config');
const { validateProviderUrl } = require('../../core/utils');
const traceBus = require('../observability/trace.bus');
const limits = require('./limit.service');
const { writeChatCompletionStream } = require('./stream_response.service');
const { recordTokenUsage } = require('./token_usage.service');
const logger = require('../../core/logger').scoped('ChatService');

// Knowledge Gateway (lazy-loaded)
let _knowledgeGateway = null;
function getKnowledgeGateway() {
  if (!_knowledgeGateway) {
    _knowledgeGateway = require('../knowledge/knowledge.gateway');
  }
  return _knowledgeGateway;
}

class ChatService {
  /**
   * Heavy Path execution: RAG.
   */
  async handleCompletion({ user, body, catSettings, res, missionId }) {
    const runId = body.run_id || body.runId;

    // 1. Resolve Route
    const route = policyRouter.resolveRoute(catSettings);

    const startTimestamp = Date.now();
    traceBus.emitTrace('ChatService', 'model.requested', { 
      providerId: route.providerId, 
      modelName: catSettings.model_name,
      runId 
    });
    const providerCfg = providersConfig[route.providerId] || {};

    // 2. Prepare Messages & Options
    const { messages: baseMessages, injectionDetected } = mapper.prepareMessages({ 
      messages: body.messages, 
      user, 
      categorySettings: catSettings 
    });
    
    const { options, mergedSettings } = mapper.mapOptions(body, catSettings, user, providerCfg);

    if (injectionDetected) {
      logger.warn('Prompt injection attempt detected', { username: user.username, missionId });
      missionBinding.addConflict(missionId, { type: 'SECURITY_INJECTION', message: 'Prompt injection detected' });
    }

    // 3. Knowledge Gateway Retrieval
    let retrievalResult = null;
    let messages = [...baseMessages];

    if (KNOWLEDGE_GATEWAY_ENABLED && catSettings.rag_enabled) {
      const kgw = getKnowledgeGateway();
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      const query = lastUserMessage?.content || '';
      
      retrievalResult = await kgw.retrieve(query, { settings: catSettings, sessionId: body.session_id || body.sessionId });

      if (retrievalResult.metadata.shouldRefuse) {
        return this._handleRefusal(res, retrievalResult);
      }

      const contextText = kgw.formatContext(retrievalResult);
      if (contextText) {
        let injected = false;
        messages = messages.map(m => {
          if (!injected && m.role === 'user' && m.content === query) {
            injected = true;
            return { ...m, content: `${contextText}\n\nUser Query: ${m.content}` };
          }
          return m;
        });
      }
    }

    // 4. SSRF Validation
    limits.validateInputLimit(messages, user, catSettings, providerCfg);

    // 4. SSRF Validation
    const effectiveEndpointUrl = providerCfg.endpoint_url || null;
    const isLocalProvider = ['llamacpp', 'ollama', 'deterministic'].includes(providerCfg.adapter);
    if (effectiveEndpointUrl) {
      validateProviderUrl(effectiveEndpointUrl, isLocalProvider);
    }

    // 5. Abort Control
    const ac = new AbortController();
    const reqCloseHandler = () => ac.abort(new Error('Client disconnected'));
    res.req.on('close', reqCloseHandler);
    const timeoutId = setTimeout(() => ac.abort(new Error('Provider timeout')), PROVIDER_TIMEOUT);

    try {
      // 6. Call ModelGateway
      const stream = await modelGateway.handleChat({
        messages,
        settings: {
          ...providerCfg,
          ...mergedSettings,
          extra_params: {
            ...(providerCfg.extra_params || {}),
            ...(mergedSettings.extra_params || {})
          },
          endpoint_url: mergedSettings.extra_params?.endpoint_url || mergedSettings.endpoint_url || providerCfg.endpoint_url,
          api_key: mergedSettings.extra_params?.api_key || mergedSettings.api_key || providerCfg.api_key
        },
        options: { ...options, signal: ac.signal },
        route
      });

      // 7. Stream Response
      const result = await writeChatCompletionStream({
        stream,
        res,
        modelName: catSettings.model_name,
        isStreaming: options.stream,
        retrievalResult
      });

      recordTokenUsage({
        user,
        usage: result.usage,
        complexity: catSettings.complexity ?? 1.0,
        source: 'heavy path'
      });

      traceBus.emitTrace('ChatService', 'model.completed', {
        providerId: result.providerId,
        modelName: catSettings.model_name,
        latencyMs: Date.now() - startTimestamp
      });

    } catch (err) {
      if (err.message !== 'Client disconnected') {
        this._handleError(err, route.providerId, res);
      }
    } finally {
      clearTimeout(timeoutId);
      res.req.off('close', reqCloseHandler);
    }
  }

  _handleRefusal(res, retrievalResult) {
    const refusalMessage = "I don't have enough information in the provided context to answer this query.";
    const response = mapper.buildResponse(null, refusalMessage, { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
    return res.json({
      ...response,
      _retrieval: retrievalResult
    });
  }

  _handleError(err, providerId, res) {
    logger.error('Chat service failed', { providerId, message: err.message, code: err.code });
    const status = err.status || 502;
    const errorPayload = {
      error: { code: err.code || 'provider_error', message: err.message, details: err.details || null }
    };

    traceBus.emitTrace('ChatService', 'model.failed', { providerId, error: err.message, code: err.code });

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.status(status).json(errorPayload);
    }
  }
}

module.exports = new ChatService();
