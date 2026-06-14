import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import userRepository from './user.repository';
import { authenticate } from './auth.middleware';
import { asyncHandler } from '../../core/errors';
import providersConfig from '../../core/providers.config';
import * as limits from '../chat/limit.service';
import categoryRepository from '../admin/category.repository';

type CategoryEntry = Record<string, unknown> & {
  name?: string;
  suggested_questions?: string;
  sort_index?: number;
  input_context_default?: number;
  input_context_max?: number;
  max_tokens?: number | null;
  complexity?: number;
  rag_allowed?: boolean | number;
  provider?: string | null;
};

const router = Router();

type SafeCategory = {
  name: unknown;
  suggested_questions: string;
  sort_index: number;
  input_context_default: number;
  input_context_max: number;
  max_tokens: number;
  complexity: number;
  rag_allowed: boolean;
};

type AuthedRequest = Request & {
  user: {
    username: string;
    allowed_categories?: string[];
    category?: string;
    password_hash?: string;
    [key: string]: unknown;
  };
};

type DailyOperation = {
  date: number;
  title: string;
  spent: number;
  received: number;
  balance: number;
};

type TokenEffect = {
  delta: number;
  consumed: number;
  received: number;
  date: number;
};

function toSafeCategories(
  categories: Record<string, CategoryEntry>,
  allowed: string[] = [],
  options: { allowAllWhenEmpty?: boolean } = {}
): Record<string, SafeCategory> {
  const allowAllWhenEmpty = options.allowAllWhenEmpty !== false;
  const safeCats: Record<string, SafeCategory> = {};
  for (const [k, v] of Object.entries(categories)) {
    if ((allowAllWhenEmpty && allowed.length === 0) || allowed.includes(k)) {
      safeCats[k] = {
        name: v.name,
        suggested_questions: v.suggested_questions || '',
        sort_index: v.sort_index != null ? v.sort_index : 0,
        input_context_default: v.input_context_default != null ? v.input_context_default : 1000000,
        input_context_max: v.input_context_max != null ? v.input_context_max : 1000000,
        max_tokens: v.max_tokens != null ? v.max_tokens : 128000,
        complexity: v.complexity != null ? parseFloat(String(v.complexity)) : 1.0,
        rag_allowed: v.rag_allowed !== false && v.rag_allowed !== 0,
      };
    }
  }
  return safeCats;
}

async function getGuestAllowedCategories(): Promise<string[]> {
  const guestTemplate = await userRepository.findByUsername('user_a');
  if (!guestTemplate) return [];
  const allowed = guestTemplate.allowed_categories || [];
  if (allowed.length > 0) return allowed;
  return guestTemplate.category ? [guestTemplate.category] : [];
}

router.get('/public/categories', asyncHandler(async (_req: Request, res: Response) => {
  const categories = await categoryRepository.listAll();
  const allowed = await getGuestAllowedCategories();
  res.json(toSafeCategories(categories, allowed, { allowAllWhenEmpty: false }));
}));

router.get('/me', authenticate, (req: Request, res: Response) => {
  const u = { ...(req as AuthedRequest).user };
  delete u.password_hash;
  res.json(u);
});

function tokensToCredits(tokens: number): number {
  return Math.round((Number(tokens) || 0) / 1000);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BALANCE_DISPLAY_DAYS = 10;
const BALANCE_EXPORT_DAYS = 90;

function startOfLocalDay(ts: number): number {
  const d = new Date(Number(ts) || Date.now());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatCsvDate(ts: number): string {
  const d = new Date(Number(ts) || Date.now());
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const CSV_DELIMITER = ';';

function escapeCsvCell(value: unknown): string {
  const s = String(value ?? '');
  if (/[";\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function operationsToCsv(operations: DailyOperation[]): string {
  const header = ['Дата', 'Операция', 'Пополнение', 'Использовано', 'Баланс'];
  const lines = [header.map(escapeCsvCell).join(CSV_DELIMITER)];
  for (const op of operations) {
    lines.push([
      formatCsvDate(op.date),
      op.title,
      op.received > 0 ? op.received : '',
      op.spent > 0 ? op.spent : '',
      op.balance,
    ].map(escapeCsvCell).join(CSV_DELIMITER));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

async function buildDailyOperations(username: string, currentBalanceUsd: number): Promise<DailyOperation[]> {
  const db = await userRepository._db();
  const rows = await db.all(
    'SELECT * FROM balance_transactions WHERE username = @username ORDER BY recorded_at ASC, id ASC',
    { username }
  ) as Array<{ amount: number | string; type: string; recorded_at: number | string }>;

  const effects = rows.map(row => {
    const amt = parseFloat(String(row.amount)) || 0;
    const isDeposit = row.type === 'deposit';
    return {
      delta: amt,
      consumed: isDeposit ? 0 : Math.abs(amt),
      received: isDeposit ? Math.abs(amt) : 0,
      date: Number(row.recorded_at)
    };
  });

  const knownDelta = effects.reduce((sum, e) => sum + e.delta, 0);
  let runningBalance = currentBalanceUsd - knownDelta;

  const dayMap = new Map<string, {
    date: number;
    startBalance: number;
    consumed: number;
    received: number;
  }>();

  for (const e of effects) {
    const d = new Date(e.date);
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let entry = dayMap.get(dayKey);
    if (!entry) {
      entry = { date: e.date, startBalance: runningBalance, consumed: 0, received: 0 };
      dayMap.set(dayKey, entry);
    }
    runningBalance += e.delta;
    entry.date = e.date;
    entry.consumed += e.consumed;
    entry.received += e.received;
  }

  const operations: DailyOperation[] = [];
  for (const entry of dayMap.values()) {
    if (entry.consumed === 0 && entry.received === 0) continue;

    let title: string;
    if (entry.consumed > 0 && entry.received > 0) title = 'Расход и пополнение';
    else if (entry.consumed > 0) title = 'Расход за день';
    else title = 'Пополнение за день';

    const balance = Math.max(0, entry.startBalance + entry.received - entry.consumed);

    operations.push({
      date: entry.date,
      title,
      spent: Number(entry.consumed.toFixed(4)),
      received: Number(entry.received.toFixed(4)),
      balance: Number(balance.toFixed(4)),
    });
  }

  operations.reverse();
  return operations;
}

function filterOperationsSinceDays(operations: DailyOperation[], days: number): DailyOperation[] {
  const cutoff = startOfLocalDay(Date.now() - (days - 1) * MS_PER_DAY);
  return operations.filter((op) => startOfLocalDay(op.date) >= cutoff);
}

router.get('/me/balance', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const username = (req as AuthedRequest).user.username;
  const user = await userRepository.findByUsername(username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.set('Cache-Control', 'no-store');

  const balanceUsd = user.balance_usd ?? 0;
  const allOperations = await buildDailyOperations(username, balanceUsd);
  const operations = filterOperationsSinceDays(allOperations, BALANCE_DISPLAY_DAYS);

  return res.json({
    balance: balanceUsd,
    operations,
  });
}));

router.get('/me/balance/export', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const username = (req as AuthedRequest).user.username;
  const user = await userRepository.findByUsername(username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const balanceUsd = user.balance_usd ?? 0;
  const allOperations = await buildDailyOperations(username, balanceUsd);
  const operations = filterOperationsSinceDays(allOperations, BALANCE_EXPORT_DAYS);
  const csv = operationsToCsv(operations);
  const filename = `balance-history-${formatCsvDate(Date.now())}.csv`;

  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  return res.send(csv);
}));

const userPatchSchema = z.object({
  email: z.string().email().max(254).optional().or(z.literal('')),
  password: z.string().min(8).max(128).optional(),
  category: z.string().max(64).optional(),
  input_context_credits: z.number().int().min(0).max(limits.USER_INPUT_MAX).optional().nullable(),
  output_generation_credits: z.number().int().min(0).max(limits.USER_OUTPUT_MAX).optional().nullable(),
  rag_enabled: z.boolean().optional(),
}).strict();

router.patch('/me', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { username } = (req as AuthedRequest).user;

  const parseResult = userPatchSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ detail: 'Некорректный формат данных', errors: parseResult.error.issues });
  }

  const { password, email, category, input_context_credits, output_generation_credits, rag_enabled } = parseResult.data;

  const user = await userRepository.findByUsername(username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (password) {
    user.password_hash = await userRepository.hashPassword(password);
    user.must_change_password = false;
  }
  if (email !== undefined) user.email = email;

  if (category !== undefined) {
    const categoryExists = await categoryRepository.findByName(category);
    if (!categoryExists) {
      return res.status(400).json({ error: 'Указанная категория не существует в системе' });
    }

    const allowed = user.allowed_categories || [];
    if (allowed.length > 0 && !allowed.includes(category)) {
      return res.status(400).json({ error: 'Выбранная категория недоступна вам' });
    }

    if (allowed.length === 0 && user.category !== category) {
      return res.status(400).json({ error: 'У вас нет прав для смены категории' });
    }
    user.category = category;
  }

  if (input_context_credits !== undefined) user.input_context_credits = input_context_credits;
  if (output_generation_credits !== undefined) user.output_generation_credits = output_generation_credits;
  if (rag_enabled !== undefined) user.rag_enabled = rag_enabled;

  const activeCategory = await categoryRepository.findByName(user.category || '') as CategoryEntry | null;
  if (activeCategory) {
    const providerCfg = providersConfig[activeCategory.provider || 'llamacpp'] || {};
    const limitCheck = limits.validateUserLimits({
      userValues: user,
      categorySettings: activeCategory as Record<string, unknown>,
      providerCfg,
    });
    if (!limitCheck.ok) {
      return res.status(400).json({ error: limitCheck.errors.join('; ') });
    }
  }

  await userRepository.save(username, user);
  return res.json({ status: 'success' });
}));

router.get('/categories', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const allowed = (req as AuthedRequest).user.allowed_categories || [];
  const categories = await categoryRepository.listAll();
  res.json(toSafeCategories(categories, allowed));
}));

type UsersRoutes = typeof router & {
  getGuestAllowedCategories: typeof getGuestAllowedCategories;
};

export = Object.assign(router, { getGuestAllowedCategories }) as UsersRoutes;
