const bcrypt = require('bcrypt');
const { getDatabasePort, isAppPgEnabled, ensureAppPgReady } = require('../../core/pg');
const logger = require('../../core/logger').scoped('UserRepository');

class UserRepository {
  async _db() {
    await ensureAppPgReady();
    return getDatabasePort();
  }

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
      rag_enabled: row.rag_enabled !== 0 && row.rag_enabled !== false,
      allowed_categories,
    };
  }

  async findByUsername(username) {
    const db = await this._db();
    const row = await db.get('SELECT * FROM users WHERE username = @username', { username });
    if (!row) return null;
    return this._mapRow(row);
  }

  async findByEmail(email) {
    if (!email) return null;
    const db = await this._db();
    const row = await db.get('SELECT * FROM users WHERE lower(email) = lower(@email)', { email });
    if (!row) return null;
    return this._mapRow(row);
  }

  async save(username, user) {
    const db = await this._db();
    const allowedCategoriesStr = Array.isArray(user.allowed_categories)
      ? JSON.stringify(user.allowed_categories)
      : (typeof user.allowed_categories === 'string' ? user.allowed_categories : null);

    await db.run(`
      INSERT INTO users (username, password_hash, category, expiration_date, n_ctx, system_prompt, email, must_change_password, token_version, allowed_categories, is_admin, tokens_allocated, is_blocked, input_context_credits, output_generation_credits, rag_enabled)
      VALUES (@username, @password_hash, @category, @expiration_date, @n_ctx, @system_prompt, @email, @must_change_password, 0, @allowed_categories, @is_admin, @tokens_allocated, @is_blocked, @input_context_credits, @output_generation_credits, @rag_enabled)
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
        rag_enabled=excluded.rag_enabled,
        token_version = CASE WHEN users.password_hash != excluded.password_hash THEN users.token_version + 1 ELSE users.token_version END
    `, {
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
      tokens_allocated: user.tokens_allocated != null ? parseInt(user.tokens_allocated, 10) : 0,
      is_blocked: user.is_blocked ? 1 : 0,
      input_context_credits: user.input_context_credits != null ? parseInt(user.input_context_credits, 10) : null,
      output_generation_credits: user.output_generation_credits != null ? parseInt(user.output_generation_credits, 10) : null,
      rag_enabled: user.rag_enabled === false || user.rag_enabled === 0 ? 0 : 1,
    });
  }

  async delete(username) {
    const db = await this._db();
    const info = await db.run('DELETE FROM users WHERE username = @username', { username });
    return info.changes > 0;
  }

  async listAll() {
    const db = await this._db();
    const rows = await db.all('SELECT * FROM users');
    const result = {};
    for (const row of rows) {
      result[row.username] = this._mapRow(row);
    }
    return result;
  }

  async countActive() {
    const db = await this._db();
    const sql = isAppPgEnabled()
      ? `SELECT COUNT(*)::int AS c FROM users WHERE expiration_date IS NOT NULL AND expiration_date::date > CURRENT_DATE`
      : `SELECT COUNT(*) as c FROM users WHERE expiration_date IS NOT NULL AND unixepoch(expiration_date) > unixepoch('now')`;
    const row = await db.get(sql);
    return row.c;
  }

  async countExpired() {
    const db = await this._db();
    const sql = isAppPgEnabled()
      ? `SELECT COUNT(*)::int AS c FROM users WHERE expiration_date IS NOT NULL AND expiration_date::date < CURRENT_DATE`
      : `SELECT COUNT(*) as c FROM users WHERE expiration_date IS NOT NULL AND unixepoch(expiration_date) < unixepoch('now')`;
    const row = await db.get(sql);
    return row.c;
  }

  async countTotal() {
    const db = await this._db();
    const row = await db.get(isAppPgEnabled()
      ? 'SELECT COUNT(*)::int AS c FROM users'
      : 'SELECT COUNT(*) as c FROM users');
    return row.c;
  }

  async hashPassword(password) {
    return bcrypt.hash(password, 10);
  }

  async addTokenUsage(username, inputTokens, outputTokens, complexity = 1.0) {
    const factor = Math.max(0.01, parseFloat(complexity) || 1.0);
    const inp = Math.max(0, Math.round((inputTokens || 0) * factor));
    const out = Math.max(0, Math.round((outputTokens || 0) * factor));

    const db = await this._db();
    await db.run(`
      UPDATE users
      SET tokens_input_used = tokens_input_used + @inp,
          tokens_output_used = tokens_output_used + @out
      WHERE username = @username
    `, { username, inp, out });

    if (inp > 0 || out > 0) {
      await db.run(`
        INSERT INTO token_usage_history
          (username, tokens_allocated, tokens_input, tokens_output, recorded_at, reason)
        VALUES
          (@username, 0, @tokens_input, @tokens_output, @recorded_at, 'chat_usage')
      `, {
        username,
        tokens_input: inp,
        tokens_output: out,
        recorded_at: Date.now(),
      });
    }

    return this.getTokenBalance(username);
  }

  async getTokenBalance(username) {
    const db = await this._db();
    const row = await db.get(
      'SELECT tokens_allocated, tokens_input_used, tokens_output_used FROM users WHERE username = @username',
      { username }
    );
    if (!row) return null;
    const allocated = row.tokens_allocated || 0;
    const input_used = row.tokens_input_used || 0;
    const output_used = row.tokens_output_used || 0;
    const total_used = input_used + output_used;
    const balance = allocated - total_used;
    return { allocated, input_used, output_used, total_used, balance };
  }

  async archiveAndBlock(username, reason = 'tokens_exhausted') {
    const bal = await this.getTokenBalance(username);
    if (!bal) return;

    const db = await this._db();
    await db.withTransaction(async (tx) => {
      await tx.run(`
        INSERT INTO token_usage_history
          (username, tokens_allocated, tokens_input, tokens_output, recorded_at, reason)
        VALUES
          (@username, @tokens_allocated, @tokens_input, @tokens_output, @recorded_at, @reason)
      `, {
        username,
        tokens_allocated: bal.allocated,
        tokens_input: bal.input_used,
        tokens_output: bal.output_used,
        recorded_at: Date.now(),
        reason,
      });

      await tx.run(`
        UPDATE users
        SET tokens_allocated  = 0,
            tokens_input_used  = 0,
            tokens_output_used = 0,
            is_blocked         = 1
        WHERE username = @username
      `, { username });
    });

    logger.warn('User exhausted token quota. Archived and blocked', {
      username,
      allocated: bal.allocated,
      inputUsed: bal.input_used,
      outputUsed: bal.output_used
    });
  }

  async getTokenHistory(username, limit = 50) {
    const db = await this._db();
    return db.all(
      'SELECT * FROM token_usage_history WHERE username = @username ORDER BY recorded_at DESC LIMIT @limit',
      { username, limit }
    );
  }

  async getTokenHistoryAsc(username) {
    const db = await this._db();
    return db.all(
      'SELECT * FROM token_usage_history WHERE username = @username ORDER BY recorded_at ASC, id ASC',
      { username }
    );
  }

  async creditTokens(username, tokens, reason = 'payment', executor = null) {
    const amount = Math.max(0, parseInt(tokens, 10) || 0);
    if (amount <= 0) return;

    const applyCredit = async (tx) => {
      await tx.run(`
        UPDATE users
        SET tokens_allocated = tokens_allocated + @tokens,
            is_blocked = 0
        WHERE username = @username
      `, { username, tokens: amount });

      await tx.run(`
        INSERT INTO token_usage_history
          (username, tokens_allocated, tokens_input, tokens_output, recorded_at, reason)
        VALUES
          (@username, @tokens_allocated, 0, 0, @recorded_at, @reason)
      `, {
        username,
        tokens_allocated: amount,
        recorded_at: Date.now(),
        reason,
      });
    };

    if (executor) {
      await applyCredit(executor);
      return;
    }

    const db = await this._db();
    await db.withTransaction(applyCredit);
  }

  async recordAdminTokenAdjustment(username, tokensDelta) {
    const db = await this._db();
    await db.run(`
      INSERT INTO token_usage_history
        (username, tokens_allocated, tokens_input, tokens_output, recorded_at, reason)
      VALUES
        (@username, @tokens_allocated, 0, 0, @recorded_at, 'admin_adjustment')
    `, {
      username,
      tokens_allocated: tokensDelta,
      recorded_at: Date.now(),
    });
  }
}

module.exports = new UserRepository();
