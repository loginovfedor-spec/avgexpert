import * as jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
// @ts-ignore
import { SECRET, TOKEN_EXPIRY } from '../../core/config';
// @ts-ignore
import userRepository = require('./user.repository');
// @ts-ignore
import { AppError, AuthError } from '../../core/errors';

type AuthenticatedUser = {
  username: string;
  category?: string;
  token_version?: number;
  expiration_date?: string | null;
  is_admin?: boolean | number;
  [key: string]: unknown;
};

type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

type AuthErrorConstructor = new (message?: string, details?: unknown) => Error;

const AuthErrorCtor = AuthError as AuthErrorConstructor;

export function isExpired(user: AuthenticatedUser): boolean {
  if (!user.expiration_date) return false;
  return new Date() > new Date(user.expiration_date);
}

export function signToken(user: AuthenticatedUser): string {
  return jwt.sign({ 
    sub: user.username, 
    category: user.category,
    tv: user.token_version || 0
  }, SECRET, { expiresIn: TOKEN_EXPIRY as jwt.SignOptions['expiresIn'] });
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AuthError('Требуется заголовок Authorization с типом Bearer'));
  }

  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, SECRET);
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      throw new AuthErrorCtor('Неверный токен', 'invalid_payload');
    }

    const user = await userRepository.findByUsername(payload.sub) as AuthenticatedUser | null;

    if (!user) {
      throw new AuthErrorCtor('Пользователь не найден', 'user_not_found');
    }
    
    const currentTv = user.token_version || 0;
    if (typeof payload.tv !== 'number' || payload.tv !== currentTv) {
      throw new AuthErrorCtor('Сессия недействительна: требуется повторный вход', 'session_invalidated');
    }
    
    if (isExpired(user)) {
      throw new AuthErrorCtor('Срок действия аккаунта истек', 'account_expired');
    }

    req.user = { ...user, username: payload.sub };
    next();
  } catch (err: unknown) {
    if (err instanceof AuthError) return next(err);
    
    const tokenError = err as Error & { name?: string };
    const detail = tokenError.name === 'TokenExpiredError' ? 'Срок действия токена истек' : 'Неверный токен';
    next(new AuthErrorCtor(detail, tokenError.name));
  }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || !req.user.is_admin) {
    return next(new AppError('Требуются права администратора', 403, 'forbidden'));
  }
  next();
}

module.exports = { authenticate, requireAdmin, signToken, isExpired };
