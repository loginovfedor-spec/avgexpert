import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
// @ts-ignore
import { asyncHandler, AppError } from '../../core/errors';
// @ts-ignore
import { authenticate } from '../auth/auth.middleware';
// @ts-ignore
import { KB_USER_MAX_DOCS, KB_USER_MAX_FILE_BYTES } from '../../core/config';
import { KbRepository } from './kb.repository';
import { getUserKbMaxDocs } from './kb.limits';
import { assertSafeSourceUri } from '../ingestion/path-utils';
import { validateUserUpload } from './upload.validation';
import { withKbUploadLock } from './upload-lock';

type AuthUser = {
  username: string;
  category?: string;
};

type AuthedRequest = Request & { user?: AuthUser };

const router = Router();
router.use(authenticate);

function ownerId(req: AuthedRequest): string {
  return String(req.user?.username || '');
}

const uploadLimiter = process.env.NODE_ENV === 'test'
  ? (_req: Request, _res: Response, next: () => void) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: Request) => ownerId(req as AuthedRequest) || 'anonymous',
      handler: (_req, res, _next, options) => {
        res.status(options.statusCode).json({
          error: { code: 'rate_limit', message: options.message },
        });
      },
      message: 'Превышен лимит загрузок документов, попробуйте позже',
    });

function toPublicDoc(doc: {
  id: string;
  filename: string;
  mime?: string;
  size?: number;
  status: string;
  scope: string;
  sourceUri?: string;
}) {
  return {
    id: doc.id,
    filename: doc.filename,
    mime: doc.mime,
    size: doc.size,
    status: doc.status,
    scope: doc.scope,
    sourceUri: doc.sourceUri,
  };
}

router.post(
  '/documents',
  uploadLimiter,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      filename: z.string().min(1).max(255),
      content: z.string().min(1).max(KB_USER_MAX_FILE_BYTES),
      mime: z.string().max(128).optional(),
      title: z.string().max(512).optional(),
      sourceUri: z.string().max(2048).optional(),
    });

    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        detail: 'Некорректные параметры загрузки',
        errors: parsed.error.issues,
      });
    }

    const userId = ownerId(req);
    if (!userId) {
      throw new AppError('Пользователь не авторизован', 401, 'unauthorized');
    }

    try {
      assertSafeSourceUri(parsed.data.sourceUri);
    } catch (err) {
      return res.status(400).json({ detail: (err as Error).message });
    }

    let validated;
    try {
      validated = validateUserUpload({
        filename: parsed.data.filename,
        content: parsed.data.content,
        mime: parsed.data.mime,
        maxBytes: KB_USER_MAX_FILE_BYTES,
      });
    } catch (err) {
      return res.status(400).json({ detail: (err as Error).message });
    }

    const kbRepository = new KbRepository();
    const maxDocs = getUserKbMaxDocs(req.user?.category, KB_USER_MAX_DOCS);

    const { createIngestionPipeline } = require('../ingestion/pipeline');
    const { runVectorMigrations } = require('../vector/pg/migrate');

    await runVectorMigrations();
    const pipeline = createIngestionPipeline();
    const result = await withKbUploadLock(`user:${userId}`, async () => {
      const currentCount = await kbRepository.countByOwner(userId, 'user');
      if (currentCount >= maxDocs) {
        return { limited: true as const };
      }
      return pipeline.ingestContent({
        content: parsed.data.content,
        filename: validated.sanitizedFilename,
        mime: validated.mime,
        title: parsed.data.title,
        scope: 'user',
        ownerUserId: userId,
        docType: 'user_upload',
        sourceUri: parsed.data.sourceUri || `user://${userId}/${validated.sanitizedFilename}`,
      });
    });

    if ('limited' in result && result.limited) {
      return res.status(409).json({
        detail: `Достигнут лимит документов (${maxDocs}) для вашей категории`,
        code: 'doc_limit_reached',
        limit: maxDocs,
      });
    }

    const ingestResult = result as Awaited<ReturnType<typeof pipeline.ingestContent>>;

    if (ingestResult.status === 'failed') {
      await kbRepository.deleteDocument(ingestResult.docId);
      return res.status(502).json({
        detail: 'Индексация документа не удалась',
        error: ingestResult.error,
        docId: ingestResult.docId,
      });
    }

    res.status(201).json({
      id: ingestResult.docId,
      status: ingestResult.status,
      chunkCount: ingestResult.chunkCount,
      filename: ingestResult.filename,
      checksum: ingestResult.checksum,
    });
  })
);

router.get(
  '/documents',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const userId = ownerId(req);
    const kbRepository = new KbRepository();
    const docs = await kbRepository.listByOwner(userId, 'user');
    const maxDocs = getUserKbMaxDocs(req.user?.category, KB_USER_MAX_DOCS);

    res.json({
      documents: docs.map(toPublicDoc),
      limit: maxDocs,
      count: docs.length,
    });
  })
);

router.get(
  '/documents/:id',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const userId = ownerId(req);
    const kbRepository = new KbRepository();
    const docId = String(req.params.id);
    const doc = await kbRepository.findByIdForOwner(docId, userId);
    if (!doc) {
      throw new AppError('Документ не найден', 404, 'not_found');
    }

    const chunkCount = await kbRepository.countChunksByDocId(doc.id);
    res.json({ ...toPublicDoc(doc), chunkCount });
  })
);

router.delete(
  '/documents/:id',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const userId = ownerId(req);
    const docId = String(req.params.id);
    const kbRepository = new KbRepository();
    const doc = await kbRepository.findByIdForOwner(docId, userId);
    if (!doc) {
      throw new AppError('Документ не найден', 404, 'not_found');
    }

    const { createVectorStoreFromEnv } = require('../vector/registry');
    const store = createVectorStoreFromEnv();
    await store.delete({ docId: doc.id, ownerUserId: userId, scope: 'user' });
    await kbRepository.deleteDocument(doc.id);

    res.json({ ok: true, id: doc.id });
  })
);

module.exports = router;
