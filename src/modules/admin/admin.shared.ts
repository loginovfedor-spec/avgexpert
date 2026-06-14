import type { Request } from 'express';
import AuditService from '../audit/audit.service';

export type AdminRequest = Request & {
  user: { username: string };
};

export function clientIp(req: Request): string | null {
  return req.ip || req.socket.remoteAddress || null;
}

export function auditLog(req: AdminRequest, action: string, details: unknown): void {
  AuditService.log(req.user.username, action, details, clientIp(req));
}

export { AuditService };
