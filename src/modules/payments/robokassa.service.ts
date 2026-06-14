import crypto from 'crypto';
import type { Request } from 'express';

import { robokassa } from '../../core/config';
import { getUsdExchangeRate } from './cbr.service';

type PaymentOrderFields = {
  amount_rub: number | string;
  inv_id: number;
  package_id: string;
  credits: number;
};

type PackageId = 'starter' | 'standard' | 'pro' | 'custom';

type Package = {
  id: PackageId;
  amountRub: number;
  credits: number;
  name: string;
};

type PackageWithBalance = Package & { tokens: number };

type PaymentRequest = Request & {
  user?: { email?: string | null };
};

type BuildPaymentUrlInput = {
  req: PaymentRequest;
  order: PaymentOrderFields;
};

type VerifyResult = {
  ok: boolean;
  outSum: string;
  invId: number;
  expected: string;
  received: string;
  shp: string[];
};

const PACKAGES = Object.freeze({
  starter: { id: 'starter', amountRub: 500, credits: 5, name: '5 кредитов AVG Expert' },
  standard: { id: 'standard', amountRub: 2000, credits: 20, name: '20 кредитов AVG Expert' },
  pro: { id: 'pro', amountRub: 20000, credits: 200, name: '200 кредитов AVG Expert' },
}) as Record<string, Package>;

const PAYMENT_METHODS = Object.freeze(['BankCard', 'SBP']);

function getPackage(packageId: string): PackageWithBalance | null {
  const pack = PACKAGES[packageId];
  if (!pack) return null;
  return { ...pack, tokens: 0 };
}

async function getCustomPackage(amountRub: number): Promise<PackageWithBalance | null> {
  if (amountRub < 200 || amountRub > 20000) return null;
  const exchangeRate = await getUsdExchangeRate();
  const credits = parseFloat((amountRub / exchangeRate).toFixed(2));
  return {
    id: 'custom',
    amountRub,
    credits,
    name: `${credits} кредитов AVG Expert`,
    tokens: 0,
  };
}

function assertConfigured(): void {
  if (!robokassa.merchantLogin || !robokassa.password1 || !robokassa.password2) {
    throw new Error('Robokassa is not configured');
  }
}

function digest(value: string): string {
  return crypto.createHash(robokassa.hashAlgo).update(value).digest('hex');
}

function collectShp(params: Record<string, unknown>): string[] {
  return Object.keys(params)
    .filter((key) => /^Shp_[A-Za-z0-9_]+$/.test(key))
    .sort()
    .map((key) => `${key}=${params[key]}`);
}

function buildStartSignature({
  outSum,
  invId,
  receipt,
  shp,
}: {
  outSum: string;
  invId: number;
  receipt?: string;
  shp: string[];
}): string {
  const parts = [
    robokassa.merchantLogin,
    outSum,
    String(invId),
    ...(receipt ? [receipt] : []),
    robokassa.password1,
    ...shp,
  ];
  return digest(parts.join(':'));
}

function buildResultSignature({
  outSum,
  invId,
  shp,
}: {
  outSum: string;
  invId: string;
  shp: string[];
}): string {
  const parts = [outSum, String(invId), robokassa.password2, ...shp];
  return digest(parts.join(':'));
}

function getOrderDescription(order: Pick<PaymentOrderFields, 'package_id' | 'credits'>): string {
  const pack = getPackage(order.package_id);
  if (pack?.name) return pack.name;
  return `Пополнение баланса ${order.credits} кредитов`;
}

function buildReceipt({
  description,
  outSum,
}: {
  order: Pick<PaymentOrderFields, 'package_id' | 'credits'>;
  description: string;
  outSum: string;
}): string {
  return JSON.stringify({
    items: [
      {
        name: description,
        quantity: 1,
        sum: Number(outSum),
        payment_method: 'full_payment',
        payment_object: 'service',
        tax: 'none',
      },
    ],
  });
}

function encodeReceipt(receipt: string): string {
  return encodeURIComponent(receipt);
}

function getCustomerEmail(req: PaymentRequest): string | null {
  const email = req?.user?.email;
  return typeof email === 'string' && email.includes('@') ? email : null;
}

function buildPaymentUrl({ req, order }: BuildPaymentUrlInput): string {
  assertConfigured();

  const outSum = Number(order.amount_rub).toFixed(2);
  const description = getOrderDescription(order);
  const receipt = encodeReceipt(buildReceipt({ order, description, outSum }));
  const shpParams: Record<string, string> = {
    Shp_package: order.package_id,
  };
  const shp = collectShp(shpParams);
  const signature = buildStartSignature({ outSum, invId: order.inv_id, receipt, shp });
  const customerEmail = getCustomerEmail(req);
  const params = new URLSearchParams({
    MerchantLogin: robokassa.merchantLogin,
    OutSum: outSum,
    InvId: String(order.inv_id),
    Description: description,
    Receipt: receipt,
    SignatureValue: signature,
    Culture: 'ru',
    Encoding: 'utf-8',
    ...shpParams,
  });
  if (customerEmail) params.set('Email', customerEmail);
  PAYMENT_METHODS.forEach((method) => params.append('PaymentMethods', method));

  if (robokassa.isTest) params.set('IsTest', '1');

  return `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`;
}

function verifyResult(params: Record<string, unknown>): VerifyResult {
  assertConfigured();

  const outSum = String(params.OutSum || '');
  const invId = String(params.InvId || params.InvID || '');
  const received = String(params.SignatureValue || '').toLowerCase();
  const shp = collectShp(params);
  const expected = buildResultSignature({ outSum, invId, shp }).toLowerCase();

  return {
    ok: !!outSum && !!invId && !!received && received === expected,
    outSum,
    invId: Number(invId),
    expected,
    received,
    shp,
  };
}

export = {
  PACKAGES,
  getPackage,
  getCustomPackage,
  buildPaymentUrl,
  verifyResult,
};
