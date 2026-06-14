import '../helpers/test-env';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runAppMigrations } from '../../src/core/pg/migrate';
import { closePgPools, getPgPool } from '../../src/core/pg/pool';
import { isAppPgEnabled, getDatabasePort } from '../../src/core/pg/database.port';
import userRepository from '../../src/modules/auth/user.repository';
import paymentRepository from '../../src/modules/payments/payment.repository';
import exchangeRateService from '../../src/modules/cost/exchange_rate.service';

test('Sprint 2: Billing & CBR exchange rates integration test', async (t) => {
  if (!isAppPgEnabled()) {
    t.skip('DATABASE_URL not set or APP_PG_ENABLED=false');
    return;
  }

  // Накатываем все миграции, включая 005_billing_system.sql
  await runAppMigrations();

  const pool = getPgPool();

  // 1. Проверяем структуру базы данных
  const exchangeRatesTable = await pool.query(`
    SELECT table_name FROM information_schema.tables WHERE table_name = 'exchange_rates'
  `);
  assert.equal(exchangeRatesTable.rowCount, 1, 'Table exchange_rates should exist');

  const balanceTransactionsTable = await pool.query(`
    SELECT table_name FROM information_schema.tables WHERE table_name = 'balance_transactions'
  `);
  assert.equal(balanceTransactionsTable.rowCount, 1, 'Table balance_transactions should exist');

  const userColumns = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name IN ('balance_usd', 'credit_limit_usd')
  `);
  assert.equal(userColumns.rowCount, 2, 'Columns balance_usd and credit_limit_usd should exist in users table');

  const orderColumns = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'payment_orders' AND column_name IN ('credited_usd', 'exchange_rate')
  `);
  assert.equal(orderColumns.rowCount, 2, 'Columns credited_usd and exchange_rate should exist in payment_orders table');

  // 2. Тестируем ExchangeRateService с мок-запросом к ЦБ РФ
  const mockXml = `<?xml version="1.0" encoding="windows-1251"?>
    <ValCurs Date="13.06.2026" name="Foreign Currency Market">
      <Valute ID="R01235">
        <NumCode>840</NumCode>
        <CharCode>USD</CharCode>
        <Nominal>1</Nominal>
        <Name>US Dollar</Name>
        <Value>89,5000</Value>
        <VunitRate>89,5000</VunitRate>
      </Valute>
    </ValCurs>`;

  exchangeRateService._fetch = async () => {
    return {
      ok: true,
      text: async () => mockXml,
    } as any;
  };

  const rate = await exchangeRateService.updateRates();
  assert.equal(rate, 89.5, 'USD rate should be parsed as 89.5');

  // Проверяем запись в БД
  const dbRateRow = await pool.query("SELECT * FROM exchange_rates WHERE currency = 'USD'");
  assert.equal(dbRateRow.rowCount, 1);
  assert.equal(parseFloat(dbRateRow.rows[0].rate), 89.5);

  // 3. Тестируем пополнение баланса через Robokassa и Ledger-транзакции
  const username = `test_payment_user_${Date.now()}`;
  
  // Создаем заблокированного пользователя с нулевым балансом
  await userRepository.save(username, {
    email: `${username}@example.com`,
    password_hash: 'dummy',
    tokens_allocated: 0,
    allowed_categories: ['global'],
    must_change_password: false,
    is_admin: false,
    is_blocked: true, // Изначально заблокирован
  });

  // Инициализируем баланс в users
  const db = getDatabasePort();
  await db.run('UPDATE users SET balance_usd = 0.0 WHERE username = @username', { username });

  // Создаем платеж в RUB (например, Standard пакет за 2000 рублей)
  const order = await paymentRepository.createOrder({
    username,
    packageId: 'standard',
    credits: 12000,
    tokens: 0,
    amountRub: 2000,
  });

  assert.ok(order);
  assert.equal(order.status, 'pending');

  // Симулируем успешный Robokassa Callback
  const result = await paymentRepository.markPaidAndCredit(order, {
    outSum: '2000.00',
    signature: 'mock_signature',
    paymentMethod: 'BankCard',
  });

  assert.ok(result.credited, 'Order should be marked as credited');
  assert.ok(result.order);
  assert.equal(result.order.status, 'paid');

  // Проверяем курс и начисленную сумму USD в payment_orders
  const updatedOrder = result.order;
  assert.equal(parseFloat(updatedOrder.exchange_rate as any), 89.5);
  const expectedCreditedUsd = Math.round((2000 / 89.5) * 1e8) / 1e8;
  assert.equal(parseFloat(updatedOrder.credited_usd as any), expectedCreditedUsd);

  // Проверяем баланс и блокировку пользователя в users
  const user = await userRepository.findByUsername(username);
  assert.ok(user);
  assert.equal(user.is_blocked, false, 'User should be unblocked');
  assert.equal(user.balance_usd, expectedCreditedUsd, 'User balance_usd should be credited with USD amount');

  // Проверяем Ledger-транзакцию в balance_transactions
  const transactionRow = await pool.query(
    'SELECT * FROM balance_transactions WHERE username = $1',
    [username]
  );
  assert.equal(transactionRow.rowCount, 1, 'One balance transaction should exist');
  const txRecord = transactionRow.rows[0];
  assert.equal(txRecord.type, 'deposit');
  assert.equal(txRecord.reference_type, 'payment_order');
  assert.equal(txRecord.reference_id, String(order.inv_id));
  assert.equal(parseFloat(txRecord.exchange_rate), 89.5);
  assert.equal(parseFloat(txRecord.amount), expectedCreditedUsd);
  assert.equal(parseFloat(txRecord.amount_original), 2000);
  assert.equal(txRecord.currency_original, 'RUB');

  // Чистим тестовые данные
  await pool.query('DELETE FROM users WHERE username = $1', [username]);
});

test.after(async () => {
  await closePgPools();
});
