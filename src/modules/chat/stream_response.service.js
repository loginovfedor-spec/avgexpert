const mapper = require('./chat_completion.mapper');

function ensureSseHeaders(res) {
  if (res.headersSent) return;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
}

async function writeChatCompletionStream({
  stream,
  res,
  modelName = 'default',
  isStreaming = false,
  retrievalResult = null
}) {
  let fullText = '';
  let finalUsage = null;
  let finalFinishReason = 'stop';
  let providerInfo = null;

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
        finalUsage = event.usage;
        finalFinishReason = event.finishReason || 'stop';
        const chunk = mapper.buildChunk(modelName, '', finalFinishReason);
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        break;
      }
    } else {
      if (event.type === 'delta') {
        fullText += event.text;
      } else if (event.type === 'done') {
        finalUsage = event.usage;
        finalFinishReason = event.finishReason || 'stop';
      }
    }
  }

  if (isStreaming) {
    res.end();
  } else {
    const responseData = mapper.buildResponse(
      modelName,
      fullText,
      finalUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    );
    responseData.choices[0].finish_reason = finalFinishReason;

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
    finishReason: finalFinishReason
  };
}

module.exports = { writeChatCompletionStream };
