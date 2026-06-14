import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/errors';
import userRepository from '../auth/user.repository';
import categoryRepository from './category.repository';
import sessionRepository from '../chat/session.repository';
import { AuditService } from './admin.shared';
import { clearDebugLogs, getDebugLogsSince, pushDebugLog } from './debug-log.store';
import { getDatabasePort, ensureAppPgReady } from '../../core/pg';
import traceBus from '../observability/trace.bus';
import metricsService from '../observability/metrics.service';
import ragMetricsService from '../observability/rag-metrics.service';
import { FEATURE_FLAGS } from '../../core/config';
import { assertSafeSourceUri } from '../ingestion/path-utils';
import { createIngestionPipeline } from '../ingestion/pipeline';
import { runVectorMigrations } from '../vector/pg/migrate';

const router = Router();

router.get('/stats', asyncHandler(async (_req: Request, res: Response) => {
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

router.get('/audit', asyncHandler(async (req: Request, res: Response) => {
  const limit = parseInt(String(req.query.limit), 10) || 50;
  const offset = parseInt(String(req.query.offset), 10) || 0;
  const username = req.query.username ? String(req.query.username) : null;
  const action = req.query.action ? String(req.query.action) : null;

  const logs = await AuditService.getLogs({ limit, offset, username, action });
  res.json(logs);
}));

router.get('/dashboard/mvp', asyncHandler(async (_req: Request, res: Response) => {
  await ensureAppPgReady();
  const appDb = getDatabasePort();
  const runStatusRows = await appDb.all('SELECT state, COUNT(*)::int AS count FROM agent_runs GROUP BY state');
  const runStatus: Record<string, number> = {};
  for (const row of runStatusRows) {
    runStatus[String(row.state)] = row.count as number;
  }

  const semanticRow = await appDb.get(
    'SELECT COUNT(*)::int AS count FROM audit_logs WHERE action = @action',
    { action: 'semantic' }
  );
  const semanticEvents = (semanticRow?.count as number) ?? 0;
  const approvalRow = await appDb.get('SELECT COUNT(*)::int AS count FROM approval_requests');
  const approvalEvents = (approvalRow?.count as number) ?? 0;

  const metrics = metricsService.getMetrics();
  const ragMetrics = ragMetricsService.getSnapshot();

  let semanticQualityScore = 0.845;
  let ragQualityScore = 1.0;

  try {
    const evalPath = path.join(process.cwd(), 'docs/06_testing/EVALS_REPORT.json');
    if (fs.existsSync(evalPath)) {
      const report = JSON.parse(fs.readFileSync(evalPath, 'utf8')) as {
        semantic_accuracy?: number;
        rag_score?: number;
      };
      semanticQualityScore = report.semantic_accuracy || semanticQualityScore;
      ragQualityScore = report.rag_score || ragQualityScore;
    }
  } catch (_e) {
    // fallback to placeholders if file missing or corrupt
  }

  if (ragMetrics.semantic_quality_score != null) {
    semanticQualityScore = ragMetrics.semantic_quality_score;
  }

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
    recent_traces: traces,
  });
}));

router.get('/debug/stream', asyncHandler(async (req: Request, res: Response) => {
  const since = req.query.since ? parseInt(String(req.query.since), 10) : 0;
  res.json(getDebugLogsSince(since));
}));

router.post('/debug/log', asyncHandler(async (req: Request, res: Response) => {
  const { level, message, provider, ts } = (req.body || {}) as Record<string, unknown>;
  if (!message) return res.status(400).json({ error: 'message required' });
  pushDebugLog({
    level: (level as string) || 'debug',
    message: String(message),
    provider: provider as string | undefined,
    ts: (ts as number) || Date.now(),
  });
  return res.json({ ok: true });
}));

router.delete('/debug/log', asyncHandler(async (_req: Request, res: Response) => {
  clearDebugLogs();
  res.json({ ok: true });
}));

const kbDocumentSchema = z.object({
  filePath: z.string().min(1, 'filePath обязателен'),
  title: z.string().max(512).optional(),
  scope: z.enum(['global', 'user', 'session']).default('global'),
  sourceUri: z.string().max(2048).optional(),
  docType: z.string().max(64).optional(),
  bookId: z.string().uuid().optional(),
  bookTitle: z.string().max(512).optional(),
});

router.post('/kb/documents', asyncHandler(async (req: Request, res: Response) => {
  const parseResult = kbDocumentSchema.safeParse(req.body || {});
  if (!parseResult.success) {
    return res.status(400).json({
      detail: 'Некорректные параметры ingest',
      errors: parseResult.error.issues,
    });
  }

  const data = parseResult.data;
  try {
    assertSafeSourceUri(data.sourceUri);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ detail: message });
  }

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

  return res.status(201).json({
    docId: result.docId,
    status: result.status,
    chunkCount: result.chunkCount,
    filename: result.filename,
    checksum: result.checksum,
  });
}));

export = router;
