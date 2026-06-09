import fs = require('fs');
import path = require('path');
import dotenv = require('dotenv');
import { getAdapterConfig } from '../../providers/configLoader';

const CONFIG_DIR = path.join(__dirname, '../../providers/config');

function readConnectionFromProviderConfig(providerId: string): string | null {
  const adapterConfig = getAdapterConfig(providerId);
  const url = adapterConfig.DATABASE_URL || adapterConfig.PG_URL;
  return typeof url === 'string' && url.trim() !== '' ? url.trim() : null;
}

function readConnectionFromAnyProviderConfig(): string | null {
  if (!fs.existsSync(CONFIG_DIR)) return null;

  for (const file of fs.readdirSync(CONFIG_DIR).filter(name => name.endsWith('.env'))) {
    try {
      const parsed = dotenv.parse(fs.readFileSync(path.join(CONFIG_DIR, file), 'utf8'));
      const url = parsed.DATABASE_URL || parsed.PG_URL;
      if (url && url.trim() !== '') return url.trim();
    } catch {
      // skip broken config files
    }
  }
  return null;
}

/**
 * Источники (по приоритету):
 * 1. process.env.DATABASE_URL / PG_URL
 * 2. providers/config/{VECTOR_PG_PROVIDER}.env (default: yandex_file_search)
 * 3. любой *.env в providers/config с DATABASE_URL
 */
export function resolvePgConnectionString(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (env.DATABASE_URL?.trim()) return env.DATABASE_URL.trim();
  if (env.PG_URL?.trim()) return env.PG_URL.trim();

  const providerId = env.VECTOR_PG_PROVIDER || 'yandex_file_search';
  const fromPreferred = readConnectionFromProviderConfig(providerId);
  if (fromPreferred) return fromPreferred;

  return readConnectionFromAnyProviderConfig();
}

module.exports = { resolvePgConnectionString };
