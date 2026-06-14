import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware';
import { asyncHandler } from '../../core/errors';
import paymentRepository from './payment.repository';
import robokassaService from './robokassa.service';
import { getUsdExchangeRate } from './cbr.service';
import { getPaymentPackagesPreview } from '../billing/request_estimate.service';
const router = Router();

type AuthedRequest = Request & {
  user: { username: string; email?: string | null };
};

const createSchema = z.object({
  amount_rub: z.number().int().min(200).max(20000),
});

router.get('/exchange-rate', asyncHandler(async (_req: Request, res: Response) => {
  const rate = await getUsdExchangeRate();
  res.json({ rate });
}));

router.get('/packages', asyncHandler(async (_req: Request, res: Response) => {
  const preview = await getPaymentPackagesPreview();
  res.json(preview);
}));

router.post('/robokassa/create', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ detail: 'Некорректный пакет оплаты', errors: parsed.error.issues });
  }

  const pack = await robokassaService.getCustomPackage(parsed.data.amount_rub);

  if (!pack) {
    return res.status(400).json({ detail: 'Некорректная сумма для пополнения' });
  }

  const order = await paymentRepository.createOrder({
    username: (req as AuthedRequest).user.username,
    packageId: pack.id,
    credits: pack.credits,
    tokens: pack.tokens,
    amountRub: pack.amountRub,
  });

  if (!order) {
    return res.status(500).json({ detail: 'Не удалось создать заказ' });
  }

  const paymentUrl = robokassaService.buildPaymentUrl({ req: req as AuthedRequest, order });
  return res.status(201).json({
    inv_id: order.inv_id,
    package_id: order.package_id,
    credits: order.credits,
    tokens: order.tokens,
    amount_rub: order.amount_rub,
    payment_url: paymentUrl,
  });
}));

router.post('/robokassa/result', asyncHandler(async (req: Request, res: Response) => {
  const params = { ...req.body, ...req.query } as Record<string, unknown>;
  const verified = robokassaService.verifyResult(params);
  if (!verified.ok) {
    return res.status(400).send('bad signature');
  }

  const order = await paymentRepository.findByInvId(verified.invId);
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
    fee: params.Fee != null ? String(params.Fee) : null,
    paymentMethod: params.PaymentMethod != null ? String(params.PaymentMethod) : null,
    signature: verified.received,
  });

  return res.type('text/plain').send(`OK${order.inv_id}`);
}));

router.all('/robokassa/success', (_req: Request, res: Response) => {
  res.redirect('/?payment=success');
});

router.all('/robokassa/fail', (_req: Request, res: Response) => {
  res.redirect('/?payment=fail');
});

export = router;
