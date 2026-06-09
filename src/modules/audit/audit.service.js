const db = require('../../core/sqlite');
const { RedactionService } = require('../policy/redaction.service');
const logger = require('../../core/logger').scoped('AuditService');

class AuditService {
  /**
   * Log an action to the audit log.
   * @param {string} username - The user who performed the action (can be null for system actions or failed logins).
   * @param {string} action - The action performed (e.g., 'LOGIN', 'model', 'retrieval', 'tool', 'approval', 'sandbox', 'semantic', 'cost').
   * @param {any} details - Additional details. Will be redacted and JSON stringified.
   * @param {string} ip_address - The IP address of the request.
   */
  static log(usernameOrObj, action, details = null, ip_address = null) {
    let username = usernameOrObj;
    let finalAction = action;
    let finalDetails = details;
    let finalIp = ip_address;

    // Handle single object parameter
    if (typeof usernameOrObj === 'object' && usernameOrObj !== null && !action) {
      username = usernameOrObj.username || null;
      finalAction = usernameOrObj.action;
      finalDetails = usernameOrObj.details || usernameOrObj;
      finalIp = usernameOrObj.ip_address || null;
      // If we used the whole object as details, remove redundant fields
      if (typeof finalDetails === 'object') {
        const { username: _u, action: _a, ip_address: _i, ...rest } = finalDetails;
        finalDetails = rest;
      }
    }

    try {
      const stmt = db.prepare(`
        INSERT INTO audit_logs (username, action, details, ip_address, created_at)
        VALUES (@username, @action, @details, @ip_address, @created_at)
      `);
      
      const redactedDetails = RedactionService.redact(finalDetails);
      
      stmt.run({
        username: username || null,
        action: finalAction || 'UNKNOWN',
        details: redactedDetails ? (typeof redactedDetails === 'object' ? JSON.stringify(redactedDetails) : String(redactedDetails)) : null,
        ip_address: finalIp || null,
        created_at: Date.now()
      });
    } catch (error) {
      logger.error('Failed to insert audit log', error);
    }
  }

  /**
   * Get audit logs, with optional filtering and pagination.
   * @param {Object} options 
   * @param {number} options.limit 
   * @param {number} options.offset
   * @param {string} options.username
   * @param {string} options.action
   */
  static getLogs({ limit = 50, offset = 0, username = null, action = null } = {}) {
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

    const stmt = db.prepare(query);
    return stmt.all(params);
  }
}

module.exports = AuditService;
