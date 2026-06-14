import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../core/errors';
import providersConfig from '../../core/providers.config';
const router = Router();

router.get('/template/:providerId/:modelName', asyncHandler(async (req: Request, res: Response) => {
  const providerId = String(req.params.providerId);
  const modelName = String(req.params.modelName);
  const cfg = providersConfig[providerId];

  if (!cfg) return res.status(404).json({ error: 'Provider not found' });

  const template: Record<string, unknown> = {
    endpoint_url: cfg.endpoint_url || '',
    api_key: cfg.api_key || '',
    temperature: 0.7,
    max_tokens: 4096,
    ...cfg.extra_params,
  };

  if (cfg.models && cfg.models[modelName]) {
    Object.assign(template, cfg.models[modelName].extra_params || {});
  }

  return res.json(template);
}));

export = router;
