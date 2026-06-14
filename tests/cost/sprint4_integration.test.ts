import '../helpers/test-env';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ensureTestPg, teardownTestPg } from '../helpers/pg_harness';
import { getPgPool } from '../../src/core/pg/pool';
import userRepository from '../../src/modules/auth/user.repository';
import paymentRepository from '../../src/modules/payments/payment.repository';
import exchangeRateService from '../../src/modules/cost/exchange_rate.service';
import providerFactory from '../../src/modules/providers/provider.factory';
import { app } from '../helpers/server';
import { DeterministicProvider } from '../mocks/deterministic_provider';

test('Sprint 4: End-to-end Billing, Conversion, Debit, Overdraft & Blocking Integration Tests', async (t) => {
  t.before(async () => {
    await ensureTestPg();
    // Явно гарантируем наличие deterministic провайдера в фабрике
    if (!providerFactory.adapters['deterministic']) {
      const mock = new DeterministicProvider();
      mock.id = 'deterministic';
      providerFactory.adapters['deterministic'] = mock as any;
    }
  });

  t.after(async () => {
    await teardownTestPg();
  });

  await t.test('Scenario 1: Payment -> Conversion (CBR) -> Balance Credit -> Autounblock', async () => {
    const pool = getPgPool();
    const username = `sprint4_user_1_${Date.now()}`;

    // 1. Создаем заблокированного пользователя с балансом 0
    await userRepository.save(username, {
      email: `${username}@example.com`,
      password_hash: 'dummy_hash',
      allowed_categories: ['global'],
      must_change_password: false,
      is_admin: false,
      is_blocked: true,
    });
    
    // Сбрасываем баланс в 0
    await pool.query('UPDATE users SET balance_usd = 0.0 WHERE username = $1', [username]);

    // 2. Мокаем XML-ответ ЦБ РФ (курс USD = 90.0 рублей)
    const mockXml = `<?xml version="1.0" encoding="windows-1251"?>
      <ValCurs Date="13.06.2026" name="Foreign Currency Market">
        <Valute ID="R01235">
          <NumCode>840</NumCode>
          <CharCode>USD</CharCode>
          <Nominal>1</Nominal>
          <Name>US Dollar</Name>
          <Value>90,0000</Value>
          <VunitRate>90,0000</VunitRate>
        </Valute>
      </ValCurs>`;

    exchangeRateService._fetch = async () => {
      return {
        ok: true,
        text: async () => mockXml,
      } as any;
    };

    // Запускаем принудительное обновление курсов
    const rate = await exchangeRateService.updateRates();
    assert.equal(rate, 90.0, 'Курс доллара должен быть равен 90.0');

    // 3. Создаем платежный заказ в рублях (900 RUB)
    const order = await paymentRepository.createOrder({
      username,
      packageId: 'standard',
      credits: 1000,
      tokens: 0,
      amountRub: 900,
    });

    assert.ok(order);
    assert.equal(order.status, 'pending');

    // 4. Подтверждаем оплату (симулируем Callback Robokassa)
    const result = await paymentRepository.markPaidAndCredit(order, {
      outSum: '900.00',
      signature: 'mock_sig',
      paymentMethod: 'BankCard',
    });

    assert.ok(result.credited);
    assert.equal(result.order?.status, 'paid');

    // Проверяем курс и начисленную сумму в заказе
    assert.equal(parseFloat(result.order.exchange_rate as any), 90.0);
    assert.equal(parseFloat(result.order.credited_usd as any), 10.0); // 900 / 90.0

    // 5. Проверяем баланс и статус блокировки пользователя
    const user = await userRepository.findByUsername(username);
    assert.ok(user);
    assert.equal(user.is_blocked, false, 'Пользователь должен быть разблокирован');
    assert.equal(user.balance_usd, 10.0, 'Баланс должен быть равен 10.0 USD');

    // 6. Проверяем Ledger-транзакцию
    const txRow = await pool.query('SELECT * FROM balance_transactions WHERE username = $1', [username]);
    assert.equal(txRow.rowCount, 1);
    const tx = txRow.rows[0];
    assert.equal(tx.type, 'deposit');
    assert.equal(tx.reference_type, 'payment_order');
    assert.equal(tx.reference_id, String(order.inv_id));
    assert.equal(parseFloat(tx.amount), 10.0);
    assert.equal(parseFloat(tx.amount_original), 900);
    assert.equal(tx.currency_original, 'RUB');
    assert.equal(parseFloat(tx.exchange_rate), 90.0);

    // Удаляем тестового пользователя
    await pool.query('DELETE FROM users WHERE username = $1', [username]);
  });

  await t.test('Scenario 2: Request -> Cost Calculation -> Debit -> Overdraft -> Autoblock', async () => {
    const pool = getPgPool();
    const suffix = Date.now();
    const username = `sprint4_user_2_${suffix}`;
    const password = 'TestUserPass123!';
    const categoryName = `Sprint4TestCategory_${suffix}`;

    // 1. Создаем пользователя с положительным балансом (0.01 USD) и незаблокированного
    const tempUserPassHash = require('bcrypt').hashSync(password, 10);
    await userRepository.save(username, {
      email: `${username}@example.com`,
      password_hash: tempUserPassHash,
      allowed_categories: [categoryName],
      category: categoryName,
      must_change_password: false,
      is_admin: false,
      is_blocked: false,
    });
    
    // Устанавливаем баланс ровно в 0.01 USD
    await pool.query('UPDATE users SET balance_usd = 0.01 WHERE username = $1', [username]);

    // 2. Создаем тестовую категорию с провайдером test (deterministic) и моделью gpt-5.5
    // Тариф gpt-5.5: input = 5.00 USD за 1M токенов (0.000005 за токен)
    await pool.query(`
      INSERT INTO categories (
        name, provider, model_name, endpoint_url, api_key, temperature, top_p, top_k, min_p, repeat_penalty,
        input_context_default, input_context_max, max_tokens, system_prompt, routing_mode, complexity, rag_allowed, retrieval_tier
      ) VALUES (
        $1, 'test', 'gpt-5.5', 'http://localhost:8201', 'test', 0.7, 0.9, 40, 0.05, 1.1,
        16384, 16384, 1024, 'System prompt', 'direct', 1.0, false, 'consultant'
      )
    `, [categoryName]);

    // 3. Конфигурируем DeterministicProvider на возврат 1,000,000 токенов и стоимости 5.00 USD
    const deterministicAdapter = providerFactory.adapters['deterministic'] as any;
    deterministicAdapter.usage = {
      prompt_tokens: 1000000,
      completion_tokens: 0,
      total_tokens: 1000000,
      cost_usd: 5.0,
    };

    // 4. Авторизуемся по API, чтобы получить JWT-токен
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);

    const token = loginRes.body.access_token;
    assert.ok(token);

    // 5. Выполняем чат-запрос
    const chatRes = await request(app)
      .post('/api/chat/completions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        messages: [{ role: 'user', content: 'Привет' }],
        category: categoryName,
      })
      .expect(200);

    assert.ok(chatRes.body.choices?.[0]?.message?.content);

    // 6. Проверяем баланс и статус блокировки после списания (ждем асинхронного обновления)
    let updatedUser = null;
    for (let i = 0; i < 20; i++) {
      updatedUser = await userRepository.findByUsername(username);
      if (updatedUser && parseFloat(updatedUser.balance_usd as any) !== 0.01) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.ok(updatedUser);
    
    // Ожидаемый баланс: 0.01 - 5.00 = -4.99 USD (мягкий овердрафт)
    const expectedBalanceUsd = -4.99;
    assert.equal(parseFloat(updatedUser.balance_usd as any), expectedBalanceUsd, 'Баланс должен быть равен -4.99 USD');
    assert.equal(updatedUser.is_blocked, true, 'Пользователь должен быть заблокирован после ухода баланса в минус');

    // Проверяем Ledger-транзакцию
    const txRow = await pool.query('SELECT * FROM balance_transactions WHERE username = $1 AND type = $2', [username, 'charge']);
    assert.equal(txRow.rowCount, 1);
    assert.equal(parseFloat(txRow.rows[0].amount), -5.0);

    // Проверяем лог request_cost_log
    const logRow = await pool.query('SELECT * FROM request_cost_log WHERE username = $1', [username]);
    assert.equal(logRow.rowCount, 1);
    assert.equal(parseFloat(logRow.rows[0].cost_usd), 5.0);
    assert.equal(logRow.rows[0].model_name, 'gpt-5.5');

    // 7. Делаем повторный запрос и убеждаемся, что доступ заблокирован (403 Forbidden)
    const blockedRes = await request(app)
      .post('/api/chat/completions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        messages: [{ role: 'user', content: 'Привет еще раз' }],
        category: categoryName,
      })
      .expect(403);

    // Проверяем код ошибки
    assert.ok(
      blockedRes.body.error.code === 'user_blocked' || blockedRes.body.error.code === 'insufficient_funds',
      'Должна вернуться ошибка блокировки или недостатка средств'
    );

    // Очищаем тестовые данные
    await pool.query('DELETE FROM categories WHERE name = $1', [categoryName]);
    await pool.query('DELETE FROM users WHERE username = $1', [username]);
  });
});
