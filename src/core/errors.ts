/**
 * Centralized Error Handling
 */
import crypto from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import loggerModule from './logger';
import { RedactionService } from '../modules/policy/redaction.service';

const logger = loggerModule.scoped('Errors');

type ErrorRequest = Request & {
  runId?: string;
};

class AppError extends Error {
  status: number;
  code: string;
  details: unknown;
  isOperational: boolean;
  runId?: string;

  constructor(message: string, status: number = 500, code: string = 'server_error', details: unknown = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class AuthError extends AppError {
  constructor(message: string = 'Аутентификация не удалась', details: unknown = null) {
    super(message, 401, 'auth_error', details);
  }
}

class ValidationError extends AppError {
  constructor(message: string = 'Ошибка валидации данных', details: unknown = null) {
    super(message, 400, 'validation_error', details);
  }
}

class NotFoundError extends AppError {
  constructor(message: string = 'Ресурс не найден') {
    super(message, 404, 'not_found');
  }
}

/**
 * Wrap an async Express handler so thrown errors are forwarded to `next()`.
 */
function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => unknown
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as Req, res, next)).catch(next);
  };
}

/**
 * Global Express error handler.
 */
function errorHandler(err: AppError, req: ErrorRequest, res: Response, _next: NextFunction) {
  // Handle client disconnects (ECONNRESET)
  if (err.code === 'ECONNRESET' || err.code === 'ERR_STREAM_PREMATURE_CLOSE' || err.message.includes('Premature close')) {
    logger.warn('Client disconnected', { method: req.method, path: req.path });
    return;
  }

  const isDev = process.env.NODE_ENV === 'development';
  const status = err.status || 500;
  const code = err.code || 'server_error';
  const message = err.message || 'Внутренняя ошибка сервера';

  const isAuthHealthProbe = status === 401 && req.path === '/api/providers/health';
  if (status === 500) {
    logger.error('Request failed', { method: req.method, path: req.path, error: RedactionService.redact(err) });
  } else if (!isAuthHealthProbe) {
    logger.warn('Request warning', { method: req.method, path: req.path, status, code, message: RedactionService.redact(message) });
  }

  if (res.headersSent) return;

  res.status(status).json({
    error: {
      code,
      message,
      details: err.details || null,
      traceId: req.headers['x-trace-id'] || crypto.randomUUID(),
      runId: err.runId || req.runId || undefined,
      stack: isDev ? err.stack : undefined
    }
  });
}

export {
  AppError,
  AuthError,
  ValidationError,
  NotFoundError,
  asyncHandler,
  errorHandler,
};
