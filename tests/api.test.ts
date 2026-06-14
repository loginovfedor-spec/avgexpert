import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import './helpers/test-env';
import { app } from './helpers/server';
import userRepository from '../src/modules/auth/user.repository';
import { upsertTestUser, setTestPassword } from './helpers/test_users';
import { ensureTestPg, teardownTestPg } from './helpers/pg_harness';

test('API Integration Tests', async (t) => {
  let adminToken = '';
  const testUserId = `test_user_${Date.now()}`;
  let testUserToken = '';

  t.before(async () => {
    await ensureTestPg();
  });

  t.after(async () => {
    await teardownTestPg();
  });

  await t.test('POST /api/auth/login - should fail with invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrongpassword' })
      .expect(401);

    assert.strictEqual(res.body.detail, 'Неверный логин или пароль');
  });

  await t.test('POST /api/auth/login - should succeed as admin', async () => {
    const adminPass = 'TestAdminPass123!';
    await setTestPassword('admin', adminPass);
    await upsertTestUser('admin', { category: 'Администратор' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: adminPass })
      .expect(200);

    assert.ok(res.body.access_token);
    adminToken = res.body.access_token;
  });

  await t.test('POST /api/auth/register - should reject invalid username characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'тестовый_user',
        email: 'bad-username@example.com',
        password: 'ValidPass123!',
        password_confirm: 'ValidPass123!',
      })
      .expect(400);

    assert.ok(res.body.errors.some((err: { message: string }) => err.message.includes('английские буквы')));
  });

  await t.test('POST /api/auth/register - should return password validation messages', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'valid_user_123',
        email: 'weak-password@example.com',
        password: 'password',
        password_confirm: 'password',
      })
      .expect(400);

    const messages = res.body.errors.map((err: { message: string }) => err.message);
    assert.ok(messages.includes('Пароль должен содержать хотя бы одну заглавную букву'));
    assert.ok(messages.includes('Пароль должен содержать хотя бы одну цифру'));
    assert.ok(messages.includes('Пароль должен содержать хотя бы один специальный символ'));
  });

  await t.test('POST /api/auth/register - should reject duplicate username and email', async () => {
    const suffix = Date.now();
    const username = `unique_user_${suffix}`;
    const email = `unique-user-${suffix}@example.com`;

    await request(app)
      .post('/api/auth/register')
      .send({
        username,
        email,
        password: 'ValidPass123!',
        password_confirm: 'ValidPass123!',
      })
      .expect(201);

    const usernameRes = await request(app)
      .post('/api/auth/register')
      .send({
        username,
        email: `another-email-${suffix}@example.com`,
        password: 'ValidPass123!',
        password_confirm: 'ValidPass123!',
      })
      .expect(409);
    assert.strictEqual(usernameRes.body.detail, 'Пользователь с таким именем уже существует');

    const emailRes = await request(app)
      .post('/api/auth/register')
      .send({
        username: `unique_user_2_${suffix}`,
        email: email.toUpperCase(),
        password: 'ValidPass123!',
        password_confirm: 'ValidPass123!',
      })
      .expect(409);
    assert.strictEqual(emailRes.body.detail, 'Пользователь с таким e-mail уже существует');
  });

  await t.test('POST /api/auth/register - should copy allowed categories from user_a', async () => {
    const suffix = Date.now();
    const templateHash = bcrypt.hashSync('TemplatePass123!', 10);
    await upsertTestUser('user_a', {
      password_hash: templateHash,
      category: 'Консультант',
      allowed_categories: ['Консультант', 'Эксперт'],
      n_ctx: 4096,
    });

    const username = `copy_cats_${suffix}`;
    await request(app)
      .post('/api/auth/register')
      .send({
        username,
        email: `copy-cats-${suffix}@example.com`,
        password: 'ValidPass123!',
        password_confirm: 'ValidPass123!',
        category: 'Эксперт',
      })
      .expect(201);

    const created = await userRepository.findByUsername(username);
    assert.deepStrictEqual(created?.allowed_categories, ['Консультант', 'Эксперт']);
    assert.strictEqual(created?.category, 'Эксперт');
  });

  await t.test('GET /api/users/public/categories - should use allowed categories from user_a', async () => {
    const templateHash = bcrypt.hashSync('TemplatePass123!', 10);
    await upsertTestUser('user_a', {
      password_hash: templateHash,
      category: 'Консультант',
      allowed_categories: ['Консультант'],
      n_ctx: 4096,
    });

    const res = await request(app).get('/api/users/public/categories').expect(200);

    assert.deepStrictEqual(Object.keys(res.body), ['Консультант']);
  });

  await t.test('GET /api/users/me - should fetch own profile', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    assert.strictEqual(res.body.username, 'admin');
    assert.strictEqual(res.body.category, 'Администратор');
  });

  await t.test('POST /api/admin/users/:username - should create a new user', async () => {
    const templateHash = bcrypt.hashSync('TemplatePass123!', 10);
    await upsertTestUser('user_a', {
      password_hash: templateHash,
      email: 'template-user-a@example.com',
      category: 'Эксперт (OpenAI)',
      allowed_categories: ['Консультант', 'Эксперт (OpenAI)'],
      expiration_date: '2099-10-10',
      n_ctx: 8192,
      system_prompt: 'Template user_a prompt',
      is_admin: false,
      balance_usd: 321.0,
      is_blocked: false,
      input_context_limit: 8192,
      output_generation_limit: 4096,
    });

    const res = await request(app)
      .post(`/api/admin/users/${testUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        password: 'TestUserPass123!',
        email: `${testUserId}-initial@example.com`,
      })
      .expect(200);

    assert.strictEqual(res.body.status, 'success');
    const user = await userRepository.findByUsername(testUserId);
    assert.strictEqual(user?.email, `${testUserId}-initial@example.com`);
    assert.strictEqual(user?.category, 'Эксперт (OpenAI)');
    assert.deepStrictEqual(user?.allowed_categories, ['Консультант', 'Эксперт (OpenAI)']);
    assert.strictEqual(user?.expiration_date, '2099-10-10');
    assert.strictEqual(user?.n_ctx, 8192);
    assert.strictEqual(user?.system_prompt, 'Template user_a prompt');
    assert.strictEqual(user?.balance_usd, 321.0);
    assert.strictEqual(user?.input_context_limit, 8192);
    assert.strictEqual(user?.output_generation_limit, 4096);
  });

  await t.test('POST /api/admin/users/:username - should update user email', async () => {
    const email = `${testUserId}@example.com`;
    const res = await request(app)
      .post(`/api/admin/users/${testUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email,
        category: 'Эксперт (OpenAI)',
        n_ctx: 2048,
      })
      .expect(200);

    assert.strictEqual(res.body.status, 'success');
    const user = await userRepository.findByUsername(testUserId);
    assert.strictEqual(user?.email, email);
  });

  await t.test('POST /api/admin/users/:username - should reject duplicate email', async () => {
    const res = await request(app)
      .post('/api/admin/users/duplicate_email_user')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        password: 'DuplicatePass123!',
        email: `${testUserId}@example.com`,
        category: 'Эксперт (OpenAI)',
        n_ctx: 2048,
      })
      .expect(409);

    assert.strictEqual(res.body.detail, 'Пользователь с таким e-mail уже существует');
  });

  await t.test('POST /api/admin/users/:username - should reject weak password', async () => {
    const res = await request(app)
      .post('/api/admin/users/weak_pass_user')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        password: 'password',
        category: 'Консультант',
        n_ctx: 2048,
      })
      .expect(400);

    assert.ok(res.body.errors.some((err: { message: string }) => err.message.includes('заглавную букву')));
  });

  await t.test('POST /api/auth/login - should login as new user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: testUserId, password: 'TestUserPass123!' })
      .expect(200);

    assert.ok(res.body.access_token);
    testUserToken = res.body.access_token;
  });

  await t.test('POST /api/sessions - should save session', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${testUserToken}`)
      .send({
        id: 'sess-123',
        title: 'My Session',
        messages: [{ role: 'user', content: 'hello' }],
        updatedAt: Date.now(),
      })
      .expect(200);

    assert.strictEqual(res.body.status, 'success');
  });

  await t.test('GET /api/sessions - should list sessions', async () => {
    const res = await request(app)
      .get('/api/sessions')
      .set('Authorization', `Bearer ${testUserToken}`)
      .expect(200);

    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].id, 'sess-123');
    assert.strictEqual(res.body[0].title, 'My Session');
  });

  await t.test('GET /api/sessions/:id - should get session details', async () => {
    const res = await request(app)
      .get('/api/sessions/sess-123')
      .set('Authorization', `Bearer ${testUserToken}`)
      .expect(200);

    assert.strictEqual(res.body.id, 'sess-123');
    assert.strictEqual(res.body.messages.length, 1);
    assert.strictEqual(res.body.messages[0].content, 'hello');
  });

  await t.test('DELETE /api/sessions/:id - should delete session', async () => {
    const res = await request(app)
      .delete('/api/sessions/sess-123')
      .set('Authorization', `Bearer ${testUserToken}`)
      .expect(200);

    assert.strictEqual(res.body.status, 'success');
  });

  await t.test('PATCH /api/users/me - should update password and invalidate old token', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${testUserToken}`)
      .send({
        password: 'NewUserPass123!',
      })
      .expect(200);

    assert.strictEqual(res.body.status, 'success');

    await request(app).get('/api/users/me').set('Authorization', `Bearer ${testUserToken}`).expect(401);
  });

  await t.test('POST and DELETE /api/admin/categories/:name - should create and delete category', async () => {
    await request(app)
      .post('/api/admin/categories/TempTestCategory')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        provider: 'llamacpp',
        model_name: 'test-model',
        endpoint_url: 'http://127.0.0.1:8201',
        api_key: 'super-secret-key-123456',
        yandex_folder_id: '',
        temperature: 0.7,
        complexity: 1.5,
      })
      .expect(200);

    const getRes = await request(app)
      .get('/api/admin/categories/TempTestCategory')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.strictEqual(getRes.body.model_name, 'test-model');
    assert.strictEqual(getRes.body.endpoint_url, 'http://127.0.0.1:8201');
    assert.strictEqual(getRes.body.yandex_folder_id, '');
    assert.strictEqual(getRes.body.api_key, 'sup-...3456');

    await request(app)
      .delete('/api/admin/categories/TempTestCategory')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app)
      .get('/api/admin/categories/TempTestCategory')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
