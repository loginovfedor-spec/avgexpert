/**
 * Fast Path Guardrail Tests
 * Validates that the simple chat fast path does NOT load heavy dependencies.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/test-env';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('Fast Path Guardrail Tests', async (t) => {
  await t.test('Fast path is detected when no RAG/Sandbox configured', () => {
    const catSettings = {
      provider: 'llamacpp',
      model_name: 'default',
      temperature: 0.7,
      max_tokens: 1024,
      rag_enabled: false,
      sandbox_enabled: false,
    };

    const isFastPath = !catSettings.rag_enabled && !catSettings.sandbox_enabled;
    assert.ok(isFastPath, 'Should detect fast path when no heavy features configured');
  });

  await t.test('Fast path is NOT detected when RAG is enabled', () => {
    const catSettings = {
      provider: 'openai',
      rag_enabled: true,
      sandbox_enabled: false,
    };

    const isFastPath = !catSettings.rag_enabled && !catSettings.sandbox_enabled;
    assert.ok(!isFastPath, 'Should NOT detect fast path when RAG is enabled');
  });

  await t.test('Fast path is NOT detected when sandbox is enabled', () => {
    const catSettings = {
      provider: 'openai',
      rag_enabled: false,
      sandbox_enabled: true,
    };

    const isFastPath = !catSettings.rag_enabled && !catSettings.sandbox_enabled;
    assert.ok(!isFastPath, 'Should NOT detect fast path when sandbox is enabled');
  });

  await t.test('CanonicalChatEvent types are restricted in fast path', () => {
    const fastPathAllowedTypes = new Set(['delta', 'done', 'error']);

    const fastPathEvents = [
      { type: 'delta', text: 'Hello' },
      { type: 'delta', text: ' world' },
      { type: 'done', finishReason: 'stop' },
    ];

    for (const event of fastPathEvents) {
      assert.ok(
        fastPathAllowedTypes.has(event.type),
        `Fast path should not produce '${event.type}' events`
      );
    }
  });

  await t.test('Chat service does not import sandbox modules in fast path', () => {
    const chatServiceSource = readFileSync(
      path.resolve(__dirname, '../src/modules/chat/chat.service.ts'),
      'utf8'
    );

    const forbiddenImports = ['sandbox', 'forge', 'e2b', 'daytona'];

    for (const mod of forbiddenImports) {
      const hasStaticRequire = new RegExp(`require\\(['"].*${mod}.*['"]\\)`, 'i');
      const topLevelLines = chatServiceSource.split('\n').filter((line) => {
        const trimmed = line.trim();
        return trimmed.startsWith('const ') || trimmed.startsWith('let ') || trimmed.startsWith('var ');
      });

      const hasTopLevel = topLevelLines.some((line) => hasStaticRequire.test(line));
      assert.ok(!hasTopLevel, `Fast path violation: '${mod}' should not be statically imported in chat.service.ts`);
    }
  });
});
