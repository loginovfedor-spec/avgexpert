const db = require('../../core/sqlite');

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

  markPaidAndCredit(order, details) {
    return db.transaction(() => {
      const current = this.findByInvId(order.inv_id);
      if (!current) throw new Error('Payment order not found');
      if (current.status === 'paid') return { credited: false, order: current };

      db.prepare(`
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
        paidAt: Date.now(),
      });

      db.prepare(`
        UPDATE users
        SET tokens_allocated = tokens_allocated + @tokens,
            is_blocked = 0
        WHERE username = @username
      `).run({ username: order.username, tokens: order.tokens });

      db.prepare(`
        INSERT INTO token_usage_history
          (username, tokens_allocated, tokens_input, tokens_output, recorded_at, reason)
        VALUES
          (@username, @tokens_allocated, 0, 0, @recorded_at, 'robokassa_payment')
      `).run({
        username: order.username,
        tokens_allocated: order.tokens,
        recorded_at: Date.now(),
      });

      return { credited: true, order: this.findByInvId(order.inv_id) };
    })();
  }
}

module.exports = new PaymentRepository();
