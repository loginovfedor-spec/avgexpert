/**
 * Provider: Google Gemini
 * Models: gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash
 * Uses native @google/generative-ai SDK
 * Converts Gemini streaming format → OpenAI SSE format for frontend compatibility
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const BaseProvider = require('../base.provider');

class GoogleProvider extends BaseProvider {
  constructor() {
    super({
      id: 'google',
      name: 'Google Gemini',
      defaultModel: 'gemini-2.5-flash',
      models: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-2.0-flash',
      ],
      capabilities: { stream: true, tools: true },
    });
  }

  /**
   * Convert OpenAI-format messages to Gemini format
   */
  _convertMessages(messages) {
    let systemInstruction = '';
    const history = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction += (systemInstruction ? '\n' : '') + msg.content;
      } else {
        history.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    return { systemInstruction, history };
  }

  async *handleChat(messages, config, options) {
    const ProviderEvents = require('./../providerEvents');
    const genAI = new GoogleGenerativeAI(config.api_key);

    const { systemInstruction, history } = this._convertMessages(messages);

    // Extract last user message (Gemini sendMessage needs it separately)
    const lastMsg = history.pop();
    const userText = lastMsg?.parts?.[0]?.text || '';

    const generationConfig = {};
    if (options.max_tokens) generationConfig.maxOutputTokens = options.max_tokens;
    if (config.temperature !== undefined) generationConfig.temperature = config.temperature;
    if (config.top_p !== undefined) generationConfig.topP = config.top_p;
    if (config.top_k !== undefined) generationConfig.topK = config.top_k;

    const modelName = config.model_name || config.defaultModel || this.defaultModel;
    const modelConfig = {
      model: modelName,
      generationConfig,
    };
    if (systemInstruction) modelConfig.systemInstruction = systemInstruction;

    // Merge extra_params into model config
    if (config.extra_params && typeof config.extra_params === 'object') {
      if (config.extra_params.generationConfig) {
        Object.assign(generationConfig, config.extra_params.generationConfig);
      }
      // Tools, safety settings, etc.
      const { generationConfig: _, ...rest } = config.extra_params;
      Object.assign(modelConfig, rest);
    }

    try {
      const model = genAI.getGenerativeModel(modelConfig);

      if (options.stream) {
        const chat = model.startChat({ history });
        const result = await chat.sendMessageStream(userText);
        
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            yield ProviderEvents.delta(text);
          }
        }
        const response = await result.response;
        const usageMetadata = response.usageMetadata || {};
        const usage = {
          prompt_tokens: usageMetadata.promptTokenCount || 0,
          completion_tokens: usageMetadata.candidatesTokenCount || 0,
          total_tokens: usageMetadata.totalTokenCount || 0,
        };
        yield ProviderEvents.done('stop', usage);
      } else {
        const chat = model.startChat({ history });
        const result = await chat.sendMessage(userText);
        const text = result.response.text();

        if (text) {
          yield ProviderEvents.delta(text);
        }
        const usageMetadata = result.response.usageMetadata || {};
        const usage = {
          prompt_tokens: usageMetadata.promptTokenCount || 0,
          completion_tokens: usageMetadata.candidatesTokenCount || 0,
          total_tokens: usageMetadata.totalTokenCount || 0,
        };
        yield ProviderEvents.done('stop', usage);
      }
    } catch (err) {
      const { ProviderError } = require('./../providerErrors');
      throw new ProviderError(err.message, err.status || 502);
    }
  }

  async checkHealth(config) {
    if (!config.api_key) return false;
    const genAI = new GoogleGenerativeAI(config.api_key);
    try {
      const modelName = config.model_name || config.defaultModel || this.defaultModel;
      const model = genAI.getGenerativeModel({ model: modelName });
      // Simple call to see if API key is valid
      await model.getMetadata();
      return true;
    } catch (e) {
      return false;
    }
  }
}

module.exports = new GoogleProvider();
