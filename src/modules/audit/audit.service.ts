import { getDatabasePort, ensureAppPgReady } from '../../core/pg';
import type { DatabasePort } from '../../core/pg/database.port';
import { RedactionService } from '../policy/redaction.service';
import logger from '../../core/logger';
const auditLogger = logger.scoped('AuditService');

type AuditLogInput = {
  username?: string | null;
  action: string;
  details?: unknown;
  ip_address?: string | null;
};

type GetLogsOptions = {
  limit?: number;
  offset?: number;
  username?: string | null;
  action?: string | null;
};

class AuditService {
  static async _db(): Promise<DatabasePort> {
    await ensureAppPgReady();
    return getDatabasePort();
  }

  static log(usernameOrObj: string | AuditLogInput | null, action?: string, details: unknown = null, ip_address: string | null = null): void {
    void AuditService._persist(usernameOrObj, action, details, ip_address).catch((error: unknown) => {
      auditLogger.error('Failed to insert audit log', error);
    });
  }

  static async _persist(
    usernameOrObj: string | AuditLogInput | null,
    action?: string,
    details: unknown = null,
    ip_address: string | null = null
  ): Promise<void> {
    let username: string | null = typeof usernameOrObj === 'string' ? usernameOrObj : null;
    let finalAction = action;
    let finalDetails = details;
    let finalIp = ip_address;

    if (typeof usernameOrObj === 'object' && usernameOrObj !== null && !action) {
      username = usernameOrObj.username || null;
      finalAction = usernameOrObj.action;
      finalDetails = usernameOrObj.details || usernameOrObj;
      finalIp = usernameOrObj.ip_address || null;
      if (typeof finalDetails === 'object' && finalDetails !== null) {
        const rest = { ...(finalDetails as Record<string, unknown>) };
        delete rest.username;
        delete rest.action;
        delete rest.ip_address;
        finalDetails = rest;
      }
    }

    const db = await AuditService._db();
    const redactedDetails = RedactionService.redact(finalDetails);

    await db.run(`
      INSERT INTO audit_logs (username, action, details, ip_address, created_at)
      VALUES (@username, @action, @details, @ip_address, @created_at)
    `, {
      username: username || null,
      action: finalAction || 'UNKNOWN',
      details: redactedDetails
        ? (typeof redactedDetails === 'object' ? JSON.stringify(redactedDetails) : String(redactedDetails))
        : null,
      ip_address: finalIp || null,
      created_at: Date.now(),
    });
  }

  static async getLogs({ limit = 50, offset = 0, username = null, action = null }: GetLogsOptions = {}) {
    let query = 'SELECT * FROM audit_logs';
    const params: Record<string, unknown> = {};
    const conditions: string[] = [];

    if (username) {
      conditions.push('username = @username');
      params.username = username;
    }

    if (action) {
      conditions.push('action = @action');
      params.action = action;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC LIMIT @limit OFFSET @offset';
    params.limit = limit;
    params.offset = offset;

    const db = await AuditService._db();
    return db.all(query, params);
  }
}

export = AuditService;
