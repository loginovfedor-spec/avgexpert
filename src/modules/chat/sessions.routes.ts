import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware';
import { asyncHandler } from '../../core/errors';
import sessionRepository from './session.repository';
const router = Router();

type AuthedRequest = Request & {
  user: { username: string };
};

router.use(authenticate);

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  try {
    const sessions = await sessionRepository.listByUser((req as AuthedRequest).user.username);
    return res.json(sessions);
  } catch (_err) {
    return res.status(500).json({ error: 'Ошибка получения сессий' });
  }
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  try {
    const session = await sessionRepository.findById((req as AuthedRequest).user.username, String(req.params.id));
    if (!session) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    return res.json(session);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status === 400 ? 400 : 500;
    const message = err instanceof Error ? err.message : 'Ошибка чтения файла сессии';
    return res.status(status).json({ error: message });
  }
}));

const sessionSaveSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(120).optional().default('Новый чат'),
  messages: z.array(z.record(z.string(), z.unknown())).max(2000).default([]),
  updatedAt: z.number().int().positive().optional(),
  category: z.string().max(64).optional().nullable(),
}).strict();

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const parseResult = sessionSaveSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ detail: 'Некорректный формат данных сессии', errors: parseResult.error.issues });
  }

  const { id, title, messages, updatedAt, category } = parseResult.data;

  const data = {
    id,
    title,
    messages,
    category: category || null,
    updatedAt: updatedAt || Date.now(),
  };

  try {
    await sessionRepository.save((req as AuthedRequest).user.username, data);
    return res.json({ status: 'success' });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status === 400 ? 400 : 500;
    const message = err instanceof Error ? err.message : 'Ошибка сохранения сессии';
    return res.status(status).json({ error: message });
  }
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  try {
    const success = await sessionRepository.delete((req as AuthedRequest).user.username, String(req.params.id));
    if (success) {
      return res.json({ status: 'success' });
    }
    return res.status(404).json({ error: 'Сессия не найдена' });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status === 400 ? 400 : 500;
    const message = err instanceof Error ? err.message : 'Ошибка удаления сессии';
    return res.status(status).json({ error: message });
  }
}));

const sessionPatchSchema = z.object({
  title: z.string().min(1).max(120),
}).strict();

router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const parseResult = sessionPatchSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ detail: 'Некорректный формат данных', errors: parseResult.error.issues });
  }

  try {
    const success = await sessionRepository.updateTitle(
      (req as AuthedRequest).user.username,
      String(req.params.id),
      parseResult.data.title
    );
    if (success) {
      return res.json({ status: 'success' });
    }
    return res.status(404).json({ error: 'Сессия не найдена' });
  } catch (_err) {
    return res.status(500).json({ error: 'Ошибка обновления сессии' });
  }
}));

export = router;
