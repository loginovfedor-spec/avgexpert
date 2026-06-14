import { getDatabasePort, ensureAppPgReady } from '../../core/pg';
import type { DatabasePort } from '../../core/pg/database.port';
import userRepository from '../auth/user.repository';
import exchangeRateService from '../cost/exchange_rate.service';
type PaymentOrder = {
  id?: number;
  inv_id: number;
  username: string;
  package_id: string;
  credits: number;
  tokens: number;
  amount_rub: number | string;
  status: string;
  robokassa_out_sum?: string | null;
  robokassa_fee?: string | null;
  payment_method?: string | null;
  signature?: string | null;
  created_at?: number;
  paid_at?: number | null;
  [key: string]: unknown;
};

type CreateOrderInput = {
  username: string;
  packageId: string;
  credits: number;
  tokens: number;
  amountRub: number;
};

type PaymentDetails = {
  outSum: string;
  fee?: string | null;
  paymentMethod?: string | null;
  signature: string;
};

type MarkPaidResult = {
  credited: boolean;
  order: PaymentOrder | null;
};

class PaymentRepository {
  async _db(): Promise<DatabasePort> {
    await ensureAppPgReady();
    return getDatabasePort();
  }

  async createOrder({ username, packageId, credits, tokens, amountRub }: CreateOrderInput): Promise<PaymentOrder | null> {
    const db = await this._db();
    const createdAt = Date.now();
    const row = await db.get<{ id: number }>(`
      INSERT INTO payment_orders
        (username, package_id, credits, tokens, amount_rub, status, created_at)
      VALUES
        (@username, @packageId, @credits, @tokens, @amountRub, 'pending', @createdAt)
      RETURNING id
    `, { username, packageId, credits, tokens, amountRub, createdAt });

    if (!row?.id) {
      throw new Error('Failed to create payment order');
    }

    const orderId = row.id;
    await db.run(
      'UPDATE payment_orders SET inv_id = @invId WHERE id = @id',
      { invId: orderId, id: orderId }
    );
    return this.findByInvId(orderId);
  }

  async findByInvId(invId: number): Promise<PaymentOrder | null> {
    const db = await this._db();
    return db.get<PaymentOrder>('SELECT * FROM payment_orders WHERE inv_id = @invId', { invId });
  }

  async markPaidAndCredit(order: PaymentOrder, details: PaymentDetails): Promise<MarkPaidResult> {
    const db = await this._db();
    return db.withTransaction(async (tx) => {
      const current = await tx.get<PaymentOrder>(
        'SELECT * FROM payment_orders WHERE inv_id = @invId',
        { invId: order.inv_id }
      );
      if (!current) throw new Error('Payment order not found');
      if (current.status === 'paid') return { credited: false, order: current };

      const paidAt = Date.now();
      const update = await tx.run(`
        UPDATE payment_orders
        SET status = 'paid',
            robokassa_out_sum = @outSum,
            robokassa_fee = @fee,
            payment_method = @paymentMethod,
            signature = @signature,
            paid_at = @paidAt
        WHERE inv_id = @invId AND status != 'paid'
      `, {
        invId: order.inv_id,
        outSum: details.outSum,
        fee: details.fee || null,
        paymentMethod: details.paymentMethod || null,
        signature: details.signature,
        paidAt,
      });

      if (update.changes === 0) {
        const latest = await tx.get<PaymentOrder>(
          'SELECT * FROM payment_orders WHERE inv_id = @invId',
          { invId: order.inv_id }
        );
        return { credited: false, order: latest };
      }

      const usdRate = await exchangeRateService.getRate('USD');
      const amountRub = typeof order.amount_rub === 'string' ? parseFloat(order.amount_rub) : order.amount_rub;
      const creditedUsd = amountRub / usdRate;

      await tx.run(`
        UPDATE payment_orders
        SET credited_usd = @creditedUsd,
            exchange_rate = @usdRate
        WHERE inv_id = @invId
      `, {
        creditedUsd,
        usdRate,
        invId: order.inv_id
      });

      await tx.run(`
        UPDATE users
        SET balance_usd = balance_usd + @creditedUsd,
            is_blocked = false
        WHERE username = @username
      `, {
        creditedUsd,
        username: order.username
      });

      const recordedAt = Date.now();
      await tx.run(`
        INSERT INTO balance_transactions (
          username, amount, type, reference_type, reference_id,
          exchange_rate, amount_original, currency_original, recorded_at
        ) VALUES (
          @username, @creditedUsd, 'deposit', 'payment_order', @referenceId,
          @usdRate, @amountRub, 'RUB', @recordedAt
        )
      `, {
        username: order.username,
        creditedUsd,
        referenceId: String(order.inv_id),
        usdRate,
        amountRub,
        recordedAt
      });

      const paid = await tx.get<PaymentOrder>(
        'SELECT * FROM payment_orders WHERE inv_id = @invId',
        { invId: order.inv_id }
      );
      return { credited: true, order: paid };
    });
  }
}

export = new PaymentRepository();
