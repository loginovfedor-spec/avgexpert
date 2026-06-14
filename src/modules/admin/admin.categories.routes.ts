import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/errors';
import categoryRepository from './category.repository';
import userRepository from '../auth/user.repository';
import providersConfig from '../../core/providers.config';
import * as limits from '../chat/limit.service';
import crypto from '../../core/crypto';
import logger from '../../core/logger';
import { auditLog, type AdminRequest } from './admin.shared';

import { mergeFields, validateProviderUrl } from '../../core/utils';
import { TEST_TIMEOUT } from '../../core/config';
import providerFactory from '../providers/provider.factory';
import { RedactionService } from '../policy/redaction.service';

const { getProvider } = providerFactory;

const router = Router();
const adminCategoriesLogger = logger.scoped('Admin');

const CATEGORY_FIELDS = [
  'provider', 'model_name', 'endpoint_url', 'api_key', 'yandex_folder_id',
  'temperature', 'top_p', 'top_k', 'min_p', 'repeat_penalty',
  'input_context_default', 'input_context_max', 'max_tokens', 'system_prompt', 'routing_mode', 'fallback_provider',
  'extra_params', 'debug_mode', 'complexity', 'suggested_questions', 'sort_index',
  'rag_allowed', 'retrieval_tier',
];

const categorySchema = z.object({
  provider: z.string().max(64).optional().nullable(),
  model_name: z.string().max(128).optional().nullable(),
  endpoint_url: z.string().max(512).optional().nullable(),
  api_key: z.string().max(512).optional().nullable(),
  yandex_folder_id: z.string().max(512).optional().nullable(),
  temperature: z.number().min(0).max(2).optional().nullable(),
  top_p: z.number().min(0).max(1).optional().nullable(),
  top_k: z.number().int().min(0).max(100).optional().nullable(),
  min_p: z.number().min(0).max(1).optional().nullable(),
  repeat_penalty: z.number().min(0).max(2).optional().nullable(),
  input_context_default: z.number().int().min(0).optional().nullable(),
  input_context_max: z.number().int().min(0).optional().nullable(),
  max_tokens: z.number().int().positive().optional().nullable(),
  system_prompt: z.string().max(16000).optional().nullable(),
  routing_mode: z.string().max(32).optional().nullable(),
  fallback_provider: z.string().max(64).optional().nullable(),
  extra_params: z.record(z.string(), z.unknown()).optional().nullable(),
  debug_mode: z.boolean().optional().nullable(),
  complexity: z.number().min(0.01).max(99.99).optional().nullable(),
  suggested_questions: z.string().max(16000).optional().nullable(),
  sort_index: z.number().int().optional().nullable(),
  rag_allowed: z.boolean().optional().nullable(),
  retrieval_tier: z.enum(['consultant', 'expert', 'sage']).optional().nullable(),
});

function validateCategoryName(catName: string): string | null {
  if (!catName || catName.length < 2 || catName.length > 64 || catName.includes('..') || catName.includes('/')) {
    return 'Invalid category_name';
  }
  return null;
}

function validateTokenLimitStep(fieldName: string, value: unknown): string | null {
  if (value == null) return null;
  const tokenLimit = value as number;
  if (tokenLimit < limits.TOKEN_LIMIT_STEP) {
    return `${fieldName} должен быть не меньше ${limits.TOKEN_LIMIT_STEP}`;
  }
  if (tokenLimit % limits.TOKEN_LIMIT_STEP !== 0) {
    return `${fieldName} должен быть кратен ${limits.TOKEN_LIMIT_STEP}`;
  }
  return null;
}

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const categories = await categoryRepository.listAll();
  const safeCats: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(categories)) {
    safeCats[k] = { ...v };
    if (safeCats[k].api_key) {
      safeCats[k].api_key = crypto.maskKey(safeCats[k].api_key as string);
    }
  }
  res.json(safeCats);
}));

router.get('/:category_name', asyncHandler(async (req: Request, res: Response) => {
  const catName = String(req.params.category_name);
  const category = await categoryRepository.findByName(catName);
  if (!category) return res.status(404).json({ detail: 'Категория не найдена' });

  if (category.api_key) {
    category.api_key = crypto.maskKey(category.api_key);
  }
  return res.json(category);
}));

router.post('/:category_name', asyncHandler(async (req: Request, res: Response) => {
  const catName = String(req.params.category_name);
  const nameError = validateCategoryName(catName);
  if (nameError) return res.status(400).json({ detail: nameError });

  const parseResult = categorySchema.safeParse(req.body);
  if (!parseResult.success) {
    adminCategoriesLogger.error('Category validation failed', { errors: RedactionService.redact(parseResult.error.format()) });
    return res.status(400).json({ detail: 'Некорректный формат данных категории', errors: parseResult.error.issues });
  }

  const category = (await categoryRepository.findByName(catName) || {}) as Record<string, unknown>;
  mergeFields(category, parseResult.data as Record<string, unknown>, CATEGORY_FIELDS);

  const providerCfg = providersConfig[(category.provider as string) || 'llamacpp'] || {};
  const caps = limits.getAdapterCaps(providerCfg);

  for (const fieldName of ['input_context_default', 'input_context_max', 'max_tokens']) {
    const error = validateTokenLimitStep(fieldName, category[fieldName]);
    if (error) return res.status(400).json({ detail: error });
  }

  if (category.input_context_default != null && category.input_context_max != null
    && (category.input_context_default as number) > (category.input_context_max as number)) {
    return res.status(400).json({ detail: 'input_context_default не может быть больше input_context_max' });
  }
  if (category.input_context_max != null && (category.input_context_max as number) > caps.input) {
    return res.status(400).json({ detail: `input_context_max не может быть больше максимума адаптера (${caps.input})` });
  }
  if (category.max_tokens != null && (category.max_tokens as number) > caps.output) {
    return res.status(400).json({ detail: `max_tokens не может быть больше максимума адаптера (${caps.output})` });
  }

  await categoryRepository.save(catName, category);
  auditLog(req as AdminRequest, 'CATEGORY_UPDATE', { target_category: catName });
  return res.json({ status: 'success' });
}));

router.delete('/:category_name', asyncHandler(async (req: Request, res: Response) => {
  const catName = String(req.params.category_name);
  if (!catName || catName.includes('..') || catName.includes('/')) {
    return res.status(400).json({ detail: 'Invalid category_name' });
  }

  const existingCat = await categoryRepository.findByName(catName);
  if (!existingCat) {
    return res.status(404).json({ detail: 'Категория не найдена' });
  }

  const users = await userRepository.listAll();
  for (const u of Object.values(users)) {
    if (u.category === catName || (Array.isArray(u.allowed_categories) && u.allowed_categories.includes(catName))) {
      return res.status(400).json({ detail: 'Нельзя удалить категорию, к которой привязаны пользователи' });
    }
  }

  await categoryRepository.delete(catName);
  auditLog(req as AdminRequest, 'CATEGORY_DELETE', { target_category: catName });
  return res.json({ status: 'success' });
}));

router.post('/:category_name/test', asyncHandler(async (req: Request, res: Response) => {
  const catName = String(req.params.category_name);
  if (!catName || catName.includes('..') || catName.includes('/')) {
    return res.status(400).json({ detail: 'Invalid category_name' });
  }

  const savedCat = (await categoryRepository.findByName(catName) || {}) as Record<string, unknown>;
  const data = (req.body || {}) as Record<string, unknown>;

  const providerId = (data.provider as string) || (savedCat.provider as string) || 'llamacpp';
  const providerCfg = providersConfig[providerId] || {};

  let endpointUrl = String(data.endpoint_url || savedCat.endpoint_url || providerCfg.endpoint_url || 'http://127.0.0.1:8201').replace(/\/$/, '');
  const isLocalProvider = ['llamacpp', 'ollama'].includes(providerCfg.adapter || providerId);

  try {
    validateProviderUrl(endpointUrl, isLocalProvider);
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    return res.status(error.status || 400).json({ error: error.message });
  }

  const apiKey = (data.api_key as string) || (savedCat.api_key as string) || providerCfg.api_key || '';
  const provider = getProvider(providerId);
  if (!provider) return res.status(500).json({ error: 'Провайдер не найден' });

  const checkProvider = async (
    p: { checkHealth?: (config: Record<string, unknown>) => Promise<boolean> },
    config: Record<string, unknown>
  ) => {
    if (p.checkHealth) {
      return p.checkHealth(config);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT);
    const headers: Record<string, string> = {};
    if (config.api_key) headers.Authorization = `Bearer ${config.api_key}`;
    try {
      const r = await fetch(`${config.endpoint_url}/models`, { headers, signal: controller.signal });
      clearTimeout(timeout);
      return r.ok;
    } catch (_e) {
      clearTimeout(timeout);
      return false;
    }
  };

  const checkConfig = {
    ...providerCfg,
    ...savedCat,
    ...data,
    extra_params: {
      ...(providerCfg.extra_params || {}),
      ...((savedCat.extra_params as Record<string, unknown>) || {}),
      ...((data.extra_params as Record<string, unknown>) || {}),
    },
    endpoint_url: endpointUrl,
    api_key: apiKey,
  };

  const isDirectOk = await checkProvider(provider, checkConfig);
  if (isDirectOk) {
    return res.json({ status: 'success', message: 'Соединение установлено напрямую' });
  }

  return res.status(502).json({ error: 'Не удалось установить соединение с провайдером' });
}));

export = router;
