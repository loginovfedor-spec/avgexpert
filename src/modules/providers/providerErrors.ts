export class ProviderError extends Error {
  status: number;
  code: string;
  isRetryable: boolean;
  details: unknown;

  constructor(message: string, status: number = 502, code: string = 'provider_error', isRetryable: boolean = false, details: unknown = null) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.code = code;
    this.isRetryable = isRetryable;
    this.details = details;
  }
}
