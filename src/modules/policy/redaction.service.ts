export class RedactionService {
  /**
   * Redacts sensitive information from the provided data.
   */
  static redact(data: unknown): unknown {
    if (!data) return data;
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return JSON.stringify(this.redactObject(parsed));
      } catch (_e) {
        return this.redactString(data);
      }
    }
    if (typeof data === 'object') {
      return this.redactObject(data);
    }
    return data;
  }

  private static redactString(value: string): string {
    return value
      .replace(/(api[_-]?key\s*[:=]\s*["']?)([^"'\s,;]+)/gi, '$1[REDACTED_SECRET]')
      .replace(/\bBearer\s+([A-Za-z0-9._~+/-]+=*)/gi, 'Bearer [REDACTED]');
  }

  private static redactObject(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return obj.map(item => this.redactObject(item));
    }
    if (obj !== null && typeof obj === 'object') {
      const copy: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
      const sensitiveKeys = ['password', 'token', 'api_key', 'apikey', 'secret', 'authorization'];
      for (const key of Object.keys(copy)) {
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
          copy[key] = '[REDACTED]';
        } else if (typeof copy[key] === 'string') {
          copy[key] = this.redactString(copy[key]);
        } else if (typeof copy[key] === 'object') {
          copy[key] = this.redactObject(copy[key]);
        }
      }
      return copy;
    }
    return obj;
  }
}

