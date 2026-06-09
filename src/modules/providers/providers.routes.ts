import { Request, Response, Router } from 'express';
// @ts-ignore
import { authenticate } from '../auth/auth.middleware';
import providerFactory = require('./provider.factory');
// @ts-ignore
import categoryRepository = require('../admin/category.repository');

const router = Router();
const { listProviders, getProvider } = providerFactory;

type ProviderRequest = Request & {
  user?: {
    category?: string;
  };
};

type ProviderConfigMap = Record<string, unknown> & {
  endpoint_url?: string | null;
  api_key?: string | null;
  extra_params?: Record<string, unknown>;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

router.get('/', authenticate, (req: Request, res: Response) => {
  res.json(listProviders());
});

router.get('/health', authenticate, async (req: ProviderRequest, res: Response) => {
  try {
    const user = req.user;
    const categoryName = String(req.query.category || user?.category || '');
    const catSettings = await categoryRepository.findByName(categoryName) as ProviderConfigMap | null || {};
    const providerId = String(catSettings.provider || 'llamacpp');
    const provider = getProvider(providerId);

    const providersConfig = require('../../core/providers.config');
    const providerCfg = providersConfig[providerId] as ProviderConfigMap | undefined || {};
    const effectiveEndpointUrl = providerCfg.endpoint_url || null;
  const effectiveApiKey = providerCfg.api_key || null;

  if (!provider) {
    return res.status(200).json({ status: 'offline', error: 'Provider not found', provider: providerId });
  }

    const isOnline = await provider.checkHealth?.({
      ...providerCfg,
      ...catSettings,
      extra_params: {
        ...(providerCfg.extra_params || {}),
        ...(catSettings.extra_params || {})
      },
      endpoint_url: catSettings.extra_params?.endpoint_url || catSettings.endpoint_url || effectiveEndpointUrl,
      api_key: catSettings.extra_params?.api_key || catSettings.api_key || effectiveApiKey
    }) ?? false;
    res.json({ 
      status: isOnline ? 'online' : 'offline',
      provider: providerId
    });
  } catch (err: unknown) {
    res.json({ status: 'offline', error: errorMessage(err) });
  }
});

router.get('/:id/models', authenticate, async (req: Request, res: Response) => {
  try {
    const providerId = String(req.params.id);
    const provider = getProvider(providerId);

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const providersConfig = require('../../core/providers.config');
    const providerCfg = providersConfig[providerId] || {};
    
    const configToPass = {
      ...providerCfg,
      endpoint_url: providerCfg.endpoint_url || null,
      api_key: providerCfg.api_key || null
    };

    const models = await provider.getModels?.(configToPass) ?? [];
    res.json({ provider: providerId, models });
  } catch (err: unknown) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.get('/:id/health', authenticate, async (req: Request, res: Response) => {
  try {
    const providerId = String(req.params.id);
    const provider = getProvider(providerId);

    if (!provider) {
      return res.status(404).json({ status: 'offline', error: 'Provider not found' });
    }

    const providersConfig = require('../../core/providers.config');
    const providerCfg = providersConfig[providerId] || {};

    const configToPass = {
      ...providerCfg,
      endpoint_url: providerCfg.endpoint_url || null,
      api_key: providerCfg.api_key || null
    };

    const isOnline = await provider.checkHealth?.(configToPass) ?? false;
    res.json({ 
      status: isOnline ? 'online' : 'offline',
      provider: providerId
    });
  } catch (err: unknown) {
    res.json({ status: 'offline', error: errorMessage(err) });
  }
});

export = router;
