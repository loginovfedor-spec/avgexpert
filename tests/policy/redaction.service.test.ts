import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RedactionService } from '../../src/modules/policy/redaction.service';

describe('RedactionService', () => {
  it('should redact secrets in string', () => {
    const input = 'Here is my key: api_key="sk-1234567890abcdef123" and Bearer token12345.';
    const result = RedactionService.redact(input) as string;
    assert.match(result, /\[REDACTED_SECRET\]/);
    assert.doesNotMatch(result, /sk-1234567890abcdef123/);
    assert.match(result, /Bearer \[REDACTED\]/);
  });

  it('should redact secrets in objects', () => {
    const input = {
      message: 'Hello',
      password: 'mySecretPassword123',
      nested: {
        token: 'Bearer xyz',
        apiKey: 'sk-123',
      },
    };
    const result = RedactionService.redact(input) as {
      message: string;
      password: string;
      nested: { token: string; apiKey: string };
    };
    assert.strictEqual(result.message, 'Hello');
    assert.strictEqual(result.password, '[REDACTED]');
    assert.strictEqual(result.nested.token, '[REDACTED]');
    assert.strictEqual(result.nested.apiKey, '[REDACTED]');
  });
});
