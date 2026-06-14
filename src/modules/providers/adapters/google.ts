import { GoogleGenerativeAI, type RequestOptions } from '@google/generative-ai';
import BaseProvider from '../base.provider';
import ProviderEvents from '../providerEvents';
import { ProviderError } from '../providerErrors';
import { ProviderUtils } from './provider_utils';
import { ChatMessage, StreamEvent } from '../../../types/chat.types';
import costCalculator from '../../cost/cost_calculator.service';

type GoogleConfig = Record<string, unknown> & {
  api_key?: string;
  model_name?: string;
  defaultModel?: string;
  endpoint_url?: string;
  GEMINI_API_VERSION?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  extra_params?: Record<string, unknown> & {
    generationConfig?: Record<string, unknown>;
  };
};

type GoogleOptions = Record<string, unknown> & {
  stream?: boolean;
  max_tokens?: number;
};

type GeminiHistoryItem = {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
};

type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
};

function buildUsageFromMetadata(usageMetadata: GeminiUsageMetadata | undefined) {
  return ProviderUtils.normalizeUsage({
    prompt_tokens: usageMetadata?.promptTokenCount || 0,
    completion_tokens: usageMetadata?.candidatesTokenCount || 0,
    total_tokens: usageMetadata?.totalTokenCount || 0,
    cachedContentTokenCount: usageMetadata?.cachedContentTokenCount,
  });
}

type ProviderErrorSource = Error & {
  status?: number;
  message: string;
};

function resolveGoogleRequestOptions(config: GoogleConfig): RequestOptions | undefined {
  const rawEndpoint = String(config.endpoint_url || '').trim();
  if (!rawEndpoint) return undefined;

  let baseUrl = rawEndpoint.replace(/\/+$/, '');
  let apiVersion = String(config.GEMINI_API_VERSION || 'v1beta').trim() || 'v1beta';
  const versionMatch = baseUrl.match(/\/(v1|v1beta)$/);
  if (versionMatch) {
    apiVersion = versionMatch[1];
    baseUrl = baseUrl.slice(0, -versionMatch[0].length);
  }

  return { baseUrl, apiVersion };
}

class GoogleProvider extends BaseProvider {
  constructor() {
    super({
      id: 'google',
      name: 'Google Gemini',
      defaultModel: 'gemini-3.5-flash',
      models: [
        'gemini-3.1-pro',
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
      ],
      capabilities: { stream: true, tools: true },
    });
  }

  _convertMessages(messages: ChatMessage[]) {
    let systemInstruction = '';
    const history: GeminiHistoryItem[] = [];

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

  async *handleChat(messages: ChatMessage[], config: GoogleConfig, options: GoogleOptions): AsyncIterable<StreamEvent> {
    const genAI = new GoogleGenerativeAI(config.api_key || '');
    const requestOptions = resolveGoogleRequestOptions(config);

    const { systemInstruction, history } = this._convertMessages(messages);

    const lastMsg = history.pop();
    const userText = lastMsg?.parts?.[0]?.text || '';

    const generationConfig: Record<string, unknown> = {};
    if (options.max_tokens) generationConfig.maxOutputTokens = options.max_tokens;
    if (config.temperature !== undefined) generationConfig.temperature = config.temperature;
    if (config.top_p !== undefined) generationConfig.topP = config.top_p;
    if (config.top_k !== undefined) generationConfig.topK = config.top_k;

    const modelName = config.model_name || config.defaultModel || this.defaultModel;
    const modelConfig = {
      model: modelName,
      generationConfig,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(config.extra_params && typeof config.extra_params === 'object'
        ? (() => {
            if (config.extra_params.generationConfig) {
              Object.assign(generationConfig, config.extra_params.generationConfig);
            }
            const rest = { ...config.extra_params };
            delete rest.generationConfig;
            return rest;
          })()
        : {}),
    };

    try {
      const model = genAI.getGenerativeModel(modelConfig, requestOptions);

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
        const usage = buildUsageFromMetadata(response.usageMetadata as GeminiUsageMetadata | undefined);
        yield ProviderEvents.done(
          'stop',
          costCalculator.enrichUsage(usage, {
            providerId: this.id,
            modelName,
            config
          })
        );
      } else {
        const chat = model.startChat({ history });
        const result = await chat.sendMessage(userText);
        const text = result.response.text();

        if (text) {
          yield ProviderEvents.delta(text);
        }
        const usage = buildUsageFromMetadata(result.response.usageMetadata as GeminiUsageMetadata | undefined);
        yield ProviderEvents.done(
          'stop',
          costCalculator.enrichUsage(usage, {
            providerId: this.id,
            modelName,
            config
          })
        );
      }
    } catch (err: unknown) {
      const source = err instanceof Error ? err as ProviderErrorSource : new Error(String(err)) as ProviderErrorSource;
      throw new ProviderError(source.message, source.status || 502);
    }
  }

  async checkHealth(config: GoogleConfig): Promise<boolean> {
    if (!config.api_key) return false;
    const genAI = new GoogleGenerativeAI(config.api_key);
    try {
      const modelName = config.model_name || config.defaultModel || this.defaultModel;
      const model = genAI.getGenerativeModel(
        { model: modelName },
        resolveGoogleRequestOptions(config)
      );
      await (model as { getMetadata?: () => Promise<unknown> }).getMetadata?.();
      return true;
    } catch {
      return false;
    }
  }
}

export = new GoogleProvider();
