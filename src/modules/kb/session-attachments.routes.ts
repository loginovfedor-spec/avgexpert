import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../core/errors';
import { authenticate } from '../auth/auth.middleware';
import { KB_USER_MAX_FILE_BYTES } from '../../core/config';
import { KbRepository } from './kb.repository';
import { getUserKbMaxDocs } from './kb.limits';
import { assertSafeSourceUri } from '../ingestion/path-utils';
import { validateUserUpload } from './upload.validation';
import { enqueueIndexJob } from './indexing-queue';
import sessionRepository from '../chat/session.repository';
import { runVectorMigrations } from '../vector/pg/migrate';
import { createVectorStoreFromEnv } from '../vector/registry';

type AuthUser = {
  username: string;
  category?: string;
};

type AuthedRequest = Request & { user?: AuthUser; params: { sessionId: string; id?: string } };

const router = Router({ mergeParams: true });
router.use(authenticate);

function ownerId(req: AuthedRequest): string {
  return String(req.user?.username || '');
}

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

async function assertSessionOwned(username: string, sessionId: string): Promise<void> {
  const session = await sessionRepository.findById(username, sessionId);
  if (!session) {
    throw new AppError('Сессия не найдена', 404, 'not_found');
  }
}

router.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const sessionId = String(req.params.sessionId || '');
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

    await assertSessionOwned(userId, sessionId);

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

    await runVectorMigrations();

    const kbRepository = new KbRepository();
    const maxDocs = getUserKbMaxDocs(req.user?.category, undefined);
    const docId = randomUUID();
    const sourceUri = parsed.data.sourceUri || `session://${sessionId}/${validated.sanitizedFilename}`;

    const created = await kbRepository.withAdvisoryLock(`session_kb:${userId}:${sessionId}`, async (client) => {
      const currentCount = await kbRepository.countBySession(userId, sessionId, client);
      if (currentCount >= maxDocs) {
        return null;
      }

      await kbRepository.createDocumentWithClient(client, {
        id: docId,
        scope: 'session',
        filename: validated.sanitizedFilename,
        mime: validated.mime,
        size: Buffer.byteLength(parsed.data.content, 'utf-8'),
        sourceUri,
        ownerUserId: userId,
        sessionId,
        status: 'pending',
      });

      return docId;
    });

    if (!created) {
      return res.status(409).json({
        detail: `Достигнут лимит вложений (${maxDocs}) для этой сессии`,
        code: 'doc_limit_reached',
        limit: maxDocs,
      });
    }

    enqueueIndexJob({
      docId,
      content: parsed.data.content,
      filename: validated.sanitizedFilename,
      mime: validated.mime,
      title: parsed.data.title,
      scope: 'session',
      ownerUserId: userId,
      sessionId,
      docType: 'session_attachment',
      sourceUri,
    });

    return res.status(202).json({
      id: docId,
      status: 'pending',
      filename: validated.sanitizedFilename,
    });
  })
);

router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const userId = ownerId(req);
    const sessionId = String(req.params.sessionId || '');
    await assertSessionOwned(userId, sessionId);

    const kbRepository = new KbRepository();
    const docs = await kbRepository.listBySession(userId, sessionId);
    const maxDocs = getUserKbMaxDocs(req.user?.category, undefined);

    res.json({
      attachments: docs.map(toPublicDoc),
      limit: maxDocs,
      count: docs.length,
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const userId = ownerId(req);
    const sessionId = String(req.params.sessionId || '');
    const docId = String(req.params.id || '');
    await assertSessionOwned(userId, sessionId);

    const kbRepository = new KbRepository();
    const doc = await kbRepository.findByIdForSession(docId, userId, sessionId);
    if (!doc) {
      throw new AppError('Вложение не найдено', 404, 'not_found');
    }

    const chunkCount = await kbRepository.countChunksByDocId(doc.id);
    res.json({ ...toPublicDoc(doc), chunkCount });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const userId = ownerId(req);
    const sessionId = String(req.params.sessionId || '');
    const docId = String(req.params.id || '');
    await assertSessionOwned(userId, sessionId);

    const kbRepository = new KbRepository();
    const doc = await kbRepository.findByIdForSession(docId, userId, sessionId);
    if (!doc) {
      throw new AppError('Вложение не найдено', 404, 'not_found');
    }

    const store = createVectorStoreFromEnv();
    await store.delete({
      docId: doc.id,
      ownerUserId: userId,
      sessionId,
      scope: 'session',
    });
    await kbRepository.deleteDocument(doc.id);

    res.json({ ok: true, id: doc.id });
  })
);

export = router;
