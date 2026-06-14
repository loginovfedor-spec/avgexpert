/**
 * Helper Utilities
 */

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const USERNAME_MESSAGE = 'Имя пользователя может содержать только английские буквы, цифры, _ и -';

type ValidationResult = { ok: true } | { ok: false; message: string };
type MutableRecord = Record<string, unknown>;
type AppErrorLike = Error & {
  status?: number;
  code?: string;
};

function validateUsername(value: unknown, minLength: number = 3): ValidationResult {
  if (typeof value !== 'string') return { ok: false, message: 'Имя пользователя обязательно' };
  if (value.length < minLength) return { ok: false, message: `Имя пользователя должно содержать не менее ${minLength} символов` };
  if (value.length > 64) return { ok: false, message: 'Имя пользователя должно содержать не более 64 символов' };
  if (!USERNAME_PATTERN.test(value)) return { ok: false, message: USERNAME_MESSAGE };
  return { ok: true };
}

function assertSafeIdentifier(value: unknown, field: string): string {
  const result = validateUsername(value);
  if (!result.ok) {
    const err = new Error(field === 'username' ? result.message : `${field} contains invalid characters or has invalid length`) as AppErrorLike;
    err.status = 400;
    throw err;
  }
  return value as string;
}

/**
 * Merge only defined (not `undefined`) fields from `source` into `target`.
 * Avoids repetitive `if (x !== undefined) target.x = x;` blocks.
 */
function mergeFields(target: MutableRecord, source: MutableRecord, keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }
}

/**
 * Strict URL validation for SSRF Protection.
 * @param {string} endpointUrl - The URL to validate
 * @param {boolean} allowLocal - Whether to allow private IPs/localhost (for local providers)
 */
function validateProviderUrl(endpointUrl: unknown, allowLocal: boolean = false) {
  if (process.env.ALLOW_CUSTOM_PROVIDER_URLS === 'true') return;
  if (!endpointUrl) return;

  try {
    const urlObj = new URL(String(endpointUrl));
    const host = urlObj.hostname.toLowerCase();

    // 1. Check common public providers allowlist
    const publicAllowList = [
      'api.openai.com',
      'api.anthropic.com',
      'generativelanguage.googleapis.com',
      'api.deepseek.com',
      'api.x.ai',
      'api.qwen.ai',
      'api.groq.com',
      'api.mistral.ai'
    ];
    if (publicAllowList.includes(host)) return;

    // Docker Compose internal egress (Envoy, local Llama)
    const dockerInternalAllowList = ['envoy', 'llama-cpp'];
    if (dockerInternalAllowList.includes(host)) return;

    // 2. Check for private/localhost if not explicitly allowed
    if (!allowLocal) {
      // Basic hostname checks
      const isLocalhost = host === 'localhost' || host === 'localhost.localdomain' || host.endsWith('.localhost');
      
      // IPv4 private ranges and loopback
      const isIPv4Private = 
        host === '127.0.0.1' || 
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('169.254.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);

      // IPv6 private ranges and loopback
      const isIPv6Private = 
        host === '::1' || 
        host === '[::1]' ||
        host.startsWith('fe80:') || 
        host.startsWith('fc00:') || 
        host.startsWith('fd00:') ||
        host.includes(':ffff:127.0.0.1') ||
        host.includes(':ffff:7f00:1');

      // Common DNS-based bypasses (nip.io, sslip.io, etc.)
      const isDnsBypass = 
        host.includes('.127.0.0.1.') || 
        host.includes('.10.0.0.') || 
        host.endsWith('.nip.io') || 
        host.endsWith('.sslip.io');

      if (isLocalhost || isIPv4Private || isIPv6Private || isDnsBypass) {
        const err = new Error(`SSRF Protection: Host ${host} is forbidden for external providers.`) as AppErrorLike;
        err.status = 403;
        err.code = 'ssrf_blocked';
        throw err;
      }
    }
  } catch (e: unknown) {
    const caught = e as AppErrorLike;
    if (caught.code === 'ssrf_blocked') throw caught;
    const err = new Error('Invalid URL format or SSRF block') as AppErrorLike;
    err.status = 400;
    throw err;
  }
}

function sanitizePromptText(text: unknown): string {
  if (typeof text !== 'string') return '';
  
  const controlTokens = /<\|im_start\|>|<\|im_end\|>|<\|system\|>|<\|user\|>|<\|assistant\|>|<\|endoftext\|>|\[INST\]|\[\/INST\]|<<SYS>>|<\/SYS>>/gi;
  return text.replace(controlTokens, '').trim();
}

export {
  assertSafeIdentifier,
  validateUsername,
  USERNAME_MESSAGE,
  mergeFields,
  validateProviderUrl,
  sanitizePromptText,
};
