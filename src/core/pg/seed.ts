import type { Pool } from 'pg';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { DEFAULT_CATEGORY_PARAMS, DEFAULT_SYSTEM_PROMPT } from '../config';
import loggerModule from '../logger';
import { discoverProviders } from '../../modules/providers/configLoader';
import { getPgPool } from './pool';

const seedLogger = loggerModule.scoped('AppPgSeed');

const VALID_TIERS = new Set(['consultant', 'expert', 'sage']);

function normalizeTier(value: string | undefined): string {
  return value && VALID_TIERS.has(value) ? value : 'consultant';
}

type CategorySeed = Record<string, unknown>;

async function upsertCategory(client: Pool | import('pg').PoolClient, category: CategorySeed): Promise<void> {
  await client.query(
    `
      INSERT INTO categories (
        name, provider, endpoint_url, model_name, api_key,
        temperature, top_p, top_k, min_p, repeat_penalty,
        input_context_default, input_context_max, max_tokens, system_prompt, extra_params,
        routing_mode, fallback_provider, yandex_folder_id, debug_mode, complexity,
        suggested_questions, sort_index, rag_allowed, retrieval_tier
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20,
        $21, $22, $23, $24
      )
      ON CONFLICT (name) DO NOTHING
    `,
    [
      category.name,
      category.provider ?? null,
      category.endpoint_url ?? null,
      category.model_name ?? null,
      category.api_key ?? null,
      category.temperature ?? null,
      category.top_p ?? null,
      category.top_k ?? null,
      category.min_p ?? null,
      category.repeat_penalty ?? null,
      category.input_context_default ?? 1000000,
      category.input_context_max ?? 1000000,
      category.max_tokens ?? null,
      category.system_prompt ?? null,
      category.extra_params ?? null,
      category.routing_mode ?? 'direct',
      category.fallback_provider ?? null,
      category.yandex_folder_id ?? null,
      category.debug_mode ?? false,
      category.complexity ?? 1.0,
      category.suggested_questions ?? '',
      category.sort_index ?? 0,
      category.rag_allowed ?? false,
      normalizeTier(category.retrieval_tier as string | undefined),
    ]
  );
}

const KB_SCOPE_EXTRA_PARAMS = JSON.stringify({
  global_kb_enabled: true,
  user_kb_enabled: true,
  session_kb_enabled: true,
});

export async function seedCategoryCatalog(options: {
  connectionString?: string;
} = {}): Promise<void> {
  const pool = getPgPool(options.connectionString);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tierByName: Record<string, string> = {
      'Консультант': 'consultant',
      'Эксперт': 'expert',
      'Мудрец': 'sage',
    };
    const defaultCategories = ['Администратор', 'Консультант', 'Эксперт', 'Мудрец'];

    for (const name of defaultCategories) {
      await upsertCategory(client, {
        name,
        ...DEFAULT_CATEGORY_PARAMS,
        system_prompt: DEFAULT_CATEGORY_PARAMS.system_prompt || null,
        retrieval_tier: tierByName[name] ?? 'consultant',
        rag_allowed: !!tierByName[name],
        sort_index: name === 'Администратор' ? 0 : name === 'Консультант' ? 10 : name === 'Эксперт' ? 20 : 30,
      });
    }

    await client.query(
      `
        UPDATE categories
        SET provider = $1, model_name = $2, rag_allowed = TRUE, retrieval_tier = 'expert', sort_index = 20
        WHERE name = 'Эксперт'
      `,
      ['openai_gpt4_1', 'gpt-4.1']
    );

    await client.query(
      `
        UPDATE categories
        SET provider = $1, model_name = $2, rag_allowed = TRUE, retrieval_tier = 'sage', sort_index = 30
        WHERE name = 'Мудрец'
      `,
      ['openai_gpt5_5', 'gpt-5.5']
    );

    const expertBase = await client.query('SELECT * FROM categories WHERE name = $1', ['Эксперт']);
    const sageBase = await client.query('SELECT * FROM categories WHERE name = $1', ['Мудрец']);
    const expertRow = expertBase.rows[0] || {};
    const sageRow = sageBase.rows[0] || {};

    const expertDefaults: CategorySeed = {
      temperature: expertRow.temperature ?? 0.7,
      top_p: expertRow.top_p ?? 0.9,
      top_k: expertRow.top_k ?? 40,
      min_p: expertRow.min_p ?? 0.05,
      repeat_penalty: expertRow.repeat_penalty ?? 1.1,
      input_context_default: expertRow.input_context_default ?? 1000000,
      input_context_max: expertRow.input_context_max ?? 1000000,
      max_tokens: expertRow.max_tokens ?? 4096,
      system_prompt: expertRow.system_prompt ?? null,
      extra_params: expertRow.extra_params ?? null,
      routing_mode: expertRow.routing_mode ?? 'direct',
      fallback_provider: expertRow.fallback_provider ?? null,
      yandex_folder_id: expertRow.yandex_folder_id ?? null,
      debug_mode: expertRow.debug_mode ?? false,
      complexity: expertRow.complexity ?? 1.5,
      suggested_questions: expertRow.suggested_questions ?? '',
      rag_allowed: true,
      retrieval_tier: 'expert',
    };

    const sageDefaults: CategorySeed = {
      temperature: sageRow.temperature ?? 0.7,
      top_p: sageRow.top_p ?? 0.9,
      top_k: sageRow.top_k ?? 40,
      min_p: sageRow.min_p ?? 0.05,
      repeat_penalty: sageRow.repeat_penalty ?? 1.1,
      input_context_default: sageRow.input_context_default ?? 1000000,
      input_context_max: sageRow.input_context_max ?? 1000000,
      max_tokens: sageRow.max_tokens ?? 8192,
      system_prompt: sageRow.system_prompt ?? null,
      extra_params: sageRow.extra_params ?? null,
      routing_mode: sageRow.routing_mode ?? 'direct',
      fallback_provider: sageRow.fallback_provider ?? null,
      yandex_folder_id: sageRow.yandex_folder_id ?? null,
      debug_mode: sageRow.debug_mode ?? false,
      complexity: sageRow.complexity ?? 2.0,
      suggested_questions: sageRow.suggested_questions ?? '',
      rag_allowed: true,
      retrieval_tier: 'sage',
    };

    const expertVariants = [
      { name: 'Эксперт (OpenAI)', provider: 'openai_gpt4_1', model_name: 'gpt-4.1', sort_index: 21 },
      { name: 'Эксперт (Grok)', provider: 'grok', model_name: 'grok-4-1-fast-reasoning', sort_index: 22 },
    ];
    const sageVariants = [
      { name: 'Мудрец (OpenAI)', provider: 'openai_gpt5_5', model_name: 'gpt-5.5', sort_index: 31 },
      { name: 'Мудрец (Grok)', provider: 'grok', model_name: 'grok-4.3', sort_index: 32 },
    ];

    for (const variant of expertVariants) {
      await upsertCategory(client, { ...expertDefaults, ...variant });
    }
    for (const variant of sageVariants) {
      await upsertCategory(client, { ...sageDefaults, ...variant });
    }

    const consultantBase = await client.query('SELECT * FROM categories WHERE name = $1', ['Консультант']);
    const consultantRow = consultantBase.rows[0] || {};
    const yandexFolderId =
      discoverProviders().yandex?.yandex_folder_id
      || consultantRow.yandex_folder_id
      || null;

    const consultantDefaults: CategorySeed = {
      temperature: consultantRow.temperature ?? 0.5,
      top_p: consultantRow.top_p ?? 0.9,
      top_k: consultantRow.top_k ?? 40,
      min_p: consultantRow.min_p ?? 0.05,
      repeat_penalty: consultantRow.repeat_penalty ?? 1.1,
      input_context_default: consultantRow.input_context_default ?? 1000000,
      input_context_max: consultantRow.input_context_max ?? 1000000,
      max_tokens: consultantRow.max_tokens ?? 1024,
      system_prompt: consultantRow.system_prompt
        ?? 'Ты — Консультант: отвечай по предоставленным материалам, на русском языке, точно и по существу. Если контекста недостаточно — явно скажи об ограничениях.',
      extra_params: consultantRow.extra_params ?? KB_SCOPE_EXTRA_PARAMS,
      routing_mode: consultantRow.routing_mode ?? 'direct',
      fallback_provider: consultantRow.fallback_provider ?? null,
      debug_mode: consultantRow.debug_mode ?? false,
      complexity: consultantRow.complexity ?? 1.0,
      suggested_questions: consultantRow.suggested_questions ?? '',
      rag_allowed: true,
      retrieval_tier: 'consultant',
    };

    const consultantVariants = [
      {
        name: 'Консультант (Yandex)',
        provider: 'yandex',
        model_name: 'aliceai-llm-flash/latest',
        yandex_folder_id: yandexFolderId,
        sort_index: 11,
      },
      {
        name: 'Консультант (OpenAI)',
        provider: 'openai_gpt4_1',
        model_name: 'gpt-4.1-mini',
        sort_index: 12,
      },
      {
        name: 'Консультант (Grok)',
        provider: 'grok',
        model_name: 'grok-4-1-fast-non-reasoning',
        sort_index: 14,
      },
    ];

    for (const variant of consultantVariants) {
      await upsertCategory(client, { ...consultantDefaults, ...variant });
    }

    await upsertCategory(client, {
      name: 'Консультант (Local)',
      provider: 'llamacpp',
      model_name: 'qwen2.5-7b-instruct',
      sort_index: 13,
      temperature: 0.4,
      top_p: consultantRow.top_p ?? 0.9,
      top_k: consultantRow.top_k ?? 40,
      min_p: consultantRow.min_p ?? 0.05,
      repeat_penalty: consultantRow.repeat_penalty ?? 1.1,
      input_context_default: 16384,
      input_context_max: 16384,
      max_tokens: consultantRow.max_tokens ?? 1024,
      system_prompt: consultantRow.system_prompt
        ?? 'Ты — Консультант: отвечай по предоставленным материалам, на русском языке, точно и по существу. Если контекста недостаточно — явно скажи об ограничениях.',
      extra_params: KB_SCOPE_EXTRA_PARAMS,
      routing_mode: consultantRow.routing_mode ?? 'direct',
      fallback_provider: consultantRow.fallback_provider ?? null,
      yandex_folder_id: null,
      debug_mode: consultantRow.debug_mode ?? false,
      complexity: consultantRow.complexity ?? 1.0,
      suggested_questions: consultantRow.suggested_questions ?? '',
      rag_allowed: true,
      retrieval_tier: 'consultant',
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function syncAdminFromEnv(
  pool: Pool,
  adminPass: string | undefined
): Promise<void> {
  if (!adminPass) return;

  const existing = await pool.query<{
    password_hash: string | null;
    is_blocked: boolean;
    is_admin: boolean;
  }>(
    'SELECT password_hash, is_blocked, is_admin FROM users WHERE username = $1 LIMIT 1',
    ['admin']
  );
  const row = existing.rows[0];
  if (!row) return;

  const passwordMatches = !!row.password_hash
    && (row.password_hash.startsWith('$2a$') || row.password_hash.startsWith('$2b$'))
    && bcrypt.compareSync(adminPass, row.password_hash);
  const needsPasswordSync = !passwordMatches;
  const needsUnblock = row.is_blocked || !row.is_admin;

  if (!needsPasswordSync && !needsUnblock) return;

  const passwordHash = needsPasswordSync
    ? bcrypt.hashSync(adminPass, 10)
    : row.password_hash;

  await pool.query(
    `
      UPDATE users
      SET password_hash = $1,
          must_change_password = FALSE,
          is_blocked = FALSE,
          is_admin = TRUE,
          category = COALESCE(category, 'Администратор'),
          expiration_date = COALESCE(expiration_date, '2099-12-31')
      WHERE username = 'admin'
    `,
    [passwordHash]
  );

  seedLogger.info('Synced admin user from AVGEXPERT_ADMIN_PASSWORD', {
    passwordUpdated: needsPasswordSync,
    unblocked: needsUnblock,
  });
}

export async function seedAppData(options: {
  connectionString?: string;
} = {}): Promise<void> {
  await seedCategoryCatalog(options);

  const pool = getPgPool(options.connectionString);
  const existing = await pool.query(
    'SELECT 1 FROM users WHERE username = $1 LIMIT 1',
    ['admin']
  );
  const adminPass = process.env.AVGEXPERT_ADMIN_PASSWORD;

  if ((existing.rowCount ?? 0) > 0) {
    await syncAdminFromEnv(pool, adminPass);
    return;
  }

  seedLogger.info('Admin user missing. Seeding initial app data');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const finalAdminPass = adminPass || crypto.randomBytes(16).toString('hex');

    if (!adminPass) {
      const isProduction = process.env.NODE_ENV === 'production';
      if (!isProduction) {
        seedLogger.warn('Generated development admin password', { username: 'admin', password: finalAdminPass });
      } else {
        seedLogger.warn('AVGEXPERT_ADMIN_PASSWORD missing in production seed. Password auto-generated but not logged');
      }
    }

    await client.query(
      `
        INSERT INTO users (
          username, password_hash, category, expiration_date, n_ctx, system_prompt,
          must_change_password, is_admin
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (username) DO NOTHING
      `,
      [
        'admin',
        bcrypt.hashSync(finalAdminPass, 10),
        'Администратор',
        '2099-12-31',
        4096,
        DEFAULT_SYSTEM_PROMPT,
        true,
        true,
      ]
    );

    await client.query('COMMIT');
    seedLogger.info('App PG seed completed');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

