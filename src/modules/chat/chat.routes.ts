import { Router, Request, Response } from 'express';
import { z } from 'zod';
// @ts-ignore
import { authenticate } from '../auth/auth.middleware';
// @ts-ignore
import { asyncHandler } from '../../core/errors';
import chatController = require('./chat.controller');
// @ts-ignore
import logger = require('../../core/logger');
// @ts-ignore
import limits = require('./limit.service');

const router = Router();
const chatRoutesLogger = logger.scoped('ChatRoutes');

type AuthenticatedChatRequest = Request & {
  user: {
    username: string;
    [key: string]: unknown;
  };
  body: Record<string, unknown>;
};

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.preprocess((val) => (typeof val === 'string' ? val.trim() : val), 
    z.string().max(limits.MAX_MESSAGE_CONTENT_CHARS).nullable().optional()
  ),
  name: z.string().optional(),
  tool_calls: z.array(z.unknown()).optional(),
  tool_call_id: z.string().optional(),
}).refine(m => {
  if (m.role === 'tool' && !m.tool_call_id) return false;
  if (m.role === 'user' && (!m.content || m.content.length === 0)) return false;
  return true;
}, { message: "Invalid message structure for the specified role" });

const chatCompletionSchema = z.object({
  messages: z.array(messageSchema).min(1).max(200),
  stream: z.boolean().optional().nullable().default(false),
  temperature: z.number().min(0).max(2).optional().nullable(),
  top_p: z.number().min(0).max(1).optional().nullable(),
  top_k: z.number().int().min(0).max(100).optional().nullable(),
  min_p: z.number().min(0).max(1).optional().nullable(),
  repeat_penalty: z.number().min(0).max(2).optional().nullable(),
  n_predict: z.number().int().positive().optional().nullable(),
  extra_params: z.record(z.string(), z.unknown()).optional().nullable(),
  run_id: z.string().optional().nullable(),
  runId: z.string().optional().nullable(),
  category: z.string().max(64).optional().nullable(),
}).refine(data => {
  const lastMsg = data.messages[data.messages.length - 1];
  return lastMsg.role !== 'system';
}, { message: "The last message cannot be a system message" });

router.post('/completions', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const parseResult = chatCompletionSchema.safeParse(req.body);
  if (!parseResult.success) {
    chatRoutesLogger.error('Validation failed', { errors: parseResult.error.format() });
    return res.status(400).json({ error: 'Неверный формат запроса', details: parseResult.error.issues });
  }

  await chatController.handleCompletion(req as AuthenticatedChatRequest, res);
}));

export = router;
