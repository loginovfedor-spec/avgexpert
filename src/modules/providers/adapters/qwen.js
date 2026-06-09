/**
 * Provider: Qwen (Alibaba)
 * Native implementation. Supports RAG.
 */
const BaseProvider = require('../base.provider');
const { ProviderUtils } = require('./provider_utils');

class QwenProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      id: config.id || 'qwen',
      name: config.name || 'Qwen',
      models: config.models || ['qwen-max', 'qwen-plus', 'qwen-turbo'],
      defaultModel: config.defaultModel || 'qwen-max',
      capabilities: Object.assign(
        { stream: true, tools: true, retrieval: true },
        config.capabilities
      ),
    });
    this.defaultBaseUrl = config.defaultBaseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  }

  async *handleChat(messages, config, options = {}) {
    const ProviderEvents = require('../providerEvents');
    
    const params = {
      model: config.model_name || config.defaultModel || this.defaultModel,
      messages: messages,
      stream: !!options.stream,
    };

    if (config.extra_params) Object.assign(params, config.extra_params);

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.api_key}`
    };
    const url = `${config.endpoint_url || this.defaultBaseUrl}/chat/completions`;

    try {
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(params) });

      if (!response.ok) throw new Error(`Qwen API Error: ${response.statusText}`);

      if (params.stream) {
         const reader = response.body.getReader();
         const decoder = new TextDecoder("utf-8");
         let buffer = '';
         let finalUsage = null;

         while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); 

            for (let line of lines) {
               line = line.trim();
               if (!line || line === 'data: [DONE]') continue;
               if (line.startsWith('data: ')) {
                 try {
                   const data = JSON.parse(line.slice(6));
                   if (data.usage) finalUsage = data.usage;
                   const choice = data.choices?.[0];
                   if (!choice) continue;
                   if (choice.delta?.content) yield ProviderEvents.delta(choice.delta.content);
                   if (choice.delta?.tool_calls) yield ProviderEvents.toolCall(choice.delta.tool_calls);
                 } catch (e) {}
               }
            }
         }
         yield ProviderEvents.done('stop', ProviderUtils.normalizeUsage(finalUsage)); 
      } else {
         const data = await response.json();
         const choice = data.choices[0];
         if (choice.message?.content) yield ProviderEvents.delta(choice.message.content);
         if (choice.message?.tool_calls) yield ProviderEvents.toolCall(choice.message.tool_calls);
         yield ProviderEvents.done(choice.finish_reason || 'stop', ProviderUtils.normalizeUsage(data.usage));
      }
    } catch (err) {
      const { ProviderError } = require('../providerErrors');
      throw new ProviderError(err.message, err.status || 502);
    }
  }

  async checkHealth(config = {}) {
    return true; // Simplified for Qwen dashscope
  }
}

module.exports = new QwenProvider();
module.exports.QwenProvider = QwenProvider;
