const { Router } = require('express');
const { z } = require('zod');
const { authenticate } = require('../auth/auth.middleware');
const { asyncHandler } = require('../../core/errors');
const paymentRepository = require('./payment.repository');
const robokassaService = require('./robokassa.service');

const router = Router();

const createSchema = z.object({
  package_id: z.enum(['starter', 'standard', 'pro']).optional(),
  amount: z.number().int().positive().optional(),
}).refine(data => data.package_id || data.amount, {
  message: 'package_id or amount is required',
});

router.get('/packages', (req, res) => {
  const packages = Object.values(robokassaService.PACKAGES).map(pack => ({
    ...pack,
    tokens: pack.credits * 1000,
  }));
  res.json({ packages });
});

router.post('/robokassa/create', authenticate, asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ detail: 'Некорректный пакет оплаты', errors: parsed.error.issues });
  }

  const pack = parsed.data.package_id
    ? robokassaService.getPackage(parsed.data.package_id)
    : robokassaService.getPackageByAmount(parsed.data.amount);

  if (!pack) {
    return res.status(400).json({ detail: 'Неизвестный пакет оплаты' });
  }

  const order = await paymentRepository.createOrder({
    username: req.user.username,
    packageId: pack.id,
    credits: pack.credits,
    tokens: pack.tokens,
    amountRub: pack.amountRub,
  });

  const paymentUrl = robokassaService.buildPaymentUrl({ req, order });
  res.status(201).json({
    inv_id: order.inv_id,
    package_id: order.package_id,
    credits: order.credits,
    tokens: order.tokens,
    amount_rub: order.amount_rub,
    payment_url: paymentUrl,
  });
}));

router.post('/robokassa/result', asyncHandler(async (req, res) => {
  const params = { ...req.body, ...req.query };
  const verified = robokassaService.verifyResult(params);
  if (!verified.ok) {
    return res.status(400).send('bad signature');
  }

  const order = paymentRepository.findByInvId(verified.invId);
  if (!order) {
    return res.status(404).send('order not found');
  }

  const expectedAmount = Number(order.amount_rub).toFixed(2);
  const paidAmount = Number(verified.outSum).toFixed(2);
  if (expectedAmount !== paidAmount) {
    return res.status(400).send('bad amount');
  }

  await paymentRepository.markPaidAndCredit(order, {
    outSum: verified.outSum,
    fee: params.Fee,
    paymentMethod: params.PaymentMethod,
    signature: verified.received,
  });

  res.type('text/plain').send(`OK${order.inv_id}`);
}));

router.all('/robokassa/success', (req, res) => {
  res.redirect('/?payment=success');
});

router.all('/robokassa/fail', (req, res) => {
  res.redirect('/?payment=fail');
});

module.exports = router;
