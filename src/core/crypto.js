const crypto = require('crypto');
const { SECRET } = require('./config');
const logger = require('./logger').scoped('Crypto');

/**
 * AES-256-GCM encryption/decryption service.
 * Uses AVGEXPERT_SECRET to derive a 32-byte key.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

// Derive a 32-byte key from the SECRET
const KEY = crypto.scryptSync(SECRET, 'salt-avgexpert-v1', 32);

/**
 * Encrypts a string.
 * Returns format: iv.content.tag (base64 encoded parts)
 */
function encrypt(text) {
  if (!text) return null;
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const tag = cipher.getAuthTag().toString('base64');
  
  return `${iv.toString('base64')}.${encrypted}.${tag}`;
}

/**
 * Decrypts a string in the format: iv.content.tag
 */
function decrypt(encryptedData) {
  if (!encryptedData) return null;
  
  try {
    const [ivB64, contentB64, tagB64] = encryptedData.split('.');
    if (!ivB64 || !contentB64 || !tagB64) return encryptedData; // Return as is if not encrypted format (for migration)

    const iv = Buffer.from(ivB64, 'base64');
    const content = Buffer.from(contentB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(content, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    logger.error('Decryption failed', { message: err.message });
    return null; 
  }
}

/**
 * Masks an API key for safe display (e.g. sk-...abcd)
 */
function maskKey(key) {
  if (!key || typeof key !== 'string') return '';
  if (key.length <= 8) return '****';
  
  const prefix = key.slice(0, 3);
  const suffix = key.slice(-4);
  return `${prefix}-...${suffix}`;
}

module.exports = {
  encrypt,
  decrypt,
  maskKey
};
