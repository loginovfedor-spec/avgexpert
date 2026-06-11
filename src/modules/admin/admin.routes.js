/**
 * Routes: Admin Panel
 * /api/admin/users, /api/admin/categories, /api/admin/stats
 */
const { Router } = require('express');
const os = require('os');
const { authenticate, requireAdmin } = require('../auth/auth.middleware');
const { asyncHandler } = require('../../core/errors');
const { assertSafeIdentifier, mergeFields, validateProviderUrl } = require('../../core/utils');
const userRepository = require('../auth/user.repository');
const categoryRepository = require('./category.repository');
const sessionRepository = require('../chat/session.repository');
const { getProvider } = require('../providers/provider.factory');
const AuditService = require('../audit/audit.service');
const crypto = require('../../core/crypto');
const { TEST_TIMEOUT } = require('../../core/config');
const providersConfig = require('../../core/providers.config');
const limits = require('../chat/limit.service');
const logger = require('../../core/logger').scoped('Admin');
const db = require('../../core/sqlite');

const router = Router();

// All admin routes require auth + admin
router.use(authenticate, requireAdmin);

// ── Users ───────────────────────────────────────────────

router.get('/users', asyncHandler(async (req, res) => {
  const users = await userRepository.listAll();
  const safe = {};
  for (const [k, v] of Object.entries(users)) {
    safe[k] = { ...v, password_hash: undefined };
  }
  res.json(safe);
}));

const { z } = require('zod');

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
  tokens_allocated: z.number().int().min(0).optional().nullable(),
  is_blocked: z.boolean().optional().nullable(),
  input_context_credits: z.number().int().min(0).max(limits.USER_INPUT_MAX).optional().nullable(),
  output_generation_credits: z.number().int().min(0).max(limits.USER_OUTPUT_MAX).optional().nullable(),
});

router.post('/users/:username', asyncHandler(async (req, res) => {
  let username;
  try {
    username = assertSafeIdentifier(req.params.username, 'username');
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }

  const { RedactionService } = require('../policy/redaction.service');
  const parseResult = adminUserSchema.safeParse(req.body);
  if (!parseResult.success) {
    logger.error('User validation failed', { errors: RedactionService.redact(parseResult.error.format()) });
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
    user = templateUser ? { ...templateUser } : {};
    user.password_hash = await userRepository.hashPassword(data.password);
    user.email = null;
  } else if (data.password) {
    user.password_hash = await userRepository.hashPassword(data.password);
  }
  
  if (data.email !== undefined) user.email = data.email;
  if (data.category !== undefined) user.category = data.category || null;
  if (data.expiration_date !== undefined) user.expiration_date = data.expiration_date;
  if (data.n_ctx !== undefined) user.n_ctx = data.n_ctx;
  if (data.system_prompt !== undefined) user.system_prompt = data.system_prompt;
  if (data.allowed_categories !== undefined) user.allowed_categories = data.allowed_categories;
  if (data.is_admin !== undefined) user.is_admin = data.is_admin ? 1 : 0;
  const prevTokensAllocated = user.tokens_allocated || 0;
  if (data.tokens_allocated !== undefined && data.tokens_allocated !== null) user.tokens_allocated = parseInt(data.tokens_allocated);
  if (data.is_blocked !== undefined) user.is_blocked = data.is_blocked ? 1 : 0;
  if (data.input_context_credits !== undefined) user.input_context_credits = data.input_context_credits;
  if (data.output_generation_credits !== undefined) user.output_generation_credits = data.output_generation_credits;

  // Resolve active default category dynamically based on allowed categories
  const allowed = user.allowed_categories || [];
  if (allowed.length > 0 && (!user.category || !allowed.includes(user.category))) {
    user.category = allowed[0];
  }

  const userCategory = await categoryRepository.findByName(user.category);
  if (userCategory) {
    const providerCfg = providersConfig[userCategory.provider || 'llamacpp'] || {};
    const limitCheck = limits.validateUserLimits({ userValues: user, categorySettings: userCategory, providerCfg });
    if (!limitCheck.ok) {
      return res.status(400).json({ detail: limitCheck.errors.join('; ') });
    }
  }

  if (user.email) {
    const existingEmailUser = await userRepository.findByEmail(user.email);
    if (existingEmailUser && existingEmailUser.username !== username) {
      return res.status(409).json({ detail: 'Пользователь с таким e-mail уже существует' });
    }
  }

  await userRepository.save(username, user);

  // Record token allocation change in history so running balance stays correct.
  // Store the raw signed delta: positive = top-up, negative = reduction.
  const newTokensAllocated = user.tokens_allocated || 0;
  const tokensDelta = newTokensAllocated - prevTokensAllocated;
  if (!isNew && tokensDelta !== 0) {
    await userRepository.recordAdminTokenAdjustment(username, tokensDelta);
  }
  
  AuditService.log(
    req.user.username,
    isNew ? 'USER_CREATE' : 'USER_UPDATE',
    { target_user: username },
    req.ip || req.connection.remoteAddress
  );

  res.json({ status: 'success' });
}));

router.delete('/users/:username', asyncHandler(async (req, res) => {
  let username;
  try {
    username = assertSafeIdentifier(req.params.username, 'username');
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }

  if (username === 'admin') {
    return res.status(400).json({ detail: 'Нельзя удалить основного администратора' });
  }

  await userRepository.delete(username);
  
  AuditService.log(
    req.user.username,
    'USER_DELETE',
    { target_user: username },
    req.ip || req.connection.remoteAddress
  );

  res.json({ status: 'success' });
}));

// Token history for a user
router.get('/users/:username/token-history', asyncHandler(async (req, res) => {
  let username;
  try {
    username = assertSafeIdentifier(req.params.username, 'username');
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
  const history = await userRepository.getTokenHistory(username, 100);
  res.json(history);
}));

// ── Categories ──────────────────────────────────────────

const CATEGORY_FIELDS = [
  'provider', 'model_name', 'endpoint_url', 'api_key', 'yandex_folder_id',
  'temperature', 'top_p', 'top_k', 'min_p', 'repeat_penalty',
  'input_context_default', 'input_context_max', 'max_tokens', 'system_prompt', 'routing_mode', 'fallback_provider',
  'extra_params', 'debug_mode', 'complexity', 'suggested_questions', 'sort_index',
  'rag_allowed', 'retrieval_tier'
];

router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await categoryRepository.listAll();
  const safeCats = {};
  for (const [k, v] of Object.entries(categories)) {
    safeCats[k] = { ...v };
    if (safeCats[k].api_key) {
      safeCats[k].api_key = crypto.maskKey(safeCats[k].api_key);
    }
  }
  res.json(safeCats);
}));

router.get('/categories/:category_name', asyncHandler(async (req, res) => {
  const catName = req.params.category_name;
  const category = await categoryRepository.findByName(catName);
  if (!category) return res.status(404).json({ detail: 'Категория не найдена' });
  
  if (category.api_key) {
    category.api_key = crypto.maskKey(category.api_key);
  }
  res.json(category);
}));

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
  extra_params: z.record(z.any()).optional().nullable(),
  debug_mode: z.boolean().optional().nullable(),
  complexity: z.number().min(0.01).max(99.99).optional().nullable(),
  suggested_questions: z.string().max(16000).optional().nullable(),
  sort_index: z.number().int().optional().nullable(),
  rag_allowed: z.boolean().optional().nullable(),
  retrieval_tier: z.enum(['consultant', 'expert', 'sage']).optional().nullable(),
});

router.post('/categories/:category_name', asyncHandler(async (req, res) => {
  let catName;
  try {
    // Allows spaces and cyrillic for category names, unlike usernames
    catName = req.params.category_name;
    if (!catName || catName.length < 2 || catName.length > 64 || catName.includes('..') || catName.includes('/')) {
      return res.status(400).json({ detail: 'Invalid category_name' });
    }
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
  
  const parseResult = categorySchema.safeParse(req.body);
  if (!parseResult.success) {
    const { RedactionService } = require('../policy/redaction.service');
    logger.error('Category validation failed', { errors: RedactionService.redact(parseResult.error.format()) });
    return res.status(400).json({ detail: 'Некорректный формат данных категории', errors: parseResult.error.issues });
  }

  let category = await categoryRepository.findByName(catName) || {};
  
  mergeFields(category, parseResult.data, CATEGORY_FIELDS);

  const providerCfg = providersConfig[category.provider || 'llamacpp'] || {};
  const caps = limits.getAdapterCaps(providerCfg);
  if (category.input_context_default != null && category.input_context_max != null && category.input_context_default > category.input_context_max) {
    return res.status(400).json({ detail: 'input_context_default не может быть больше input_context_max' });
  }
  if (category.input_context_max != null && category.input_context_max > caps.input) {
    return res.status(400).json({ detail: `input_context_max не может быть больше максимума адаптера (${caps.input})` });
  }
  if (category.max_tokens != null && category.max_tokens > caps.output) {
    return res.status(400).json({ detail: `max_tokens не может быть больше максимума адаптера (${caps.output})` });
  }

  await categoryRepository.save(catName, category);
  
  AuditService.log(
    req.user.username,
    'CATEGORY_UPDATE',
    { target_category: catName },
    req.ip || req.connection.remoteAddress
  );

  res.json({ status: 'success' });
}));

router.delete('/categories/:category_name', asyncHandler(async (req, res) => {
  let catName;
  try {
    catName = req.params.category_name;
    if (!catName || catName.includes('..') || catName.includes('/')) {
      return res.status(400).json({ detail: 'Invalid category_name' });
    }
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }

  const existingCat = await categoryRepository.findByName(catName);
  if (!existingCat) {
    return res.status(404).json({ detail: 'Категория не найдена' });
  }

  // Optional: check if users are linked to this category
  const users = await userRepository.listAll();
  for (const u of Object.values(users)) {
    if (u.category === catName || (Array.isArray(u.allowed_categories) && u.allowed_categories.includes(catName))) {
      return res.status(400).json({ detail: 'Нельзя удалить категорию, к которой привязаны пользователи' });
    }
  }

  await categoryRepository.delete(catName);
  
  AuditService.log(
    req.user.username,
    'CATEGORY_DELETE',
    { target_category: catName },
    req.ip || req.connection.remoteAddress
  );

  res.json({ status: 'success' });
}));

router.post('/categories/:category_name/test', asyncHandler(async (req, res) => {
  let catName;
  try {
    catName = req.params.category_name;
    if (!catName || catName.includes('..') || catName.includes('/')) {
      return res.status(400).json({ detail: 'Invalid category_name' });
    }
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }

  const savedCat = await categoryRepository.findByName(catName) || {};
  const data = req.body || {};

  const providerId = data.provider || savedCat.provider || 'llamacpp';
  const providerCfg = providersConfig[providerId] || {};
  
  let endpointUrl = (data.endpoint_url || savedCat.endpoint_url || providerCfg.endpoint_url || 'http://127.0.0.1:8201').replace(/\/$/, '');
  const isLocalProvider = ['llamacpp', 'ollama'].includes(providerCfg.adapter || providerId);
  
  try {
    validateProviderUrl(endpointUrl, isLocalProvider);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const apiKey = data.api_key || savedCat.api_key || providerCfg.api_key || '';
  const provider = getProvider(providerId);
  if (!provider) return res.status(500).json({ error: 'Провайдер не найден' });

  // Helper to run health check
  const checkProvider = async (p, config) => {
    if (p.checkHealth) {
      return await p.checkHealth(config);
    }
    
    // Generic fetch fallback
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT);
    const headers = {};
    if (config.api_key) headers['Authorization'] = `Bearer ${config.api_key}`;
    try {
      const r = await fetch(`${config.endpoint_url}/models`, { headers, signal: controller.signal });
      clearTimeout(timeout);
      return r.ok;
    } catch (e) {
      clearTimeout(timeout);
      return false;
    }
  };

  // 1. Try direct
  const checkConfig = {
    ...providerCfg,
    ...savedCat,
    ...data,
    extra_params: {
      ...(providerCfg.extra_params || {}),
      ...(savedCat.extra_params || {}),
      ...(data.extra_params || {})
    },
    endpoint_url: endpointUrl,
    api_key: apiKey
  };
  const isDirectOk = await checkProvider(provider, checkConfig);
  if (isDirectOk) {
    return res.json({ status: 'success', message: 'Соединение установлено напрямую' });
  }

  res.status(502).json({ error: 'Не удалось установить соединение с провайдером' });
}));

// ── Stats ───────────────────────────────────────────────

router.get('/stats', asyncHandler(async (req, res) => {

  const totalUsers = await userRepository.countTotal();
  const expiredUsers = await userRepository.countExpired();
  const totalSessions = await sessionRepository.countTotal();
  const totalCategories = await categoryRepository.countTotal();

  res.json({
    users: {
      total: totalUsers,
      active_today: 0,
      expired: expiredUsers,
    },
    sessions: {
      total: totalSessions,
    },
    system: {
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      os_load: os.loadavg(),
      os_free_mem: os.freemem(),
      os_total_mem: os.totalmem(),
      platform: os.platform(),
      node_version: process.version,
    },
    categories: totalCategories,
  });
}));

// ── Audit ───────────────────────────────────────────────

router.get('/audit', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const offset = parseInt(req.query.offset, 10) || 0;
  const username = req.query.username || null;
  const action = req.query.action || null;

  const logs = await AuditService.getLogs({ limit, offset, username, action });
  res.json(logs);
}));

// ── MVP Dashboard ───────────────────────────────────────

router.get('/dashboard/mvp', asyncHandler(async (req, res) => {
  const sqliteDb = require('../../core/sqlite');
  const { getDatabasePort, ensureAppPgReady, isAppPgEnabled } = require('../../core/pg');
  const traceBus = require('../observability/trace.bus');
  const metricsService = require('../observability/metrics.service');
  const fs = require('fs');
  const path = require('path');

  await ensureAppPgReady();
  const appDb = getDatabasePort();
  const runStatusRows = isAppPgEnabled()
    ? await appDb.all('SELECT state, COUNT(*)::int AS count FROM agent_runs GROUP BY state')
    : sqliteDb.prepare('SELECT state, count(*) as count FROM agent_runs GROUP BY state').all();
  const runStatus = {};
  for (const row of runStatusRows) {
    runStatus[row.state] = row.count;
  }

  const semanticRow = isAppPgEnabled()
    ? await appDb.get('SELECT COUNT(*)::int AS count FROM audit_logs WHERE action = @action', { action: 'semantic' })
    : sqliteDb.prepare('SELECT count(*) as count FROM audit_logs WHERE action = @action').get({ action: 'semantic' });
  const semanticEvents = semanticRow.count;
  const approvalEvents = sqliteDb.prepare('SELECT count(*) as count FROM approval_requests').get().count;
  
  const metrics = metricsService.getMetrics();
  const ragMetrics = require('../observability/rag-metrics.service').getSnapshot();

  // Eval report baseline; live RAG traces override semantic_quality when present
  let semanticQualityScore = 0.845;
  let ragQualityScore = 1.0;

  try {
    const evalPath = path.join(process.cwd(), 'docs/06_testing/EVALS_REPORT.json');
    if (fs.existsSync(evalPath)) {
      const report = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
      semanticQualityScore = report.semantic_accuracy || semanticQualityScore;
      ragQualityScore = report.rag_score || ragQualityScore;
    }
  } catch (e) {
    // fallback to placeholders if file missing or corrupt
  }

  if (ragMetrics.semantic_quality_score != null) {
    semanticQualityScore = ragMetrics.semantic_quality_score;
  }

  // Feature flags
  const { FEATURE_FLAGS } = require('../../core/config');

  // Traces
  const traces = traceBus.getRecentTraces(100);

  res.json({
    run_status: runStatus,
    semantic_events: semanticEvents,
    approval_events: approvalEvents,
    total_cost_usd: metrics.costUsd,
    feature_flags: FEATURE_FLAGS,
    latency_p95: metrics.latency.p95,
    latency_p50: metrics.latency.p50,
    error_rate: metrics.errorRate,
    sandbox_warm_count: 0,
    sandbox_cold_count: 0,
    rag_quality_score: ragQualityScore,
    semantic_quality_score: semanticQualityScore,
    rag_metrics: ragMetrics,
    recent_traces: traces
  });
}));

// ── Debug Log SSE Stream ───────────────────────────────────────
const debugLogStore = [];
const MAX_DEBUG_STORE = 500;

function pushDebugLog(entry) {
  const { RedactionService } = require('../policy/redaction.service');
  const redacted = RedactionService.redact(entry);
  debugLogStore.unshift(redacted);
  if (debugLogStore.length > MAX_DEBUG_STORE) debugLogStore.pop();
}

// Expose so ModelGateway/adapters can write debug entries
router.pushDebugLog = pushDebugLog;

router.get('/debug/stream', asyncHandler(async (req, res) => {
  const since = req.query.since ? parseInt(req.query.since) : 0;
  const entries = debugLogStore.filter(e => e.ts > since);
  res.json(entries);
}));

router.post('/debug/log', asyncHandler(async (req, res) => {
  const { level, message, provider, ts } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });
  pushDebugLog({ level: level || 'debug', message, provider, ts: ts || Date.now() });
  res.json({ ok: true });
}));

router.delete('/debug/log', asyncHandler(async (req, res) => {
  debugLogStore.length = 0;
  res.json({ ok: true });
}));

router.post('/kb/documents', asyncHandler(async (req, res) => {
  const kbDocumentSchema = z.object({
    filePath: z.string().min(1, 'filePath обязателен'),
    title: z.string().max(512).optional(),
    scope: z.enum(['global', 'user', 'session']).default('global'),
    sourceUri: z.string().max(2048).optional(),
    docType: z.string().max(64).optional(),
    bookId: z.string().uuid().optional(),
    bookTitle: z.string().max(512).optional(),
  });

  const parseResult = kbDocumentSchema.safeParse(req.body || {});
  if (!parseResult.success) {
    return res.status(400).json({
      detail: 'Некорректные параметры ingest',
      errors: parseResult.error.issues,
    });
  }

  const data = parseResult.data;
  try {
    const { assertSafeSourceUri } = require('../ingestion/path-utils');
    assertSafeSourceUri(data.sourceUri);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }

  const { createIngestionPipeline } = require('../ingestion/pipeline');
  const { runVectorMigrations } = require('../vector/pg/migrate');

  await runVectorMigrations();
  const pipeline = createIngestionPipeline();
  const result = await pipeline.ingestFile({
    filePath: data.filePath,
    scope: data.scope,
    title: data.title,
    sourceUri: data.sourceUri,
    docType: data.docType,
    bookId: data.bookId,
    bookTitle: data.bookTitle,
  });

  if (result.status === 'failed') {
    return res.status(502).json({
      detail: 'Индексация документа не удалась',
      error: result.error,
      docId: result.docId,
    });
  }

  res.status(201).json({
    docId: result.docId,
    status: result.status,
    chunkCount: result.chunkCount,
    filename: result.filename,
    checksum: result.checksum,
  });
}));

router.get('/providers/template/:providerId/:modelName', asyncHandler(async (req, res) => {
  const { providerId, modelName } = req.params;
  const providersConfig = require('../../core/providers.config');
  const cfg = providersConfig[providerId];
  
  if (!cfg) return res.status(404).json({ error: 'Provider not found' });
  
  const template = {
    endpoint_url: cfg.endpoint_url || '',
    api_key: cfg.api_key || '',
    temperature: 0.7,
    max_tokens: 2048,
    ...cfg.extra_params
  };

  if (cfg.models && cfg.models[modelName]) {
    Object.assign(template, cfg.models[modelName].extra_params || {});
  }

  res.json(template);
}));

module.exports = router;
