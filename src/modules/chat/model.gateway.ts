import providerFactory from '../providers/provider.factory';
import fallbackPolicy from './fallbackPolicy';
import traceBus from '../observability/trace.bus';
import { ChatMessage, StreamEvent } from '../../types/chat.types';
import logger from '../../core/logger';
import ProviderEvents from '../providers/providerEvents';

const activeRequests = new Map<string, number>();
const MAX_CONCURRENT_PER_PROVIDER = 50;
const { getProvider } = providerFactory;
const gatewayLogger = logger.scoped('ModelGateway');

type ProviderInstance = {
  id?: string;
  name: string;
  capabilities?: {
    stream?: boolean;
    [key: string]: unknown;
  };
  handleChat(messages: ChatMessage[], settings: Record<string, unknown>, options: ModelGatewayOptions): AsyncIterable<StreamEvent>;
};

type ModelGatewayRoute = {
  providerId: string;
  provider: ProviderInstance;
  fallbackProviderId?: string;
};

type ModelGatewayOptions = {
  stream?: boolean;
  [key: string]: unknown;
};

type ModelGatewaySettings = Record<string, unknown> & {
  model_name?: string;
};

type ModelGatewayRequest = {
  messages: ChatMessage[];
  settings: ModelGatewaySettings;
  options: ModelGatewayOptions;
  route: ModelGatewayRoute;
};

type RetryableError = Error & {
  status?: number;
  isRetryable?: boolean;
  code?: string;
};

function toRetryableError(err: unknown): RetryableError {
  return err instanceof Error ? err as RetryableError : new Error(String(err)) as RetryableError;
}

function releaseProviderSlot(providerId: string) {
  const nextActive = Math.max(0, (activeRequests.get(providerId) || 1) - 1);
  if (nextActive === 0) {
    activeRequests.delete(providerId);
  } else {
    activeRequests.set(providerId, nextActive);
  }
}

class ModelGateway {
  async *handleChat({ messages, settings, options, route }: ModelGatewayRequest): AsyncIterable<StreamEvent> {
    const startTimeMs = Date.now();
    const providersToTry = [ { id: route.providerId, provider: route.provider } ];
    
    if (route.fallbackProviderId && route.fallbackProviderId !== route.providerId) {
      const fallbackProvider = getProvider(route.fallbackProviderId) as ProviderInstance | null;
      if (fallbackProvider) {
        providersToTry.push({ id: route.fallbackProviderId, provider: fallbackProvider });
      }
    }

    let lastError = null;

    for (const currentProviderObj of providersToTry) {
      const currentProviderId = currentProviderObj.id;
      const currentProvider = currentProviderObj.provider;
      const providerMergedSettings = { ...settings };

      const currentActive = activeRequests.get(currentProviderId) || 0;
      if (currentActive >= MAX_CONCURRENT_PER_PROVIDER) {
         const bpError = Object.assign(new Error(`Provider ${currentProviderId} is overloaded.`), {
           status: 429,
           isRetryable: true
         });
         
         if (fallbackPolicy.shouldFallback(bpError)) {
           gatewayLogger.warn('Provider overloaded, falling back', { providerId: currentProviderId });
           continue;
         } else {
           throw bpError;
         }
      }

      activeRequests.set(currentProviderId, currentActive + 1);

      try {
        let chatStream: AsyncIterable<StreamEvent>;
        
        if (options.stream && currentProvider.capabilities && !currentProvider.capabilities.stream) {
          const fallbackOptions = { ...options, stream: false };
          const tempStream = currentProvider.handleChat(messages, providerMergedSettings, fallbackOptions);
          
          let fullText = '';
          let finalUsage = null;
          for await (const event of tempStream) {
            if (event.type === 'error') throw event;
            if (event.type === 'delta') fullText += event.text;
            if (event.type === 'done') finalUsage = event.usage;
          }
          chatStream = this._createEmulatedAsyncIterable(fullText, finalUsage);
        } else {
          chatStream = currentProvider.handleChat(messages, providerMergedSettings, options);
        }

        const iterator = chatStream[Symbol.asyncIterator]();
        const firstResult = await iterator.next();

        if (!firstResult.done && firstResult.value && firstResult.value.type === 'error') {
          throw firstResult.value;
        }

        yield { 
          type: 'provider_selected', 
          providerId: currentProviderId, 
          providerName: currentProvider.name,
          model: settings.model_name
        };

        if (!firstResult.done) yield firstResult.value;
        for await (const item of { [Symbol.asyncIterator]() { return iterator; } }) {
          yield item;
        }

        traceBus.emitTrace('ModelGateway', 'model.completed', {
           providerId: currentProviderId,
           model: settings.model_name,
           latencyMs: Date.now() - startTimeMs
        });

        releaseProviderSlot(currentProviderId);
        return; 

      } catch (err: unknown) {
        const error = toRetryableError(err);
        releaseProviderSlot(currentProviderId);
        
        traceBus.emitTrace('ModelGateway', 'model.failed', { 
          providerId: currentProviderId, 
          model: settings.model_name,
          error: error.message,
          latencyMs: Date.now() - startTimeMs
        });

        if (error.message === 'Client disconnected') throw error;
        
        lastError = error;

        if (fallbackPolicy.shouldFallback(error)) {
          gatewayLogger.warn('Provider failed, falling back', { providerId: currentProviderId, message: error.message });
          continue; 
        } else {
          throw error; 
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  async *_createEmulatedAsyncIterable(text: string, usage: StreamEvent['usage'] | null): AsyncIterable<StreamEvent> {
    const chunkSize = 160;
    let i = 0;
    while (i < text.length) {
      const content = text.slice(i, i + chunkSize);
      i += chunkSize;
      yield ProviderEvents.delta(content);
    }
    yield ProviderEvents.done('stop', usage);
  }
}

export = new ModelGateway();
