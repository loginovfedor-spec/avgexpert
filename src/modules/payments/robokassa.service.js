const crypto = require('crypto');
const { robokassa } = require('../../core/config');

const PACKAGES = Object.freeze({
  starter: { id: 'starter', amountRub: 200, credits: 1000, name: 'Пополнение баланса AVG Expert 1000 кредитов' },
  standard: { id: 'standard', amountRub: 2000, credits: 12000, name: 'Пополнение баланса AVG Expert 12000 кредитов' },
  pro: { id: 'pro', amountRub: 20000, credits: 150000, name: 'Пополнение баланса AVG Expert 150000 кредитов' },
});

const PAYMENT_METHODS = Object.freeze(['BankCard', 'SBP']);

function getPackage(packageId) {
  const pack = PACKAGES[packageId];
  if (!pack) return null;
  return { ...pack, tokens: pack.credits * 1000 };
}

function getPackageByAmount(amountRub) {
  return Object.values(PACKAGES).find(pack => pack.amountRub === Number(amountRub)) || null;
}

function assertConfigured() {
  if (!robokassa.merchantLogin || !robokassa.password1 || !robokassa.password2) {
    throw new Error('Robokassa is not configured');
  }
}

function digest(value) {
  return crypto.createHash(robokassa.hashAlgo).update(value).digest('hex');
}

function collectShp(params) {
  return Object.keys(params)
    .filter(key => /^Shp_[A-Za-z0-9_]+$/.test(key))
    .sort()
    .map(key => `${key}=${params[key]}`);
}

function buildStartSignature({ outSum, invId, receipt, shp }) {
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

function buildResultSignature({ outSum, invId, shp }) {
  const parts = [outSum, String(invId), robokassa.password2, ...shp];
  return digest(parts.join(':'));
}

function getOrderDescription(order) {
  const pack = getPackage(order.package_id);
  if (pack?.name) return pack.name;
  return `Пополнение баланса AVG Expert ${order.credits} кредитов`;
}

function buildReceipt({ order, description, outSum }) {
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

function encodeReceipt(receipt) {
  return encodeURIComponent(receipt);
}

function getCustomerEmail(req) {
  const email = req?.user?.email;
  return typeof email === 'string' && email.includes('@') ? email : null;
}

function buildPaymentUrl({ req, order }) {
  assertConfigured();

  const outSum = Number(order.amount_rub).toFixed(2);
  const description = getOrderDescription(order);
  const receipt = encodeReceipt(buildReceipt({ order, description, outSum }));
  const shpParams = {
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
  PAYMENT_METHODS.forEach(method => params.append('PaymentMethods', method));

  if (robokassa.isTest) params.set('IsTest', '1');

  return `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`;
}

function verifyResult(params) {
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

module.exports = {
  PACKAGES,
  getPackage,
  getPackageByAmount,
  buildPaymentUrl,
  verifyResult,
};
