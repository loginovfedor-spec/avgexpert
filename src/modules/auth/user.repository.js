const bcrypt = require('bcrypt');
const db = require('../../core/sqlite');
const logger = require('../../core/logger').scoped('UserRepository');

class UserRepository {
  _mapRow(row) {
    let allowed_categories = [];
    if (row.allowed_categories) {
      try {
        allowed_categories = JSON.parse(row.allowed_categories);
      } catch (e) {
        allowed_categories = [];
      }
    }
    return {
      ...row,
      must_change_password: !!row.must_change_password,
      is_admin: !!row.is_admin,
      is_blocked: !!row.is_blocked,
      tokens_allocated: row.tokens_allocated || 0,
      tokens_input_used: row.tokens_input_used || 0,
      tokens_output_used: row.tokens_output_used || 0,
      input_context_credits: row.input_context_credits != null ? parseInt(row.input_context_credits, 10) : null,
      output_generation_credits: row.output_generation_credits != null ? parseInt(row.output_generation_credits, 10) : null,
      allowed_categories,
    };
  }

  async findByUsername(username) {
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!row) return null;
    return this._mapRow(row);
  }

  async findByEmail(email) {
    if (!email) return null;
    const row = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);
    if (!row) return null;
    return this._mapRow(row);
  }

  async save(username, user) {
    const allowedCategoriesStr = Array.isArray(user.allowed_categories)
      ? JSON.stringify(user.allowed_categories)
      : (typeof user.allowed_categories === 'string' ? user.allowed_categories : null);

    db.prepare(`
      INSERT INTO users (username, password_hash, category, expiration_date, n_ctx, system_prompt, email, must_change_password, token_version, allowed_categories, is_admin, tokens_allocated, is_blocked, input_context_credits, output_generation_credits)
      VALUES (@username, @password_hash, @category, @expiration_date, @n_ctx, @system_prompt, @email, @must_change_password, 0, @allowed_categories, @is_admin, @tokens_allocated, @is_blocked, @input_context_credits, @output_generation_credits)
      ON CONFLICT(username) DO UPDATE SET
        password_hash=excluded.password_hash,
        category=excluded.category,
        expiration_date=excluded.expiration_date,
        n_ctx=excluded.n_ctx,
        system_prompt=excluded.system_prompt,
        email=excluded.email,
        must_change_password=excluded.must_change_password,
        allowed_categories=excluded.allowed_categories,
        is_admin=excluded.is_admin,
        tokens_allocated=excluded.tokens_allocated,
        is_blocked=excluded.is_blocked,
        input_context_credits=excluded.input_context_credits,
        output_generation_credits=excluded.output_generation_credits,
        token_version = CASE WHEN users.password_hash != excluded.password_hash THEN users.token_version + 1 ELSE users.token_version END
    `).run({
      username,
      password_hash: user.password_hash,
      category: user.category || null,
      expiration_date: user.expiration_date || null,
      n_ctx: user.n_ctx || null,
      system_prompt: user.system_prompt || null,
      email: user.email || null,
      must_change_password: user.must_change_password ? 1 : 0,
      allowed_categories: allowedCategoriesStr,
      is_admin: user.is_admin ? 1 : 0,
      tokens_allocated: user.tokens_allocated != null ? parseInt(user.tokens_allocated) : 0,
      is_blocked: user.is_blocked ? 1 : 0,
      input_context_credits: user.input_context_credits != null ? parseInt(user.input_context_credits, 10) : null,
      output_generation_credits: user.output_generation_credits != null ? parseInt(user.output_generation_credits, 10) : null,
    });
  }

  async delete(username) {
    const info = db.prepare('DELETE FROM users WHERE username = ?').run(username);
    return info.changes > 0;
  }

  async listAll() {
    const rows = db.prepare('SELECT * FROM users').all();
    const result = {};
    for (const row of rows) {
      result[row.username] = this._mapRow(row);
    }
    return result;
  }

  async countActive() {
    return db.prepare(`
      SELECT COUNT(*) as c
      FROM users
      WHERE expiration_date IS NOT NULL
        AND unixepoch(expiration_date) > unixepoch('now')
    `).get().c;
  }

  async countExpired() {
    return db.prepare(`
      SELECT COUNT(*) as c
      FROM users
      WHERE expiration_date IS NOT NULL
        AND unixepoch(expiration_date) < unixepoch('now')
    `).get().c;
  }

  async countTotal() {
    return db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  }

  async hashPassword(password) {
    return bcrypt.hash(password, 10);
  }

  /**
   * Atomically adds input/output token counts for a user, weighted by category complexity.
   * complexity = category.complexity (default 1.0). Effective cost = tokens * complexity.
   * Returns { allocated, input_used, output_used, balance }.
   */
  addTokenUsage(username, inputTokens, outputTokens, complexity = 1.0) {
    const factor = Math.max(0.01, parseFloat(complexity) || 1.0);
    const inp = Math.max(0, Math.round((inputTokens || 0) * factor));
    const out = Math.max(0, Math.round((outputTokens || 0) * factor));

    db.prepare(`
      UPDATE users
      SET tokens_input_used = tokens_input_used + @inp,
          tokens_output_used = tokens_output_used + @out
      WHERE username = @username
    `).run({ username, inp, out });

    if (inp > 0 || out > 0) {
      db.prepare(`
        INSERT INTO token_usage_history
          (username, tokens_allocated, tokens_input, tokens_output, recorded_at, reason)
        VALUES
          (@username, 0, @tokens_input, @tokens_output, @recorded_at, 'chat_usage')
      `).run({
        username,
        tokens_input: inp,
        tokens_output: out,
        recorded_at: Date.now(),
      });
    }

    return this.getTokenBalance(username);
  }

  /**
   * Returns token balance for the user.
   * { allocated, input_used, output_used, total_used, balance }
   */
  getTokenBalance(username) {
    const row = db.prepare(
      'SELECT tokens_allocated, tokens_input_used, tokens_output_used FROM users WHERE username = ?'
    ).get(username);
    if (!row) return null;
    const allocated = row.tokens_allocated || 0;
    const input_used = row.tokens_input_used || 0;
    const output_used = row.tokens_output_used || 0;
    const total_used = input_used + output_used;
    const balance = allocated - total_used;
    return { allocated, input_used, output_used, total_used, balance };
  }

  /**
   * Archives current token usage to history, resets ALL counters to 0, and blocks the user.
   * Called when balance reaches 0 or below.
   *
   * History record stores the quota (tokens_allocated) and the consumed amounts
   * (tokens_input_used, tokens_output_used) as they were at the moment of reset.
   * After archiving: tokens_allocated = 0, tokens_input_used = 0, tokens_output_used = 0, is_blocked = 1.
   */
  archiveAndBlock(username, reason = 'tokens_exhausted') {
    const bal = this.getTokenBalance(username);
    if (!bal) return;

    db.transaction(() => {
      // Archive snapshot: allocated + consumed at the moment of exhaustion
      db.prepare(`
        INSERT INTO token_usage_history
          (username, tokens_allocated, tokens_input, tokens_output, recorded_at, reason)
        VALUES
          (@username, @tokens_allocated, @tokens_input, @tokens_output, @recorded_at, @reason)
      `).run({
        username,
        tokens_allocated: bal.allocated,
        tokens_input:     bal.input_used,
        tokens_output:    bal.output_used,
        recorded_at:      Date.now(),
        reason,
      });

      // Reset ALL counters to 0 and block
      db.prepare(`
        UPDATE users
        SET tokens_allocated  = 0,
            tokens_input_used  = 0,
            tokens_output_used = 0,
            is_blocked         = 1
        WHERE username = @username
      `).run({ username });
    })();

    logger.warn('User exhausted token quota. Archived and blocked', {
      username,
      allocated: bal.allocated,
      inputUsed: bal.input_used,
      outputUsed: bal.output_used
    });
  }

  /**
   * Returns token usage history for a user.
   */
  getTokenHistory(username, limit = 50) {
    return db.prepare(
      'SELECT * FROM token_usage_history WHERE username = ? ORDER BY recorded_at DESC LIMIT ?'
    ).all(username, limit);
  }
}

module.exports = new UserRepository();
