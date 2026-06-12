import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/payment-test-env';
import robokassaService from '../src/modules/payments/robokassa.service';
import { asMock } from './helpers/cast';
import type { Request } from 'express';

test('Robokassa payment URL sends a readable service name and receipt item', () => {
  const paymentUrl = robokassaService.buildPaymentUrl({
    req: asMock<Request & { user?: { email?: string } }>({
      user: {
        email: 'buyer@example.com',
      },
    }),
    order: {
      amount_rub: 200,
      inv_id: 123,
      package_id: 'starter',
      credits: 1000,
    },
  });

  const url = new URL(paymentUrl);
  const receipt = url.searchParams.get('Receipt');
  const decodedReceipt = JSON.parse(decodeURIComponent(receipt!));

  assert.equal(url.searchParams.get('Description'), 'Пополнение баланса AVG Expert 1000 кредитов');
  assert.equal(decodedReceipt.items[0].name, 'Пополнение баланса AVG Expert 1000 кредитов');
  assert.equal(decodedReceipt.items[0].payment_object, 'service');
  assert.equal(decodedReceipt.items[0].tax, 'none');
  assert.equal(url.searchParams.get('Email'), 'buyer@example.com');
  assert.deepEqual(url.searchParams.getAll('PaymentMethods'), ['BankCard', 'SBP']);
  assert.equal(url.searchParams.get('Shp_package'), 'starter');

  const expectedSignature = crypto
    .createHash('md5')
    .update(`demo:200.00:123:${receipt}:password_1:Shp_package=starter`)
    .digest('hex');
  assert.equal(url.searchParams.get('SignatureValue'), expectedSignature);
});
