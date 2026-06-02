import { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import { AppError } from '../errors/AppError';
import { generateRequestId } from '../utils/requestId';
import { config } from '../../infrastructure/config/env';

const logger = pino({ level: config.LOG_LEVEL });

/**
 * Global error-handling middleware (must have exactly 4 parameters).
 * Catches AppError subclasses and unknown errors, returning a structured
 * JSON response in all cases.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId: string =
    (req.headers['x-request-id'] as string | undefined) ?? generateRequestId();

  if (err instanceof AppError) {
    logger.warn(
      { err, requestId, path: req.path, method: req.method },
      `AppError: ${err.code}`,
    );

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Unknown / unexpected error
  logger.error(
    { err, requestId, path: req.path, method: req.method },
    'Unhandled error',
  );

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      statusCode: 500,
      requestId,
      timestamp: new Date().toISOString(),
    },
  });
}
