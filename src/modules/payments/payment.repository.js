const { getDatabasePort, ensureAppPgReady } = require('../../core/pg');
const userRepository = require('../auth/user.repository');

class PaymentRepository {
  async _db() {
    await ensureAppPgReady();
    return getDatabasePort();
  }

  async createOrder({ username, packageId, credits, tokens, amountRub }) {
    const db = await this._db();
    const createdAt = Date.now();
    const row = await db.get(`
      INSERT INTO payment_orders
        (username, package_id, credits, tokens, amount_rub, status, created_at)
      VALUES
        (@username, @packageId, @credits, @tokens, @amountRub, 'pending', @createdAt)
      RETURNING id
    `, { username, packageId, credits, tokens, amountRub, createdAt });

    const orderId = row.id;
    await db.run(
      'UPDATE payment_orders SET inv_id = @invId WHERE id = @id',
      { invId: orderId, id: orderId }
    );
    return this.findByInvId(orderId);
  }

  async findByInvId(invId) {
    const db = await this._db();
    return db.get('SELECT * FROM payment_orders WHERE inv_id = @invId', { invId });
  }

  async markPaidAndCredit(order, details) {
    const db = await this._db();
    return db.withTransaction(async (tx) => {
      const current = await tx.get(
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
        const latest = await tx.get(
          'SELECT * FROM payment_orders WHERE inv_id = @invId',
          { invId: order.inv_id }
        );
        return { credited: false, order: latest };
      }

      await userRepository.creditTokens(
        order.username,
        order.tokens,
        'robokassa_payment',
        tx
      );

      const paid = await tx.get(
        'SELECT * FROM payment_orders WHERE inv_id = @invId',
        { invId: order.inv_id }
      );
      return { credited: true, order: paid };
    });
  }
}

module.exports = new PaymentRepository();
