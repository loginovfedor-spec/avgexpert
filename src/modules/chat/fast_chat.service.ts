import modelGateway from './model.gateway';
import mapper from './chat_completion.mapper';
import policyRouter from './policyRouter';
import * as limits from './limit.service';
import { validateProviderUrl } from '../../core/utils';
import providersConfig from '../../core/providers.config';
import type { ChatMessage, StreamEvent } from '../../types/chat.types';

type FastChatUser = Record<string, unknown> & {
  username?: string;
};

type FastChatBody = Record<string, unknown> & {
  messages: ChatMessage[];
};

type CategorySettings = Record<string, unknown>;

class FastChatService {
  async handleFastCompletion({
    user,
    body,
    catSettings,
  }: {
    user: FastChatUser;
    body: FastChatBody;
    catSettings: CategorySettings;
  }): Promise<AsyncIterable<StreamEvent>> {
    const route = policyRouter.resolveRoute(catSettings);

    const { messages } = mapper.prepareMessages({
      messages: body.messages,
      user,
      categorySettings: catSettings,
    });

    const providerCfg = providersConfig[route.providerId] || {};
    const { options, mergedSettings } = mapper.mapOptions(body, catSettings, user, providerCfg);
    limits.validateInputLimit(messages, user, catSettings, providerCfg);

    const effectiveEndpointUrl = providerCfg.endpoint_url || null;
    const isLocalProvider = ['llamacpp', 'ollama', 'deterministic'].includes(providerCfg.adapter || '');
    if (effectiveEndpointUrl) {
      validateProviderUrl(effectiveEndpointUrl, isLocalProvider);
    }

    return modelGateway.handleChat({
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
      options,
      route: route as Parameters<typeof modelGateway.handleChat>[0]['route'],
    });
  }
}

export = new FastChatService();
