import nodeCrypto from 'crypto';
import { SECRET } from './config';
import logger from './logger';
const cryptoLogger = logger.scoped('Crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const KEY = nodeCrypto.scryptSync(SECRET, 'salt-avgexpert-v1', 32);

function encrypt(text: string | null | undefined): string | null {
  if (!text) return null;

  const iv = nodeCrypto.randomBytes(IV_LENGTH);
  const cipher = nodeCrypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const tag = cipher.getAuthTag().toString('base64');

  return `${iv.toString('base64')}.${encrypted}.${tag}`;
}

function decrypt(encryptedData: string | null | undefined): string | null {
  if (!encryptedData) return null;

  try {
    const [ivB64, contentB64, tagB64] = encryptedData.split('.');
    if (!ivB64 || !contentB64 || !tagB64) return encryptedData;

    const iv = Buffer.from(ivB64, 'base64');
    const content = Buffer.from(contentB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');

    const decipher = nodeCrypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(content, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    cryptoLogger.error('Decryption failed', { message });
    return null;
  }
}

function maskKey(key: string | null | undefined): string {
  if (!key || typeof key !== 'string') return '';
  if (key.length <= 8) return '****';

  const prefix = key.slice(0, 3);
  const suffix = key.slice(-4);
  return `${prefix}-...${suffix}`;
}

export = {
  encrypt,
  decrypt,
  maskKey,
};
