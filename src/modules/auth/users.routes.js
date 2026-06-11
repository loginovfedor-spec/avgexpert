/**
 * Routes: User Profile
 * GET  /api/users/me
 * PATCH /api/users/me
 */
const { Router } = require('express');
const userRepository = require('./user.repository');
const { authenticate } = require('./auth.middleware');
const { asyncHandler } = require('../../core/errors');
const { z } = require('zod');

const router = Router();
const categoryRepository = require('../admin/category.repository');
const providersConfig = require('../../core/providers.config');
const limits = require('../chat/limit.service');

function toSafeCategories(categories, allowed = [], options = {}) {
  const allowAllWhenEmpty = options.allowAllWhenEmpty !== false;
  const safeCats = {};
  for (const [k, v] of Object.entries(categories)) {
    if ((allowAllWhenEmpty && allowed.length === 0) || allowed.includes(k)) {
      safeCats[k] = {
        name: v.name,
        suggested_questions: v.suggested_questions || '',
        sort_index: v.sort_index != null ? v.sort_index : 0,
        input_context_default: v.input_context_default != null ? v.input_context_default : 1000000,
        input_context_max: v.input_context_max != null ? v.input_context_max : 1000000,
        max_tokens: v.max_tokens != null ? v.max_tokens : 128000,
        complexity: v.complexity != null ? parseFloat(v.complexity) : 1.0,
        rag_allowed: v.rag_allowed !== false && v.rag_allowed !== 0,
      };
    }
  }
  return safeCats;
}

async function getGuestAllowedCategories() {
  const guestTemplate = await userRepository.findByUsername('user_a');
  if (!guestTemplate) return [];
  const allowed = guestTemplate.allowed_categories || [];
  if (allowed.length > 0) return allowed;
  return guestTemplate.category ? [guestTemplate.category] : [];
}

router.get('/public/categories', asyncHandler(async (req, res) => {
  const categories = await categoryRepository.listAll();
  const allowed = await getGuestAllowedCategories();
  res.json(toSafeCategories(categories, allowed, { allowAllWhenEmpty: false }));
}));

router.get('/me', authenticate, (req, res) => {
  const u = { ...req.user };
  delete u.password_hash;
  res.json(u);
});

function tokensToCredits(tokens) {
  return Math.round((Number(tokens) || 0) / 1000);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BALANCE_DISPLAY_DAYS = 10;
const BALANCE_EXPORT_DAYS = 90; // 3 months

function startOfLocalDay(ts) {
  const d = new Date(Number(ts) || Date.now());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatCsvDate(ts) {
  const d = new Date(Number(ts) || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const CSV_DELIMITER = ';';

function escapeCsvCell(value) {
  const s = String(value ?? '');
  if (/[";\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function operationsToCsv(operations) {
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

/**
 * Token-level effect of a single history row on the balance.
 *  delta    – signed change of the balance in tokens (top-ups +, spending/resets -)
 *  consumed – tokens actually spent on chat for this row (only chat_usage rows)
 *  received – tokens credited (top-ups / positive admin adjustments)
 */
function rowTokenEffect(row) {
  const allocated = Number(row.tokens_allocated) || 0;
  const input = Number(row.tokens_input) || 0;
  const output = Number(row.tokens_output) || 0;
  const reason = row.reason || '';

  // Admin adjustment: signed delta; positive = credit, negative = deduction.
  if (reason === 'admin_adjustment') {
    return { delta: allocated, consumed: 0, received: Math.max(0, allocated) };
  }

  // Actual chat spending – the authoritative source for "расход".
  if (reason === 'chat_usage') {
    return { delta: -(input + output), consumed: input + output, received: 0 };
  }

  // Balance reset when the quota is exhausted: zero-out whatever was left.
  if (reason === 'tokens_exhausted') {
    return { delta: -Math.max(0, allocated - input - output), consumed: 0, received: 0 };
  }

  // Top-up (Robokassa payment, initial allocation, etc.).
  if (allocated > 0 && input === 0 && output === 0) {
    return { delta: allocated, consumed: 0, received: allocated };
  }

  // Legacy / unknown rows that still carry usage: treat as spending.
  if (input > 0 || output > 0) {
    return { delta: -(input + output), consumed: input + output, received: 0 };
  }

  return { delta: 0, consumed: 0, received: 0 };
}

async function buildDailyOperations(username, currentTokens) {
  const rows = await userRepository.getTokenHistoryAsc(username);

  const effects = rows.map((row) => ({ ...rowTokenEffect(row), date: row.recorded_at }));
  const knownDelta = effects.reduce((sum, e) => sum + e.delta, 0);
  let runningTokens = currentTokens - knownDelta;

  const dayMap = new Map();
  for (const e of effects) {
    const d = new Date(Number(e.date) || Date.now());
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let entry = dayMap.get(dayKey);
    if (!entry) {
      // runningTokens at the first event of the day = opening balance in tokens
      entry = { date: e.date, startTokens: runningTokens, consumedTokens: 0, receivedTokens: 0 };
      dayMap.set(dayKey, entry);
    }
    runningTokens += e.delta;
    entry.date = e.date;
    entry.consumedTokens += e.consumed;
    entry.receivedTokens += e.received;
  }

  const operations = [];
  for (const entry of dayMap.values()) {
    const openingCredits = Math.max(0, tokensToCredits(entry.startTokens));
    const spentCredits = tokensToCredits(entry.consumedTokens);
    const receivedCredits = tokensToCredits(entry.receivedTokens);

    if (spentCredits === 0 && receivedCredits === 0) continue;

    let title;
    if (spentCredits > 0 && receivedCredits > 0) title = 'Расход и пополнение';
    else if (spentCredits > 0) title = 'Расход за день';
    else title = 'Пополнение за день';

    // Balance after the day's operations: opening + top-ups − usage (all in credits).
    const balanceCredits = Math.max(0, openingCredits + receivedCredits - spentCredits);

    operations.push({
      date: entry.date,
      title,
      spent: spentCredits,
      received: receivedCredits,
      balance: balanceCredits,
    });
  }

  operations.reverse();
  return operations;
}

function filterOperationsSinceDays(operations, days) {
  const cutoff = startOfLocalDay(Date.now() - (days - 1) * MS_PER_DAY);
  return operations.filter((op) => startOfLocalDay(op.date) >= cutoff);
}

router.get('/me/balance', authenticate, asyncHandler(async (req, res) => {
  const balance = await userRepository.getTokenBalance(req.user.username);
  if (!balance) return res.status(404).json({ error: 'User not found' });
  res.set('Cache-Control', 'no-store');

  const allOperations = await buildDailyOperations(req.user.username, balance.balance);
  const operations = filterOperationsSinceDays(allOperations, BALANCE_DISPLAY_DAYS);

  res.json({
    balance: Math.max(0, tokensToCredits(balance.balance)),
    operations,
  });
}));

router.get('/me/balance/export', authenticate, asyncHandler(async (req, res) => {
  const balance = await userRepository.getTokenBalance(req.user.username);
  if (!balance) return res.status(404).json({ error: 'User not found' });

  const allOperations = await buildDailyOperations(req.user.username, balance.balance);
  const operations = filterOperationsSinceDays(allOperations, BALANCE_EXPORT_DAYS);
  const csv = operationsToCsv(operations);
  const filename = `balance-history-${formatCsvDate(Date.now())}.csv`;

  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.send(csv);
}));

const userPatchSchema = z.object({
  email: z.string().email().max(254).optional().or(z.literal('')),
  password: z.string().min(8).max(128).optional(),
  category: z.string().max(64).optional(),
  input_context_credits: z.number().int().min(0).max(limits.USER_INPUT_MAX).optional().nullable(),
  output_generation_credits: z.number().int().min(0).max(limits.USER_OUTPUT_MAX).optional().nullable(),
  rag_enabled: z.boolean().optional(),
}).strict();

router.patch('/me', authenticate, asyncHandler(async (req, res) => {
  const { username } = req.user;
  
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

  const activeCategory = await categoryRepository.findByName(user.category);
  if (activeCategory) {
    const providerCfg = providersConfig[activeCategory.provider || 'llamacpp'] || {};
    const limitCheck = limits.validateUserLimits({ userValues: user, categorySettings: activeCategory, providerCfg });
    if (!limitCheck.ok) {
      return res.status(400).json({ error: limitCheck.errors.join('; ') });
    }
  }

  await userRepository.save(username, user);
  res.json({ status: 'success' });
}));

router.get('/categories', authenticate, asyncHandler(async (req, res) => {
  const allowed = req.user.allowed_categories || [];
  const categories = await categoryRepository.listAll();
  res.json(toSafeCategories(categories, allowed));
}));

module.exports = router;
module.exports.getGuestAllowedCategories = getGuestAllowedCategories;
