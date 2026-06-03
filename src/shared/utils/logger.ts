import pino from 'pino';
import { Request, Response, NextFunction } from 'express';
import { config } from '../../infrastructure/config/env';
import { generateRequestId } from './requestId';

export const logger = pino({ level: config.LOG_LEVEL });

// Augment the Express Request type so TypeScript knows about the fields we
// attach in this middleware.
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      userId?: string;
    }
  }
}

// Attaches a requestId to every request and logs method, path, status,
// and response time once the response finishes.
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  req.requestId =
    (req.headers['x-request-id'] as string | undefined) ?? generateRequestId();

  res.setHeader('X-Request-Id', req.requestId);

  const startAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startAt) / 1_000_000;

    logger.info({
      requestId: req.requestId,
      userId: req.userId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime: `${durationMs.toFixed(2)}ms`,
    });
  });

  next();
}
