import type { Response } from 'express';
import mapper from './chat_completion.mapper';
import type { ModelUsage, StreamEvent } from '../../types/chat.types';

type WriteChatCompletionStreamParams = {
  stream: AsyncIterable<StreamEvent>;
  res: Response;
  modelName?: string;
  isStreaming?: boolean;
  retrievalResult?: unknown;
};

type WriteChatCompletionStreamResult = {
  providerId: string;
  providerInfo: StreamEvent | null;
  fullText: string;
  usage: ModelUsage | null;
  finishReason: string;
};

type ErrorLike = Error & {
  status?: number;
  code?: string;
  details?: unknown;
};

function ensureSseHeaders(res: Response): void {
  if (res.headersSent) return;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
}

async function writeChatCompletionStream({
  stream,
  res,
  modelName = 'default',
  isStreaming = false,
  retrievalResult = null,
}: WriteChatCompletionStreamParams): Promise<WriteChatCompletionStreamResult> {
  let fullText = '';
  let finalUsage: ModelUsage | null = null;
  let finalFinishReason = 'stop';
  let providerInfo: StreamEvent | null = null;

  for await (const event of stream) {
    if (event.type === 'provider_selected') {
      providerInfo = event;
      continue;
    }

    if (isStreaming) {
      ensureSseHeaders(res);

      if (event.type === 'delta') {
        const chunk = mapper.buildChunk(modelName, event.text);
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      } else if (event.type === 'tool_call') {
        const chunk = mapper.buildChunk(modelName, null, null, event.toolCall);
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      } else if (event.type === 'done') {
        finalUsage = event.usage ?? null;
        finalFinishReason = event.finishReason || 'stop';
        const chunk = mapper.buildChunk(modelName, '', finalFinishReason);
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        break;
      }
    } else if (event.type === 'delta') {
      fullText += event.text || '';
    } else if (event.type === 'done') {
      finalUsage = event.usage ?? null;
      finalFinishReason = event.finishReason || 'stop';
    }
  }

  if (isStreaming) {
    res.end();
  } else {
    const responseData = mapper.buildResponse(
      modelName,
      fullText,
      finalUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    ) as Record<string, unknown>;
    const choices = responseData.choices as Array<Record<string, unknown>>;
    choices[0].finish_reason = finalFinishReason;

    if (retrievalResult) {
      responseData._retrieval = retrievalResult;
    }

    res.json(responseData);
  }

  return {
    providerId: providerInfo?.providerId || 'unknown',
    providerInfo,
    fullText,
    usage: finalUsage,
    finishReason: finalFinishReason,
  };
}

/**
 * Единая функция отправки ошибки клиенту.
 * Поддерживает как SSE (headersSent), так и обычный JSON.
 */
function writeErrorResponse(err: unknown, res: Response): void {
  const error = (err instanceof Error ? err : new Error(String(err))) as ErrorLike;
  const status = error.status || 502;
  const errorPayload = {
    error: {
      code: error.code || 'provider_error',
      message: error.message,
      details: error.details || null,
    },
  };

  if (res.headersSent) {
    res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } else {
    res.status(status).json(errorPayload);
  }
}

export { writeChatCompletionStream, writeErrorResponse };
