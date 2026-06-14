import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/errors';
import userRepository from '../auth/user.repository';
import categoryRepository from './category.repository';
import providersConfig from '../../core/providers.config';
import * as limits from '../chat/limit.service';
import logger from '../../core/logger';
import { auditLog, type AdminRequest } from './admin.shared';
import { ensureAppPgReady, getDatabasePort } from '../../core/pg';

import { assertSafeIdentifier } from '../../core/utils';
import { RedactionService } from '../policy/redaction.service';

const router = Router();
const adminUsersLogger = logger.scoped('Admin');

const passwordSchema = z.string()
  .min(8, 'Пароль должен содержать не менее 8 символов')
  .regex(/[A-Z]/, 'Пароль должен содержать хотя бы одну заглавную букву')
  .regex(/[a-z]/, 'Пароль должен содержать хотя бы одну строчную букву')
  .regex(/[0-9]/, 'Пароль должен содержать хотя бы одну цифру')
  .regex(/[\W_]/, 'Пароль должен содержать хотя бы один специальный символ')
  .max(128, 'Пароль должен содержать не более 128 символов');

const adminUserSchema = z.object({
  password: passwordSchema.optional().nullable().or(z.literal('')),
  email: z.string().trim().email('Некорректный формат email').max(254).optional().nullable().or(z.literal('')),
  category: z.string().max(64).optional().nullable().or(z.literal('')),
  expiration_date: z.string().optional().nullable().or(z.literal('')),
  n_ctx: z.any().optional().nullable(),
  system_prompt: z.string().max(16000).optional().nullable().or(z.literal('')),
  allowed_categories: z.array(z.string()).optional().nullable(),
  is_admin: z.boolean().optional().nullable(),
  is_blocked: z.boolean().optional().nullable(),
  balance_usd: z.number().min(-1000000).max(1000000).optional().nullable(),
  credit_limit_usd: z.number().min(0).max(1000000).optional().nullable(),
  input_context_limit: z.number().int().min(limits.USER_INPUT_MIN).optional().nullable(),
  output_generation_limit: z.number().int().min(limits.USER_OUTPUT_MIN).optional().nullable(),
});

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const users = await userRepository.listAll();
  const safe: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(users)) {
    safe[k] = { ...v, password_hash: undefined };
  }
  res.json(safe);
}));

router.post('/:username', asyncHandler(async (req: Request, res: Response) => {
  let username: string;
  try {
    username = assertSafeIdentifier(String(req.params.username), 'username');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid username';
    return res.status(400).json({ detail: message });
  }

  const parseResult = adminUserSchema.safeParse(req.body);
  if (!parseResult.success) {
    adminUsersLogger.error('User validation failed', { errors: RedactionService.redact(parseResult.error.format()) });
    return res.status(400).json({ detail: 'Некорректный формат данных пользователя', errors: parseResult.error.issues });
  }
  const data = parseResult.data;

  let user = await userRepository.findByUsername(username);

  const isNew = !user;
  if (!user) {
    if (!data.password) {
      return res.status(400).json({ detail: 'Пароль обязателен для нового пользователя' });
    }
    const templateUser = await userRepository.findByUsername('user_a');
    user = templateUser ? { ...templateUser } : {
      must_change_password: false,
      is_admin: false,
      is_blocked: false,
      allowed_categories: [],
      input_context_limit: null,
      output_generation_limit: null,
      rag_enabled: true,
    };
    user.password_hash = await userRepository.hashPassword(data.password);
    user.email = null;
  } else if (data.password) {
    user.password_hash = await userRepository.hashPassword(data.password);
  }

  if (data.email !== undefined) user.email = data.email;
  if (data.category !== undefined) user.category = data.category || null;
  if (data.expiration_date !== undefined) user.expiration_date = data.expiration_date;
  if (data.n_ctx !== undefined) user.n_ctx = data.n_ctx as number | null;
  if (data.system_prompt !== undefined) user.system_prompt = data.system_prompt;
  if (data.allowed_categories !== undefined) user.allowed_categories = data.allowed_categories || [];
  if (data.is_admin !== undefined) user.is_admin = !!data.is_admin;
  if (data.is_blocked !== undefined) user.is_blocked = !!data.is_blocked;
  const oldBalanceUsd = isNew ? 0 : (user.balance_usd != null ? Number(user.balance_usd) : 0);
  if (data.balance_usd !== undefined && data.balance_usd !== null) user.balance_usd = data.balance_usd;
  if (data.credit_limit_usd !== undefined && data.credit_limit_usd !== null) user.credit_limit_usd = data.credit_limit_usd;
  if (username === 'admin') {
    user.is_blocked = false;
    user.is_admin = true;
  }
  if (data.input_context_limit !== undefined) user.input_context_limit = data.input_context_limit;
  if (data.output_generation_limit !== undefined) user.output_generation_limit = data.output_generation_limit;

  const allowed = user.allowed_categories || [];
  if (allowed.length > 0 && (!user.category || !allowed.includes(user.category))) {
    user.category = allowed[0];
  }

  const userCategory = await categoryRepository.findByName(user.category || '');
  const providerCfg = userCategory ? providersConfig[userCategory.provider || 'llamacpp'] || {} : {};
  const limitCheck = limits.validateUserLimits({
    userValues: user,
    categorySettings: (userCategory || {}) as Record<string, unknown>,
    providerCfg,
  });
  if (!limitCheck.ok) {
    return res.status(400).json({ detail: limitCheck.errors.join('; ') });
  }

  if (user.email) {
    const existingEmailUser = await userRepository.findByEmail(user.email);
    if (existingEmailUser && existingEmailUser.username !== username) {
      return res.status(409).json({ detail: 'Пользователь с таким e-mail уже существует' });
    }
  }

  await userRepository.save(username, user);

  if (data.balance_usd !== undefined && data.balance_usd !== null) {
    const newBalanceUsd = user.balance_usd != null ? Number(user.balance_usd) : 0;
    const delta = newBalanceUsd - oldBalanceUsd;
    if (Math.abs(delta) > 1e-9) {
      await ensureAppPgReady();
      const db = getDatabasePort();
      const recordedAt = Date.now();
      await db.run(`
        INSERT INTO balance_transactions (
          username, amount, type, reference_type, reference_id,
          exchange_rate, amount_original, currency_original, recorded_at
        ) VALUES (
          @username, @amount, @type, 'admin_adjustment', @referenceId,
          1.0, @amount, 'USD', @recordedAt
        )
      `, {
        username,
        amount: delta,
        type: delta >= 0 ? 'deposit' : 'charge',
        referenceId: `admin:${(req as AdminRequest).user?.username || 'system'}`,
        recordedAt,
      });
    }
  }

  auditLog(req as AdminRequest, isNew ? 'USER_CREATE' : 'USER_UPDATE', { target_user: username });
  return res.json({ status: 'success' });
}));

router.delete('/:username', asyncHandler(async (req: Request, res: Response) => {
  let username: string;
  try {
    username = assertSafeIdentifier(String(req.params.username), 'username');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid username';
    return res.status(400).json({ detail: message });
  }

  if (username === 'admin') {
    return res.status(400).json({ detail: 'Нельзя удалить основного администратора' });
  }

  await userRepository.delete(username);
  auditLog(req as AdminRequest, 'USER_DELETE', { target_user: username });
  return res.json({ status: 'success' });
}));

async function getBalanceHistory(req: Request, res: Response) {
  let username: string;
  try {
    username = assertSafeIdentifier(String(req.params.username), 'username');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid username';
    return res.status(400).json({ detail: message });
  }
  const db = await userRepository._db();
  const history = await db.all(
    'SELECT * FROM balance_transactions WHERE username = @username ORDER BY recorded_at DESC LIMIT 100',
    { username }
  );
  return res.json(history);
}

router.get('/:username/balance-history', asyncHandler(getBalanceHistory));
/** @deprecated use /balance-history — legacy USD billing route name */
router.get('/:username/token-history', asyncHandler(getBalanceHistory));

export = router;
