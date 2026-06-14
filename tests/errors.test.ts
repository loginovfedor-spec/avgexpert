import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/test-env';
import { AppError, AuthError, ValidationError, NotFoundError } from '../src/core/errors';

test('Error Classes: SPEC-014 Contract', async (t) => {
  await t.test('AppError has correct defaults', () => {
    const err = new AppError('Something went wrong');
    assert.equal(err.message, 'Something went wrong');
    assert.equal(err.status, 500);
    assert.equal(err.code, 'server_error');
    assert.equal(err.details, null);
    assert.equal(err.isOperational, true);
    assert.ok(err instanceof Error);
  });

  await t.test('AppError accepts custom status and code', () => {
    const err = new AppError('Custom error', 422, 'custom_code', { field: 'name' });
    assert.equal(err.status, 422);
    assert.equal(err.code, 'custom_code');
    assert.deepEqual(err.details, { field: 'name' });
  });

  await t.test('AuthError has 401 status', () => {
    const err = new AuthError();
    assert.equal(err.status, 401);
    assert.equal(err.code, 'auth_error');
    assert.ok(err instanceof AppError);
  });

  await t.test('ValidationError has 400 status', () => {
    const err = new ValidationError('Bad input', { field: 'email' });
    assert.equal(err.status, 400);
    assert.equal(err.code, 'validation_error');
    assert.deepEqual(err.details, { field: 'email' });
    assert.ok(err instanceof AppError);
  });

  await t.test('NotFoundError has 404 status', () => {
    const err = new NotFoundError();
    assert.equal(err.status, 404);
    assert.equal(err.code, 'not_found');
    assert.ok(err instanceof AppError);
  });
});
