
const { sanitizePromptText } = require('../../core/utils');
const { ALLOWED_EXTRA_PARAMS } = require('../../core/config');
const limits = require('./limit.service');
const { stripNativeRag } = require('../rag/rag.orchestrator');

const ADEQUACY_COVENANT = `
### ADEQUACY COVENANT
1. Do not exceed domain boundaries (Medical/Legal/Financial/Psychological).
2. Do not mix logical levels (Fact vs Value).
3. Do not assume hidden authority over the user's inner state.
4. If retrieval fails or is low-quality, explicitly state your limitations.
`;

class ChatCompletionMapper {
  /**
   * Prepares messages for the LLM by adding system prompts and covenants.
   */
  prepareMessages({ messages, user, categorySettings }) {
    let injectionDetected = false;
    let processedMessages = messages.map(m => {
      if (m.role === 'user' && typeof m.content === 'string') {
        const sanitized = sanitizePromptText(m.content);
        if (sanitized !== m.content) injectionDetected = true;
        return { ...m, content: sanitized };
      }
      return m;
    });

    // Security: non-admins cannot send 'system' role messages.
    if (!user.is_admin) {
      processedMessages = processedMessages.filter(m => m.role !== 'system');
    }

    // Filter empty content
    processedMessages = processedMessages.filter(m => 
      (m.content && m.content.trim().length > 0) || 
      (m.tool_calls && m.tool_calls.length > 0) || 
      m.role === 'assistant'
    );

    // Add Adequacy Covenant
    const hasSystem = processedMessages.some(m => m.role === 'system');
    if (hasSystem) {
      processedMessages = processedMessages.map(m => 
        m.role === 'system' ? { ...m, content: m.content + ADEQUACY_COVENANT } : m
      );
    } else {
      processedMessages = [{ role: 'system', content: ADEQUACY_COVENANT }, ...processedMessages];
    }

    // Prepend Category System Prompt
    if (categorySettings.system_prompt?.trim()) {
      if (processedMessages[0].role === 'system') {
        processedMessages[0].content = `${categorySettings.system_prompt}\n\n${processedMessages[0].content}`;
      } else {
        processedMessages = [{ role: 'system', content: categorySettings.system_prompt }, ...processedMessages];
      }
    }

    return { messages: processedMessages, injectionDetected };
  }

  /**
   * Maps request body to internal execution options.
   */
  mapOptions(body, categorySettings, user, providerCfg = {}) {
    const options = {
      stream: !!body.stream,
      max_tokens: limits.getOutputLimit(user, categorySettings, providerCfg),
    };

    const mergedSettings = { 
      ...categorySettings,
      extra_params: stripNativeRag({ ...(categorySettings.extra_params || {}) }),
    };

    if (body.temperature !== undefined) mergedSettings.temperature = body.temperature;
    if (body.top_p !== undefined) mergedSettings.top_p = body.top_p;
    if (body.top_k !== undefined) mergedSettings.top_k = body.top_k;
    if (body.min_p !== undefined) mergedSettings.min_p = body.min_p;
    if (body.repeat_penalty !== undefined) mergedSettings.repeat_penalty = body.repeat_penalty;
    if (body.n_predict !== undefined) mergedSettings.n_predict = body.n_predict;
    
    if (body.extra_params) {
      const allowedKeys = user.is_admin ? ALLOWED_EXTRA_PARAMS.ADMIN : ALLOWED_EXTRA_PARAMS.USER;
      const safeParams = this._pickAllowedExtraParams(body.extra_params, allowedKeys);
      mergedSettings.extra_params = { ...mergedSettings.extra_params, ...safeParams };
    }

    return { options, mergedSettings };
  }

  /**
   * Builds an OpenAI-compatible chunk for streaming.
   */
  buildChunk(model, text, finishReason = null, toolCall = null) {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: model || 'default',
      choices: [{
        index: 0,
        delta: toolCall ? { tool_calls: [toolCall] } : (text !== null ? { content: text } : {}),
        finish_reason: finishReason
      }]
    };
  }

  /**
   * Builds an OpenAI-compatible full response.
   */
  buildResponse(model, text, usage) {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model || 'default',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop'
      }],
      usage: usage
    };
  }

  _pickAllowedExtraParams(input, allowed) {
    const out = {};
    if (!input || typeof input !== 'object') return out;
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        out[key] = input[key];
      }
    }
    return out;
  }
}

module.exports = new ChatCompletionMapper();
