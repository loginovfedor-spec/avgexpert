const { getDatabasePort, ensureAppPgReady } = require('../../core/pg');
const { RedactionService } = require('../policy/redaction.service');
const logger = require('../../core/logger').scoped('AuditService');

class AuditService {
  static async _db() {
    await ensureAppPgReady();
    return getDatabasePort();
  }

  /**
   * Log an action to the audit log.
   */
  static log(usernameOrObj, action, details = null, ip_address = null) {
    void AuditService._persist(usernameOrObj, action, details, ip_address).catch((error) => {
      logger.error('Failed to insert audit log', error);
    });
  }

  static async _persist(usernameOrObj, action, details = null, ip_address = null) {
    let username = usernameOrObj;
    let finalAction = action;
    let finalDetails = details;
    let finalIp = ip_address;

    if (typeof usernameOrObj === 'object' && usernameOrObj !== null && !action) {
      username = usernameOrObj.username || null;
      finalAction = usernameOrObj.action;
      finalDetails = usernameOrObj.details || usernameOrObj;
      finalIp = usernameOrObj.ip_address || null;
      if (typeof finalDetails === 'object') {
        const { username: _u, action: _a, ip_address: _i, ...rest } = finalDetails;
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

  static async getLogs({ limit = 50, offset = 0, username = null, action = null } = {}) {
    let query = 'SELECT * FROM audit_logs';
    const params = {};
    const conditions = [];

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

module.exports = AuditService;
