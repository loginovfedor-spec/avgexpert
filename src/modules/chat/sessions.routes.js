/**
 * Routes: Sessions CRUD
 * GET    /api/sessions
 * GET    /api/sessions/:id
 * POST   /api/sessions
 * DELETE /api/sessions/:id
 */
const { Router } = require('express');
const { authenticate } = require('../auth/auth.middleware');
const { asyncHandler } = require('../../core/errors');
const sessionRepository = require('./session.repository');
const { z } = require('zod');

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  try {
    const sessions = await sessionRepository.listByUser(req.user.username);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения сессий' });
  }
}));

router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const session = await sessionRepository.findById(req.user.username, req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    res.json(session);
  } catch (err) {
    res.status(err.status === 400 ? 400 : 500).json({ error: err.message || 'Ошибка чтения файла сессии' });
  }
}));

const sessionSaveSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(120).optional().default('Новый чат'),
  messages: z.array(z.record(z.any())).max(2000).default([]),
  updatedAt: z.number().int().positive().optional(),
  category: z.string().max(64).optional().nullable(),
}).strict();

router.post('/', asyncHandler(async (req, res) => {
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
    await sessionRepository.save(req.user.username, data);
    res.json({ status: 'success' });
  } catch (err) {
    res.status(err.status === 400 ? 400 : 500).json({ error: err.message || 'Ошибка сохранения сессии' });
  }
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const success = await sessionRepository.delete(req.user.username, req.params.id);
    if (success) {
      res.json({ status: 'success' });
    } else {
      res.status(404).json({ error: 'Сессия не найдена' });
    }
  } catch (err) {
    res.status(err.status === 400 ? 400 : 500).json({ error: err.message || 'Ошибка удаления сессии' });
  }
}));

const sessionPatchSchema = z.object({
  title: z.string().min(1).max(120),
}).strict();

router.patch('/:id', asyncHandler(async (req, res) => {
  const parseResult = sessionPatchSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ detail: 'Некорректный формат данных', errors: parseResult.error.issues });
  }

  try {
    const success = await sessionRepository.updateTitle(req.user.username, req.params.id, parseResult.data.title);
    if (success) {
      res.json({ status: 'success' });
    } else {
      res.status(404).json({ error: 'Сессия не найдена' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления сессии' });
  }
}));

module.exports = router;
