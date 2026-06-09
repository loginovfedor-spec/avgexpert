type FallbackError = {
  type?: string;
  message?: string;
  statusCode?: number;
  status?: number;
  code?: string;
  isRetryable?: boolean;
  cause?: unknown;
};

function causeCode(cause: unknown): string {
  if (cause && typeof cause === 'object' && 'code' in cause) {
    const code = (cause as { code?: unknown }).code;
    return typeof code === 'string' ? code : '';
  }
  return '';
}

class FallbackPolicy {
  shouldFallback(err: Partial<FallbackError> | null | undefined): boolean {
    if (!err) return false;
    
    if (err.isRetryable === true) return true;

    const status = err.status || err.statusCode;
    let message = (err.message || '').toLowerCase();
    const isGeoblock = status === 403 && (
      message.includes('country') ||
      message.includes('region') ||
      message.includes('territory') ||
      message.includes('not supported') ||
      message.includes('not_supported')
    );

    if (status) {
      if ([408, 429, 500, 502, 503, 504].includes(status) || isGeoblock) return true;
      if (status < 500) return false; 
    }
    
    const code = err.code || causeCode(err.cause) || '';
    if (['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'fetch failed'].includes(code)) {
      return true;
    }
    
    message = (err.message || '').toLowerCase();
    if (
      message.includes('timeout') || 
      message.includes('network error') || 
      message.includes('fetch failed') ||
      message.includes('connection refused')
    ) {
      return true;
    }

    return false;
  }
}

export = new FallbackPolicy();
