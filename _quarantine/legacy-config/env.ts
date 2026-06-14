import path from 'path';
import { z } from 'zod';
import dotenv from 'dotenv';
import logger = require('../../src/core/logger.js');

const ROOT_DIR = path.resolve(__dirname, '../../');
const envLogger = logger.scoped('EnvConfig');

// Load environment variables
const envPath = path.join(ROOT_DIR, '.env');
dotenv.config({ path: envPath });

const envSchema = z.object({
  AVGEXPERT_PORT: z.coerce.number().default(8200),
  AVGEXPERT_SECRET: z.string().min(32, 'AVGEXPERT_SECRET must be at least 32 characters long'),
  AVGEXPERT_TOKEN_EXPIRY: z.string().default('7d'),
  AVGEXPERT_ADMIN_PASSWORD: z.string().optional(),
  AVGEXPERT_ALLOWED_ORIGINS: z.string().optional().default(''),
  AVGEXPERT_PROVIDER_TIMEOUT: z.coerce.number().default(60000),
  AVGEXPERT_TEST_TIMEOUT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  envLogger.error('Invalid environment variables', { validation: parsedEnv.error.format() });
  process.exit(1);
}

export const env = parsedEnv.data;

export const config = {
  PORT: env.AVGEXPERT_PORT,
  SECRET: env.AVGEXPERT_SECRET,
  TOKEN_EXPIRY: env.AVGEXPERT_TOKEN_EXPIRY,
  PROVIDER_TIMEOUT: env.AVGEXPERT_PROVIDER_TIMEOUT,
  TEST_TIMEOUT: env.AVGEXPERT_TEST_TIMEOUT,
  DATA_DIR: env.NODE_ENV === 'test' 
    ? path.join(ROOT_DIR, 'data_test') 
    : path.join(ROOT_DIR, 'data'),
  WEBUI_DIR: path.join(ROOT_DIR, 'webui_src'),
  isDev: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',
  allowedOrigins: env.AVGEXPERT_ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
};
