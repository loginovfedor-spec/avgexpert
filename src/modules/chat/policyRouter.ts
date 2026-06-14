import providerFactory from '../providers/provider.factory';
const { getProvider } = providerFactory;

type CategorySettings = Record<string, unknown> & {
  provider?: string;
  routing_mode?: string;
  fallback_provider?: string | null;
  endpoint_url?: string | null;
};

type ProviderInstance = NonNullable<ReturnType<typeof getProvider>>;

type RouteResolution = {
  providerId: string;
  provider: ProviderInstance;
  mode: string;
  fallbackProviderId: string | null;
  endpointUrl: string | null;
};

class PolicyRouter {
  resolveRoute(categorySettings?: CategorySettings | null): RouteResolution {
    const settings = categorySettings ?? {};

    const providerId = settings.provider || 'llamacpp';
    const mode = settings.routing_mode || 'direct';
    const fallbackProviderId = settings.fallback_provider ?? null;

    const provider = getProvider(providerId);

    if (!provider) {
      const err = new Error(`Провайдер "${providerId}" не найден`) as Error & { status: number };
      err.status = 502;
      throw err;
    }

    return {
      providerId,
      provider,
      mode,
      fallbackProviderId,
      endpointUrl: settings.endpoint_url ?? null,
    };
  }
}

export = new PolicyRouter();
