import bcrypt from 'bcrypt';
import { getDatabasePort, isAppPgEnabled, ensureAppPgReady } from '../../core/pg';
import type { DatabasePort } from '../../core/pg/database.port';
import logger from '../../core/logger';
const userRepositoryLogger = logger.scoped('UserRepository');

type UserRecord = {
  username?: string;
  password_hash?: string;
  category?: string | null;
  expiration_date?: string | null;
  n_ctx?: number | null;
  system_prompt?: string | null;
  email?: string | null;
  must_change_password: boolean;
  token_version?: number;
  allowed_categories: string[];
  is_admin: boolean;
  is_blocked: boolean;
  input_context_credits: number | null;
  output_generation_credits: number | null;
  rag_enabled: boolean;
  balance_usd?: number;
  credit_limit_usd?: number;
  [key: string]: unknown;
};

type UserRow = Record<string, unknown> & {
  username?: string;
  allowed_categories?: string;
  must_change_password?: number | boolean;
  is_admin?: number | boolean;
  is_blocked?: number | boolean;
  input_context_credits?: number | string | null;
  output_generation_credits?: number | string | null;
  rag_enabled?: number | boolean;
  balance_usd?: number | string;
  credit_limit_usd?: number | string;
  cost_usd_used?: number | string;
};

class UserRepository {
  async _db(): Promise<DatabasePort> {
    await ensureAppPgReady();
    return getDatabasePort();
  }

  _mapRow(row: UserRow): UserRecord {
    let allowed_categories: string[] = [];
    if (row.allowed_categories) {
      try {
        allowed_categories = JSON.parse(row.allowed_categories) as string[];
      } catch (_e) {
        allowed_categories = [];
      }
    }
    return {
      ...row,
      must_change_password: !!row.must_change_password,
      is_admin: !!row.is_admin,
      is_blocked: !!row.is_blocked,
      input_context_credits: row.input_context_credits != null ? parseInt(String(row.input_context_credits), 10) : null,
      output_generation_credits: row.output_generation_credits != null ? parseInt(String(row.output_generation_credits), 10) : null,
      rag_enabled: row.rag_enabled !== 0 && row.rag_enabled !== false,
      balance_usd: row.balance_usd != null ? parseFloat(String(row.balance_usd)) : 0.0,
      credit_limit_usd: row.credit_limit_usd != null ? parseFloat(String(row.credit_limit_usd)) : 0.0,
      cost_usd_used: row.cost_usd_used != null ? parseFloat(String(row.cost_usd_used)) : 0.0,
      allowed_categories,
    };
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const db = await this._db();
    const row = await db.get('SELECT * FROM users WHERE username = @username', { username }) as UserRow | null;
    if (!row) return null;
    return this._mapRow(row);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    if (!email) return null;
    const db = await this._db();
    const row = await db.get('SELECT * FROM users WHERE lower(email) = lower(@email)', { email }) as UserRow | null;
    if (!row) return null;
    return this._mapRow(row);
  }

  async save(username: string, user: Partial<UserRecord>): Promise<void> {
    const db = await this._db();
    const allowedCategoriesStr = Array.isArray(user.allowed_categories)
      ? JSON.stringify(user.allowed_categories)
      : (typeof user.allowed_categories === 'string' ? user.allowed_categories : null);

    await db.run(`
      INSERT INTO users (username, password_hash, category, expiration_date, n_ctx, system_prompt, email, must_change_password, token_version, allowed_categories, is_admin, is_blocked, input_context_credits, output_generation_credits, rag_enabled, balance_usd, credit_limit_usd)
      VALUES (@username, @password_hash, @category, @expiration_date, @n_ctx, @system_prompt, @email, @must_change_password, 0, @allowed_categories, @is_admin, @is_blocked, @input_context_credits, @output_generation_credits, @rag_enabled, @balance_usd, @credit_limit_usd)
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
        is_blocked=excluded.is_blocked,
        input_context_credits=excluded.input_context_credits,
        output_generation_credits=excluded.output_generation_credits,
        rag_enabled=excluded.rag_enabled,
        balance_usd=excluded.balance_usd,
        credit_limit_usd=excluded.credit_limit_usd,
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
      is_blocked: user.is_blocked ? 1 : 0,
      input_context_credits: user.input_context_credits != null ? parseInt(String(user.input_context_credits), 10) : null,
      output_generation_credits: user.output_generation_credits != null ? parseInt(String(user.output_generation_credits), 10) : null,
      rag_enabled: user.rag_enabled === false ? 0 : 1,
      balance_usd: user.balance_usd != null ? parseFloat(String(user.balance_usd)) : 0.0,
      credit_limit_usd: user.credit_limit_usd != null ? parseFloat(String(user.credit_limit_usd)) : 0.0,
    });
  }

  async delete(username: string): Promise<boolean> {
    const db = await this._db();
    const info = await db.run('DELETE FROM users WHERE username = @username', { username });
    return info.changes > 0;
  }

  async listAll(): Promise<Record<string, UserRecord>> {
    const db = await this._db();
    const rows = await db.all('SELECT * FROM users') as UserRow[];
    const result: Record<string, UserRecord> = {};
    for (const row of rows) {
      if (row.username) {
        result[row.username] = this._mapRow(row);
      }
    }
    return result;
  }

  async countActive(): Promise<number> {
    const db = await this._db();
    const sql = isAppPgEnabled()
      ? 'SELECT COUNT(*)::int AS c FROM users WHERE expiration_date IS NOT NULL AND expiration_date::date > CURRENT_DATE'
      : "SELECT COUNT(*) as c FROM users WHERE expiration_date IS NOT NULL AND unixepoch(expiration_date) > unixepoch('now')";
    const row = await db.get(sql) as { c: number };
    return row.c;
  }

  async countExpired(): Promise<number> {
    const db = await this._db();
    const sql = isAppPgEnabled()
      ? 'SELECT COUNT(*)::int AS c FROM users WHERE expiration_date IS NOT NULL AND expiration_date::date < CURRENT_DATE'
      : "SELECT COUNT(*) as c FROM users WHERE expiration_date IS NOT NULL AND unixepoch(expiration_date) < unixepoch('now')";
    const row = await db.get(sql) as { c: number };
    return row.c;
  }

  async countTotal(): Promise<number> {
    const db = await this._db();
    const row = await db.get(isAppPgEnabled()
      ? 'SELECT COUNT(*)::int AS c FROM users'
      : 'SELECT COUNT(*) as c FROM users') as { c: number };
    return row.c;
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}

export = new UserRepository();
