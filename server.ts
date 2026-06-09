import * as fs from 'fs';
import * as path from 'path';
import type { Server } from 'http';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
// @ts-ignore
import { PORT, WEBUI_DIR, allowedOrigins, isDev } from './src/core/config';
// @ts-ignore
import { errorHandler, AppError } from './src/core/errors';
// @ts-ignore
import logger = require('./src/core/logger');

require('./src/core/sqlite'); 

const app = express();
const serverLogger = logger.scoped('Server');

type RateLimitHandlerOptions = {
  statusCode: number;
  message: string;
};

app.set('trust proxy', 1);

function isPrivateHostname(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

function isAllowedCorsOrigin(origin: string): boolean {
  if (allowedOrigins.includes(origin)) return true;
  if (!isDev) return false;

  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.protocol === 'http:'
      && parsedOrigin.port === String(PORT)
      && isPrivateHostname(parsedOrigin.hostname);
  } catch (_) {
    return false;
  }
}

function isRobokassaCallback(req: Request, origin: string): boolean {
  const robokassaOrigins = new Set([
    'https://auth.robokassa.ru',
    'https://auth.robokassa.com',
  ]);

  return robokassaOrigins.has(origin)
    && /^\/api\/payments\/robokassa\/(result|success|fail)\/?$/.test(req.path);
}

function rateLimitKey(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  const rawIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown';

  const ip = rawIp.replace(/^::ffff:/, '').replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/, '$1');
  return ip === 'unknown' ? ip : ipKeyGenerator(ip);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      workerSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    }
  }
}));

app.use(cors((req, callback) => {
  callback(null, {
    origin: function (origin, originCallback) {
      if (!origin) return originCallback(null, true);
    
      const originStr = String(origin);
      const isAllowed = isAllowedCorsOrigin(originStr) || isRobokassaCallback(req, originStr);

      if (isAllowed) {
        originCallback(null, true);
      } else {
        serverLogger.warn('CORS blocked origin', { origin: originStr, path: req.path });
        originCallback(new AppError('CORS policy violation', 403, 'cors_error'));
      }
    }
  });
}));

app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

const authLimiter = process.env.NODE_ENV === 'test' ? (req: Request, res: Response, next: NextFunction) => next() : rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 20, 
  keyGenerator: rateLimitKey,
  handler: (req: Request, res: Response, next: NextFunction, options: RateLimitHandlerOptions) => {
    res.status(options.statusCode).json({
      error: { code: 'rate_limit', message: options.message }
    });
  },
  message: 'Слишком много попыток входа, попробуйте позже'
});

const chatLimiter = process.env.NODE_ENV === 'test' ? (req: Request, res: Response, next: NextFunction) => next() : rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  keyGenerator: rateLimitKey,
  handler: (req: Request, res: Response, next: NextFunction, options: RateLimitHandlerOptions) => {
    res.status(options.statusCode).json({
      error: { code: 'rate_limit', message: options.message }
    });
  },
  message: 'Превышен лимит запросов'
});

const { authenticate } = require('./src/modules/auth/auth.middleware');

app.use('/api/auth', authLimiter, require('./src/modules/auth/auth.routes'));
app.use('/api/users', require('./src/modules/auth/users.routes'));
app.use('/api/user', require('./src/modules/kb/kb.routes'));
app.use('/api/admin', require('./src/modules/admin/admin.routes'));
app.use('/api/sessions', authenticate, require('./src/modules/chat/sessions.routes'));
app.use('/api/chat', chatLimiter, authenticate, require('./src/modules/chat/chat.routes'));
app.use('/api/providers', require('./src/modules/providers/providers.routes'));
app.use('/api/payments', require('./src/modules/payments/payment.routes'));

app.get('/health', async (req: Request, res: Response) => {
  const { getVectorHealthSection } = require('./src/modules/vector/vector.health');
  const vector = await getVectorHealthSection();
  res.status(200).json({ status: 'ok', vector });
});
app.get('/ready', (req: Request, res: Response) => {
  try {
    require('./src/core/sqlite');
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'error', message: 'DB not ready' });
  }
});

app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({ error: { code: 'not_found', message: 'API route not found' } });
});

app.use(express.static(WEBUI_DIR, {
  setHeaders: (res, filePath) => {
    if (/\.[0-9a-f]{8,}\.(js|css|woff2|woff|png|jpg|jpeg|webp|svg|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

app.get('*', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile('index.html', { root: WEBUI_DIR });
});

app.use(errorHandler);

const PID_FILE = path.join(__dirname, 'server.pid');

function writePidFile() {
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8');
}

function removePidFile() {
  try { fs.unlinkSync(PID_FILE); } catch (_) {}
}

function gracefulShutdown(serverInstance: Server | null, signal: string) {
  serverLogger.info('Received shutdown signal', { signal });
  
  if (serverInstance && serverInstance.closeAllConnections) {
    serverInstance.closeAllConnections();
  }

  if (serverInstance) {
    serverInstance.close(() => {
      serverLogger.info('Server closed');
      removePidFile();
      process.exit(0);
    });
  } else {
    removePidFile();
    process.exit(0);
  }
  
  setTimeout(() => {
    serverLogger.error('Forcefully shutting down');
    removePidFile();
    process.exit(1);
  }, 5000);
}

let server: Server | null = null;
if (require.main === module) {
  writePidFile();

  const { startIndexingQueue } = require('./src/modules/kb/indexing-queue');
  startIndexingQueue();

  server = app.listen(PORT, '0.0.0.0', () => {
    serverLogger.info('Starting AvgExpert Gateway', { host: '0.0.0.0', port: PORT });
  });

  server.keepAliveTimeout = 120 * 1000; 
  server.headersTimeout = 125 * 1000;   

  process.on('SIGINT', () => gracefulShutdown(server, 'SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown(server, 'SIGTERM'));

  if (process.platform === 'win32') {
    require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    }).on('SIGINT', () => {
      process.emit('SIGINT');
    });
  }
}

export = { app, server };
