import pino from 'pino';
import { Request, Response, NextFunction } from 'express';
import { config } from '../../infrastructure/config/env';
import { generateRequestId } from './requestId';

// ---------------------------------------------------------------------------
// Base logger — used throughout the application
// ---------------------------------------------------------------------------
export const logger = pino({ level: config.LOG_LEVEL });

// ---------------------------------------------------------------------------
// Extend Express Request so TypeScript knows about requestId and userId
// ---------------------------------------------------------------------------
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      userId?: string;
    }
  }
}

// ---------------------------------------------------------------------------
// Per-request logging middleware
// ---------------------------------------------------------------------------

/**
 * Attaches a unique requestId to every incoming request and logs method,
 * path, statusCode, responseTime, requestId, and userId (when available)
 * once the response finishes.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Honour any upstream request-id (e.g. from a load-balancer), otherwise generate one
  req.requestId =
    (req.headers['x-request-id'] as string | undefined) ?? generateRequestId();

  // Stamp the response so clients can correlate logs
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
