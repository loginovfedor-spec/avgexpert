import test from 'node:test';
import assert from 'node:assert/strict';
import traceBus from '../../src/modules/observability/trace.bus';
import metricsService from '../../src/modules/observability/metrics.service';

test('MetricsService aggregates requests and costs from ChatService and ChatController, ignoring ModelGateway', () => {
  const initialMetrics = metricsService.getMetrics();
  const initialRequests = initialMetrics.totalRequests;
  const initialCost = initialMetrics.costUsd;

  // 1. Отправляем легитимный трейс от ChatService
  traceBus.emitTrace('ChatService', 'model.completed', {
    costUsd: 0.0125,
    latencyMs: 150
  });

  // 2. Отправляем легитимный трейс от ChatController
  traceBus.emitTrace('ChatController', 'model.completed', {
    costUsd: 0.0075,
    latencyMs: 80
  });

  // 3. Отправляем трейс от ModelGateway (должен игнорироваться для costUsd и totalRequests)
  traceBus.emitTrace('ModelGateway', 'model.completed', {
    costUsd: 0.0200,
    latencyMs: 120
  });

  const finalMetrics = metricsService.getMetrics();

  // Должно добавиться ровно 2 запроса
  assert.equal(finalMetrics.totalRequests - initialRequests, 2);
  
  // Должно добавиться ровно 0.0125 + 0.0075 = 0.0200 USD к общей стоимости
  const costDiff = finalMetrics.costUsd - initialCost;
  assert.equal(Math.abs(costDiff - 0.0200) < 1e-9, true);
});
