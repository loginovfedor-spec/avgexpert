import { Request, Response } from 'express';
// @ts-ignore
import categoryRepository = require('../admin/category.repository');
// @ts-ignore
import chatService = require('./chat.service');
// @ts-ignore
import fastChatService = require('./fast_chat.service');
// @ts-ignore
import missionBinding = require('./mission_binding.service');
// @ts-ignore
import userRepository = require('../auth/user.repository');
// @ts-ignore
import { writeChatCompletionStream } from './stream_response.service';
// @ts-ignore
import { recordTokenUsage } from './token_usage.service';
import { StreamEvent } from '../../types/chat.types';
// @ts-ignore
import logger = require('../../core/logger');
// @ts-ignore
const { isRagEffective } = require('../rag/rag.policy');

const chatControllerLogger = logger.scoped('ChatController');

type ChatUser = {
  username: string;
  category?: string;
  allowed_categories?: string[];
  tokens_allocated?: number;
  is_blocked?: boolean | number;
  [key: string]: unknown;
};

type ChatBody = {
  category?: string;
  stream?: boolean;
  run_id?: string;
  runId?: string;
  mission_id?: string;
  missionId?: string;
  [key: string]: unknown;
};

type ChatRequest = Request & {
  user: ChatUser;
  body: ChatBody;
};

type CategorySettings = Record<string, unknown> & {
  model_name?: string;
  rag_allowed?: boolean | number;
  rag_enabled?: boolean | number;
  sandbox_enabled?: boolean | number;
  complexity?: number;
};

type TokenBalance = {
  balance: number;
};

type ErrorLike = Error & {
  status?: number;
  code?: string;
  details?: unknown;
};

function toErrorLike(err: unknown): ErrorLike {
  return err instanceof Error ? err as ErrorLike : new Error(String(err)) as ErrorLike;
}

class ChatController {
  async handleCompletion(req: ChatRequest, res: Response) {
    const { user, body } = req;

    if (user.is_blocked) {
      return res.status(403).json({
        error: {
          code: 'user_blocked',
          message: 'Доступ к моделям заблокирован. Обратитесь к администратору.',
        }
      });
    }

    const tokensAllocated = user.tokens_allocated || 0;
    if (tokensAllocated === 0) {
      return res.status(403).json({
        error: {
          code: 'no_token_quota',
          message: 'Токены не выделены. Обратитесь к администратору.',
        }
      });
    }

    const balance = await userRepository.getTokenBalance(user.username) as TokenBalance | null;
    if (balance && balance.balance <= 0) {
      return res.status(403).json({
        error: {
          code: 'tokens_exhausted',
          message: 'Лимит токенов исчерпан. Обратитесь к администратору.',
        }
      });
    }

    let categoryName = body.category || user.category;
    const allowed = user.allowed_categories || [];
    if (allowed.length > 0 && !allowed.includes(categoryName)) {
      categoryName = user.category;
    }

    const catSettings = await categoryRepository.findByName(categoryName) as CategorySettings | null || {};

    const isFastPath = !isRagEffective(catSettings, user) && !catSettings.sandbox_enabled && !body.run_id && !body.runId;

    let missionId = body.mission_id || body.missionId;

    missionId = await missionBinding.ensureMission({ ...body, missionId }, user);

    if (isFastPath) {
      try {
        const stream = await fastChatService.handleFastCompletion({ user, body, catSettings });
        return this._streamToResponse(stream, res, catSettings, body.stream, user);
      } catch (err) {
        return this._handleError(err, res);
      }
    }

    return chatService.handleCompletion({ user, body, catSettings, res, missionId });
  }

  async _streamToResponse(stream: AsyncIterable<StreamEvent>, res: Response, catSettings: CategorySettings, isStreaming: boolean | undefined, user: ChatUser) {
    let modelName = catSettings?.model_name || 'default';

    const ac = new AbortController();
    const reqCloseHandler = () => ac.abort();
    res.req.on('close', reqCloseHandler);

    try {
      const result = await writeChatCompletionStream({ stream, res, modelName, isStreaming });
      await recordTokenUsage({
        user,
        usage: result.usage,
        complexity: catSettings?.complexity ?? 1.0,
        source: 'fast path'
      });
    } catch (err: unknown) {
      this._handleError(err, res);
    } finally {
      res.req.off('close', reqCloseHandler);
    }
  }

  _handleError(err: unknown, res: Response, providerId: string = 'unknown') {
    const error = toErrorLike(err);
    chatControllerLogger.error('Chat completion failed', { providerId, message: error.message, code: error.code });
    const status = error.status || 502;
    const errorPayload = {
      error: {
        code: error.code || 'provider_error',
        message: error.message,
        details: error.details || null
      }
    };

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.status(status).json(errorPayload);
    }
  }
}

export = new ChatController();
