import '../helpers/test-env';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runAppMigrations } from '../../src/core/pg/migrate';
import { seedAppData } from '../../src/core/pg/seed';
import { closePgPools, getPgPool } from '../../src/core/pg/pool';
import { isAppPgEnabled } from '../../src/core/pg/database.port';
import userRepository from '../../src/modules/auth/user.repository';
import { recordUsageAndCost } from '../../src/modules/chat/token_usage.service';
import { v4 as uuidv4 } from 'uuid';

test('Cost & Usage integration database test', async (t) => {
  if (!isAppPgEnabled()) {
    t.skip('DATABASE_URL not set or APP_PG_ENABLED=false');
    return;
  }

  // Запускаем миграции (004_app_cost.sql и 005_billing_system.sql выполнятся)
  await runAppMigrations();
  await seedAppData();

  const pool = getPgPool();

  // Проверяем, что колонка balance_usd добавилась в users
  const userColumns = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'balance_usd'
  `);
  assert.equal(userColumns.rowCount ?? 0, 1, 'Column balance_usd should exist in users table');
  
  // Проверяем, что таблица request_cost_log создана
  const rclColumns = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'request_cost_log'
  `);
  assert.ok((rclColumns.rowCount ?? 0) > 0, 'request_cost_log table should exist');

  // Создадим тестового пользователя с положительным USD-балансом
  const username = `test_cost_user_${Date.now()}`;
  await userRepository.save(username, {
    email: `${username}@example.com`,
    password_hash: 'dummy',
    balance_usd: 100.0,
    allowed_categories: ['global'],
    must_change_password: false,
    is_admin: false,
    is_blocked: false
  });

  const dbUser = await userRepository.findByUsername(username);
  assert.ok(dbUser);
  assert.equal(dbUser.balance_usd, 100.0);

  // Подготовим usage с cost_usd
  const mockUsage = {
    prompt_tokens: 1000,
    cached_input_tokens: 200,
    completion_tokens: 300,
    total_tokens: 1300,
    cost_usd: 0.052,
    _rates: {
      inputRate: 0.000005,
      cachedRate: 0.0000005,
      outputRate: 0.00003,
      costMode: 'standard',
      currency: 'USD',
      exchangeRate: 1.0
    }
  };

  const requestId = uuidv4();

  // Записываем использование и стоимость
  await recordUsageAndCost({
    user: { username },
    usage: mockUsage,
    source: 'chat',
    requestId,
    providerId: 'openai',
    providerName: 'OpenAI API',
    adapterType: 'openai',
    modelName: 'gpt-5.5',
    category: 'expert'
  });

  // Проверяем списание USD в users
  const userRow = await pool.query('SELECT balance_usd FROM users WHERE username = $1', [username]);
  assert.equal(parseFloat(userRow.rows[0].balance_usd), 100.0 - 0.052);

  // Проверяем лог в request_cost_log
  const logRow = await pool.query('SELECT * FROM request_cost_log WHERE username = $1', [username]);
  assert.equal(logRow.rowCount, 1);
  const log = logRow.rows[0];
  assert.equal(log.request_id, requestId);
  assert.equal(log.provider_id, 'openai');
  assert.equal(log.model_name, 'gpt-5.5');
  assert.equal(log.input_tokens, 1000);
  assert.equal(log.cached_input_tokens, 200);
  assert.equal(log.output_tokens, 300);
  assert.equal(parseFloat(log.cost_usd), 0.052);
  assert.equal(parseFloat(log.rate_input_per_token), 0.000005);
  assert.equal(parseFloat(log.rate_cached_input_per_token), 0.0000005);
  assert.equal(parseFloat(log.rate_output_per_token), 0.00003);
  assert.equal(log.currency, 'USD');
  assert.equal(parseFloat(log.exchange_rate), 1.0);

  // Проверяем лог транзакции в balance_transactions
  const txRow = await pool.query('SELECT * FROM balance_transactions WHERE username = $1', [username]);
  assert.equal(txRow.rowCount, 1);
  const tx = txRow.rows[0];
  assert.equal(tx.type, 'charge');
  assert.equal(tx.reference_type, 'llm_request');
  assert.equal(tx.reference_id, requestId);
  assert.equal(parseFloat(tx.amount), -0.052);

  // Чистим тестового пользователя
  await pool.query('DELETE FROM users WHERE username = $1', [username]);
});

test('request_cost_log schema uses NUMERIC for money columns (SPEC-001)', async (t) => {
  if (!isAppPgEnabled()) {
    t.skip('DATABASE_URL not set or APP_PG_ENABLED=false');
    return;
  }

  await runAppMigrations();
  const pool = getPgPool();

  const columns = await pool.query(`
    SELECT column_name, data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_name = 'request_cost_log'
      AND column_name IN (
        'cost_usd', 'rate_input_per_token', 'rate_cached_input_per_token',
        'rate_output_per_token', 'exchange_rate', 'compute_seconds', 'rate_usd_per_hour'
      )
    ORDER BY column_name
  `);

  const expected: Record<string, { precision: number; scale: number }> = {
    cost_usd: { precision: 18, scale: 8 },
    compute_seconds: { precision: 18, scale: 6 },
    exchange_rate: { precision: 18, scale: 8 },
    rate_cached_input_per_token: { precision: 18, scale: 12 },
    rate_input_per_token: { precision: 18, scale: 12 },
    rate_output_per_token: { precision: 18, scale: 12 },
    rate_usd_per_hour: { precision: 18, scale: 8 },
  };

  assert.equal(columns.rowCount, Object.keys(expected).length);
  for (const row of columns.rows) {
    assert.equal(row.data_type, 'numeric');
    const spec = expected[row.column_name];
    assert.ok(spec, `unexpected column ${row.column_name}`);
    assert.equal(row.numeric_precision, spec.precision);
    assert.equal(row.numeric_scale, spec.scale);
  }

  const usersCostCol = await pool.query(`
    SELECT data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'cost_usd_used'
  `);
  assert.equal(usersCostCol.rowCount, 1);
  assert.equal(usersCostCol.rows[0].data_type, 'numeric');
  assert.equal(usersCostCol.rows[0].numeric_precision, 18);
  assert.equal(usersCostCol.rows[0].numeric_scale, 8);

  const tuhCostCols = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'token_usage_history'
      AND column_name LIKE '%cost%'
  `);
  assert.equal(tuhCostCols.rowCount, 0, 'token_usage_history must not have cost columns (SPEC-002)');

  const providerRates = await pool.query(`
    SELECT table_name FROM information_schema.tables WHERE table_name = 'provider_rates'
  `);
  assert.equal(providerRates.rowCount, 0, 'provider_rates table must not exist (SPEC-002)');
});

test('recordUsageAndCost is idempotent for same request_id + provider_id (SPEC-005)', async (t) => {
  if (!isAppPgEnabled()) {
    t.skip('DATABASE_URL not set or APP_PG_ENABLED=false');
    return;
  }

  await runAppMigrations();
  await seedAppData();
  const pool = getPgPool();

  const username = `test_idempotent_user_${Date.now()}`;
  await userRepository.save(username, {
    email: `${username}@example.com`,
    password_hash: 'dummy',
    balance_usd: 50.0,
    allowed_categories: ['global'],
    must_change_password: false,
    is_admin: false,
    is_blocked: false
  });

  const mockUsage = {
    prompt_tokens: 500,
    completion_tokens: 100,
    total_tokens: 600,
    cost_usd: 0.025,
    _rates: {
      inputRate: 0.000005,
      cachedRate: 0,
      outputRate: 0.00003,
      costMode: 'standard',
      currency: 'USD',
      exchangeRate: 1.0
    }
  };

  const requestId = uuidv4();
  const params = {
    user: { username },
    usage: mockUsage,
    source: 'chat',
    requestId,
    providerId: 'openai',
    providerName: 'OpenAI API',
    adapterType: 'openai',
    modelName: 'gpt-5.5',
    category: 'expert'
  };

  await recordUsageAndCost(params);
  await recordUsageAndCost(params);

  const userRow = await pool.query('SELECT balance_usd FROM users WHERE username = $1', [username]);
  assert.equal(parseFloat(userRow.rows[0].balance_usd), 50.0 - 0.025);

  const logRows = await pool.query(
    'SELECT COUNT(*)::int AS c FROM request_cost_log WHERE username = $1 AND request_id = $2',
    [username, requestId]
  );
  assert.equal(logRows.rows[0].c, 1);

  const txRows = await pool.query(
    'SELECT COUNT(*)::int AS c FROM balance_transactions WHERE username = $1 AND reference_id = $2',
    [username, requestId]
  );
  assert.equal(txRows.rows[0].c, 1);

  await pool.query('DELETE FROM users WHERE username = $1', [username]);
});

test('Cost & Usage integration database test for compute-mode', async (t) => {
  if (!isAppPgEnabled()) {
    t.skip('DATABASE_URL not set or APP_PG_ENABLED=false');
    return;
  }

  await runAppMigrations();
  await seedAppData();

  const pool = getPgPool();

  const username = `test_compute_user_${Date.now()}`;
  await userRepository.save(username, {
    email: `${username}@example.com`,
    password_hash: 'dummy',
    balance_usd: 100.0,
    allowed_categories: ['global'],
    must_change_password: false,
    is_admin: false,
    is_blocked: false
  });

  // Подготовим compute usage
  // 10s: (10/3600) * 3.60 = 0.01 USD
  const mockUsage = {
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
    compute_seconds: 10.0,
    cost_usd: 0.01,
    _rates: {
      inputRate: 0,
      cachedRate: 0,
      outputRate: 0,
      costMode: 'compute',
      currency: 'USD',
      exchangeRate: 1.0,
      rateUsdPerHour: 3.60,
      minBillableSeconds: 1.0
    }
  };

  const requestId = uuidv4();

  await recordUsageAndCost({
    user: { username },
    usage: mockUsage,
    source: 'chat',
    requestId,
    providerId: 'llamacpp',
    providerName: 'Llama.cpp local',
    adapterType: 'llamacpp',
    modelName: 'qwen2.5-7b',
    category: 'consultant'
  });

  // Проверяем списание USD в users
  const userRow = await pool.query('SELECT balance_usd FROM users WHERE username = $1', [username]);
  assert.equal(parseFloat(userRow.rows[0].balance_usd), 100.0 - 0.01);

  // Проверяем лог в request_cost_log
  const logRow = await pool.query('SELECT * FROM request_cost_log WHERE username = $1', [username]);
  assert.equal(logRow.rowCount, 1);
  const log = logRow.rows[0];
  assert.equal(log.request_id, requestId);
  assert.equal(log.provider_id, 'llamacpp');
  assert.equal(log.model_name, 'qwen2.5-7b');
  assert.equal(log.input_tokens, 100);
  assert.equal(log.output_tokens, 50);
  assert.equal(parseFloat(log.cost_usd), 0.01);
  assert.equal(parseFloat(log.compute_seconds), 10.0);
  assert.equal(parseFloat(log.rate_usd_per_hour), 3.60);
  assert.equal(parseFloat(log.rate_input_per_token), 0);
  assert.equal(parseFloat(log.rate_output_per_token), 0);

  // Чистим тестового пользователя
  await pool.query('DELETE FROM users WHERE username = $1', [username]);
});

test.after(async () => {
  await closePgPools();
});
