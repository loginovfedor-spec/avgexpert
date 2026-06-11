const db = require('../../core/sqlite');
const userRepository = require('../auth/user.repository');

class PaymentRepository {
  createOrder({ username, packageId, credits, tokens, amountRub }) {
    const createdAt = Date.now();
    const info = db.prepare(`
      INSERT INTO payment_orders
        (username, package_id, credits, tokens, amount_rub, status, created_at)
      VALUES
        (@username, @packageId, @credits, @tokens, @amountRub, 'pending', @createdAt)
    `).run({ username, packageId, credits, tokens, amountRub, createdAt });

    const invId = Number(info.lastInsertRowid);
    db.prepare('UPDATE payment_orders SET inv_id = ? WHERE id = ?').run(invId, invId);
    return this.findByInvId(invId);
  }

  findByInvId(invId) {
    return db.prepare('SELECT * FROM payment_orders WHERE inv_id = ?').get(invId);
  }

  async markPaidAndCredit(order, details) {
    const current = this.findByInvId(order.inv_id);
    if (!current) throw new Error('Payment order not found');
    if (current.status === 'paid') return { credited: false, order: current };

    const paidAt = Date.now();
    const update = db.prepare(`
      UPDATE payment_orders
      SET status = 'paid',
          robokassa_out_sum = @outSum,
          robokassa_fee = @fee,
          payment_method = @paymentMethod,
          signature = @signature,
          paid_at = @paidAt
      WHERE inv_id = @invId AND status != 'paid'
    `).run({
      invId: order.inv_id,
      outSum: details.outSum,
      fee: details.fee || null,
      paymentMethod: details.paymentMethod || null,
      signature: details.signature,
      paidAt,
    });

    if (update.changes === 0) {
      const latest = this.findByInvId(order.inv_id);
      return { credited: false, order: latest };
    }

    await userRepository.creditTokens(order.username, order.tokens, 'robokassa_payment');
    return { credited: true, order: this.findByInvId(order.inv_id) };
  }
}

module.exports = new PaymentRepository();
