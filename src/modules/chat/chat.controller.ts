import { Request, Response } from 'express';
import categoryRepository from '../admin/category.repository';
import chatService from './chat.service';
import fastChatService from './fast_chat.service';
import missionBinding from './mission_binding.service';
import { writeChatCompletionStream, writeErrorResponse } from './stream_response.service';
import { recordUsageAndCost } from './token_usage.service';
import { assertUserCanSpendFunds, buildRecordUsageParams } from './billing.helpers';
import traceBus from '../observability/trace.bus';
import { StreamEvent } from '../../types/chat.types';
import logger from '../../core/logger';
import { isRagEffective } from '../rag/rag.policy';
import providersConfig from '../../core/providers.config';
import { getDatabasePort } from '../../core/pg';

const chatControllerLogger = logger.scoped('ChatController');

type ChatUser = {
  username: string;
  category?: string;
  allowed_categories?: string[];
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
  provider?: string;
  rag_allowed?: boolean | number;
  rag_enabled?: boolean | number;
  sandbox_enabled?: boolean | number;
};

class ChatController {
  async handleCompletion(req: ChatRequest, res: Response) {
    const { user, body } = req;

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
        // Свежая проверка баланса перед вызовом модели (аналогично heavy path в chat.service.ts)
        if (!user.is_admin) {
          const db = getDatabasePort();
          const fresh = await db.get<{ balance_usd: number | string; credit_limit_usd?: number | string; is_blocked: boolean }>(
            'SELECT balance_usd, credit_limit_usd, is_blocked FROM users WHERE username = @username',
            { username: user.username }
          );
          if (fresh) {
            assertUserCanSpendFunds(fresh);
          }
        }

        const stream = await fastChatService.handleFastCompletion({ user, body, catSettings });
        return this._streamToResponse(stream, res, catSettings, body.stream, user, body);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        chatControllerLogger.error('Chat completion failed', { message });
        traceBus.emitTrace('ChatController', 'model.failed', {
          providerId: String(catSettings.provider || 'unknown'),
          error: message,
        });
        return writeErrorResponse(err, res);
      }
    }

    return chatService.handleCompletion({ user, body, catSettings, res, missionId });
  }

  async _streamToResponse(stream: AsyncIterable<StreamEvent>, res: Response, catSettings: CategorySettings, isStreaming: boolean | undefined, user: ChatUser, body: ChatBody) {
    const ac = new AbortController();
    const reqCloseHandler = () => ac.abort();
    res.req.on('close', reqCloseHandler);

    const startTimestamp = Date.now();

    try {
      const result = await writeChatCompletionStream({ stream, res, modelName: catSettings?.model_name || 'default', isStreaming });
      const providerCfg = providersConfig[result.providerId] || {};

      await recordUsageAndCost(
        buildRecordUsageParams({
          user,
          result,
          providerCfg,
          catSettings,
          body,
          source: 'fast path',
        })
      );

      traceBus.emitTrace('ChatController', 'model.completed', {
        providerId: result.providerId,
        modelName: catSettings?.model_name || 'default',
        latencyMs: Date.now() - startTimestamp,
        costUsd: result.usage?.cost_usd,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      chatControllerLogger.error('Chat completion failed', { message });
      traceBus.emitTrace('ChatController', 'model.failed', {
        providerId: String(catSettings.provider || 'unknown'),
        error: message,
      });
      writeErrorResponse(err, res);
    } finally {
      res.req.off('close', reqCloseHandler);
    }
  }
}

export = new ChatController();

