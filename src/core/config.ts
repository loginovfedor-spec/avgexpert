/**
 * Application Configuration
 * Centralized constants, paths, and environment settings.
 */
const path = require('path');
const fs = require('fs');
const { z } = require('zod');
const logger = require('./logger').scoped('Config');

// Base directory (root of the project)
const ROOT_DIR = path.resolve(__dirname, '../../');

// 1. Load Environment Variables
const envPath = path.join(ROOT_DIR, '.env');
require('dotenv').config({ path: envPath });

// 2. Validate Environment Variables
const envSchema = z.object({
  AVGEXPERT_PORT: z.string().transform(Number).default('8200'),
  AVGEXPERT_SECRET: z.string().min(32, 'AVGEXPERT_SECRET must be at least 32 characters long'),
  AVGEXPERT_TOKEN_EXPIRY: z.string().default('7d'),
  AVGEXPERT_ADMIN_PASSWORD: z.string().optional(),
  AVGEXPERT_ALLOWED_ORIGINS: z.string().optional().default(''),
  AVGEXPERT_PROVIDER_TIMEOUT: z.string().transform(Number).default('60000'),
  AVGEXPERT_TEST_TIMEOUT: z.string().transform(Number).default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  E2B_API_KEY: z.string().optional(),
  // Provider variables
  LLAMACPP_URL: z.string().optional(),
  LLAMACPP_API_KEY: z.string().optional(),
  OPENAI_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DEEPSEEK_URL: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  QWEN_URL: z.string().optional(),
  QWEN_API_KEY: z.string().optional(),
  GROK_URL: z.string().optional(),
  GROK_API_KEY: z.string().optional(),
  // Feature Flags
  SEMANTIC_LAYER_ENABLED: z.string().transform((v: string) => v === 'true').default('false'),
  AGENT_RUNS_ENABLED: z.string().transform((v: string) => v === 'true').default('false'),
  MODEL_GATEWAY_ENABLED: z.string().transform((v: string) => v === 'true').default('false'),
  LITELLM_ENABLED: z.string().transform((v: string) => v === 'true').default('false'),
  KNOWLEDGE_GATEWAY_ENABLED: z.string().transform((v: string) => v === 'true').default('false'),
  TOOL_GATEWAY_ENABLED: z.string().transform((v: string) => v === 'true').default('false'),
  SANDBOX_FORGE_ENABLED: z.string().transform((v: string) => v === 'true').default('false'),
  TEMPORAL_RUNTIME_ENABLED: z.string().transform((v: string) => v === 'true').default('false'),
  RAG_V2_ENABLED: z.string().default('false').transform((v: string) => v === 'true'),
  CONVERSATION_MAX_TOKENS: z.string().transform(Number).default('100000'),
  KB_USER_MAX_DOCS: z.string().transform(Number).default('0'),
  KB_USER_MAX_FILE_BYTES: z.string().transform(Number).default('5242880'),
  // Vector KB (RAG v2 foundation)
  EMBEDDING_PROVIDER: z.string().default('self-hosted'),
  EMBEDDING_MODEL: z.string().default('bge-m3'),
  EMBEDDING_DIMS: z.string().transform(Number).default('1024'),
  EMBEDDING_NAMESPACE: z.string().default('bge-m3-v1'),
  EMBEDDING_API_URL: z.string().optional(),
  EMBEDDING_API_FORMAT: z.enum(['tei', 'custom']).default('tei'),
  EMBEDDING_QUERY_PREFIX: z.string().optional(),
  EMBEDDING_ONNX_PATH: z.string().optional(),
  VECTOR_EMBEDDING_CONFIG: z.string().default('bge_m3'),
  EMBEDDING_MOCK: z.string().default('false').transform((v: string) => v === 'true'),
  VECTOR_STORE: z.string().default('pgvector'),
  DATABASE_URL: z.string().optional(),
  PG_URL: z.string().optional(),
  TEMPORAL_URL: z.string().default('localhost:7233'),
  PUBLIC_BASE_URL: z.string().optional().default(''),
  ROBOKASSA_MERCHANT_LOGIN: z.string().optional().default(''),
  ROBOKASSA_PASSWORD1: z.string().optional().default(''),
  ROBOKASSA_PASSWORD2: z.string().optional().default(''),
  ROBOKASSA_TEST_PASSWORD1: z.string().optional().default(''),
  ROBOKASSA_TEST_PASSWORD2: z.string().optional().default(''),
  ROBOKASSA_HASH_ALGO: z.enum(['md5', 'sha256']).default('md5'),
  ROBOKASSA_IS_TEST: z.string().transform((v: string) => v === 'true' || v === '1').default('true'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  logger.error('Invalid environment variables', { validation: parsedEnv.error.format() });
  process.exit(1);
}

const env = parsedEnv.data;

// 2.5 Production Safety Hardening
if (env.NODE_ENV === 'production') {
  // Fail if admin password is missing in production
  if (!env.AVGEXPERT_ADMIN_PASSWORD) {
    logger.error('AVGEXPERT_ADMIN_PASSWORD is required in production mode', { policy: 'no_auto_generated_admin_password' });
    process.exit(1);
  }

  if (!env.KNOWLEDGE_GATEWAY_ENABLED) {
    logger.error('KNOWLEDGE_GATEWAY_ENABLED=true is required in production mode', { policy: 'rag_must_be_explicitly_enabled' });
    process.exit(1);
  }

  // Fail if sandbox is enabled but E2B key is missing in production
  if (env.SANDBOX_FORGE_ENABLED && !env.E2B_API_KEY) {
    logger.error('SANDBOX_FORGE_ENABLED is true, but E2B_API_KEY is missing', { policy: 'no_local_sandbox_adapter_in_production' });
    process.exit(1);
  }
}

// 3. Constants & Paths
const PORT = env.AVGEXPERT_PORT;
const SECRET = env.AVGEXPERT_SECRET;
const TOKEN_EXPIRY = env.AVGEXPERT_TOKEN_EXPIRY;
const PROVIDER_TIMEOUT = env.AVGEXPERT_PROVIDER_TIMEOUT;
const TEST_TIMEOUT = env.AVGEXPERT_TEST_TIMEOUT;

const DATA_DIR = env.NODE_ENV === 'test' 
  ? path.join(ROOT_DIR, 'data_test') 
  : path.join(ROOT_DIR, 'data');

const WEBUI_SOURCE_DIR = path.join(ROOT_DIR, 'webui_src');
const WEBUI_DIST_DIR = path.join(ROOT_DIR, 'webui_dist');

if (env.NODE_ENV === 'production' && !fs.existsSync(WEBUI_DIST_DIR)) {
  console.error(
    '[FATAL] webui_dist not found. Run "npm run build:web" before starting in production mode. ' +
    'Falling back to webui_src would serve unbundled sources — all CDN dependencies have been removed.'
  );
  process.exit(1);
}

const WEBUI_DIR = env.NODE_ENV === 'production'
  ? WEBUI_DIST_DIR
  : (fs.existsSync(WEBUI_DIST_DIR) ? WEBUI_DIST_DIR : WEBUI_SOURCE_DIR);

const LLAMA_DEFAULT_URL = 'http://127.0.0.1:8201';

// 4. Chat & Provider Configuration
const ALLOWED_EXTRA_PARAMS = {
  USER: ['response_format', 'tools', 'reasoning', 'collection_ids', 'vector_store_ids', 'enable_search', 'prompt', 'store', 'include'],
  ADMIN: ['tools', 'tool_choice', 'reasoning', 'response_format', 'metadata', 'collection_ids', 'vector_store_ids', 'enable_search', 'prompt', 'store', 'include']
};

const DEFAULT_CATEGORY_PARAMS = {
  provider: 'openai',
  model_name: 'gpt-4o-mini',
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  min_p: 0.05,
  repeat_penalty: 1.1,
  input_context_default: 1000000,
  input_context_max: 1000000,
  max_tokens: 1024,
  system_prompt: '',
};

const DEFAULT_SYSTEM_PROMPT = 'Ты — профессиональный консультационный ИИ-ассистент. Твоя задача — предоставлять точные, полезные и понятные ответы на вопросы пользователей. Отвечай вежливо, по существу, адаптируя стиль общения под контекст вопроса. Если вопрос требует уточнения, задавай дополнительные вопросы для лучшего понимания потребности пользователя.';

// Feature Flags
const FEATURE_FLAGS = {
  SEMANTIC_LAYER_ENABLED: env.SEMANTIC_LAYER_ENABLED,
  AGENT_RUNS_ENABLED: env.AGENT_RUNS_ENABLED,
  MODEL_GATEWAY_ENABLED: env.MODEL_GATEWAY_ENABLED,
  LITELLM_ENABLED: env.LITELLM_ENABLED,
  KNOWLEDGE_GATEWAY_ENABLED: env.KNOWLEDGE_GATEWAY_ENABLED,
  TOOL_GATEWAY_ENABLED: env.TOOL_GATEWAY_ENABLED,
  SANDBOX_FORGE_ENABLED: env.SANDBOX_FORGE_ENABLED,
  TEMPORAL_RUNTIME_ENABLED: env.TEMPORAL_RUNTIME_ENABLED,
  RAG_V2_ENABLED: env.RAG_V2_ENABLED,
};
const {
  SEMANTIC_LAYER_ENABLED,
  AGENT_RUNS_ENABLED,
  MODEL_GATEWAY_ENABLED,
  LITELLM_ENABLED,
  KNOWLEDGE_GATEWAY_ENABLED,
  TOOL_GATEWAY_ENABLED,
  SANDBOX_FORGE_ENABLED,
  TEMPORAL_RUNTIME_ENABLED,
  RAG_V2_ENABLED,
} = FEATURE_FLAGS;
const CONVERSATION_MAX_TOKENS = env.CONVERSATION_MAX_TOKENS;
const KB_USER_MAX_DOCS = env.KB_USER_MAX_DOCS > 0 ? env.KB_USER_MAX_DOCS : undefined;
const KB_USER_MAX_FILE_BYTES = env.KB_USER_MAX_FILE_BYTES;

module.exports = {
  PORT,
  SECRET,
  TOKEN_EXPIRY,
  PROVIDER_TIMEOUT,
  TEST_TIMEOUT,
  DATA_DIR,
  WEBUI_DIR,
  WEBUI_SOURCE_DIR,
  WEBUI_DIST_DIR,
  LLAMA_DEFAULT_URL,
  ALLOWED_EXTRA_PARAMS,
  DEFAULT_CATEGORY_PARAMS,
  DEFAULT_SYSTEM_PROMPT,
  SEMANTIC_LAYER_ENABLED,
  AGENT_RUNS_ENABLED,
  MODEL_GATEWAY_ENABLED,
  LITELLM_ENABLED,
  KNOWLEDGE_GATEWAY_ENABLED,
  TOOL_GATEWAY_ENABLED,
  SANDBOX_FORGE_ENABLED,
  TEMPORAL_RUNTIME_ENABLED,
  RAG_V2_ENABLED,
  CONVERSATION_MAX_TOKENS,
  KB_USER_MAX_DOCS,
  KB_USER_MAX_FILE_BYTES,
  TEMPORAL_URL: env.TEMPORAL_URL,
  FEATURE_FLAGS,
  isDev: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',
  allowedOrigins: env.AVGEXPERT_ALLOWED_ORIGINS.split(',').map((s: string) => s.trim()).filter(Boolean),
  publicBaseUrl: env.PUBLIC_BASE_URL,
  robokassa: {
    merchantLogin: env.ROBOKASSA_MERCHANT_LOGIN,
    password1: env.ROBOKASSA_IS_TEST ? env.ROBOKASSA_TEST_PASSWORD1 : env.ROBOKASSA_PASSWORD1,
    password2: env.ROBOKASSA_IS_TEST ? env.ROBOKASSA_TEST_PASSWORD2 : env.ROBOKASSA_PASSWORD2,
    hashAlgo: env.ROBOKASSA_HASH_ALGO,
    isTest: env.ROBOKASSA_IS_TEST,
  },
  vector: {
    EMBEDDING_PROVIDER: env.EMBEDDING_PROVIDER,
    EMBEDDING_MODEL: env.EMBEDDING_MODEL,
    EMBEDDING_DIMS: env.EMBEDDING_DIMS,
    EMBEDDING_NAMESPACE: env.EMBEDDING_NAMESPACE,
    EMBEDDING_API_URL: env.EMBEDDING_API_URL || env.EMBEDDING_ONNX_PATH,
    EMBEDDING_API_FORMAT: env.EMBEDDING_API_FORMAT,
    EMBEDDING_QUERY_PREFIX: env.EMBEDDING_QUERY_PREFIX,
    VECTOR_EMBEDDING_CONFIG: env.VECTOR_EMBEDDING_CONFIG,
    EMBEDDING_MOCK: env.EMBEDDING_MOCK,
    VECTOR_STORE: env.VECTOR_STORE,
    DATABASE_URL: env.DATABASE_URL || env.PG_URL,
  },
  providerEnv: {
    LLAMACPP_URL: env.LLAMACPP_URL,
    LLAMACPP_API_KEY: env.LLAMACPP_API_KEY,
    OPENAI_URL: env.OPENAI_URL,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    DEEPSEEK_URL: env.DEEPSEEK_URL,
    DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY,
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    QWEN_URL: env.QWEN_URL,
    QWEN_API_KEY: env.QWEN_API_KEY,
    GROK_URL: env.GROK_URL,
    GROK_API_KEY: env.GROK_API_KEY
  }
};
