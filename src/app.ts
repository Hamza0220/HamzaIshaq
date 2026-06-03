import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import timeout from 'connect-timeout';
import swaggerUi from 'swagger-ui-express';
import { config } from './infrastructure/config/env';
import { logger, requestLogger } from './shared/utils/logger';
import { errorHandler } from './shared/middleware/errorHandler';
import { syncUser } from './shared/middleware/userSync.middleware';
import { verifyToken } from './shared/middleware/auth.middleware';
import { swaggerSpec } from './infrastructure/swagger/swagger';
import { createChatRouter } from './modules/chat/controllers/ChatController';
import {
  createSubscriptionRouter,
  createAdminSubscriptionRouter,
} from './modules/subscriptions/controllers/SubscriptionController';
import { createAdminRouter } from './modules/admin/AdminController';

export function createApp(): express.Application {
  const app = express();

  // Attach a unique requestId before anything else so it's available in all logs
  app.use(requestLogger);

  // Structured request logging via pino-http. autoLogging is off because
  // requestLogger already emits a log on response finish.
  app.use(
    pinoHttp({
      logger,
      autoLogging: false,
      genReqId: (req) => (req as Request).requestId,
    }),
  );

  // Security headers
  app.use(helmet());

  // CORS — only origins listed in ALLOWED_ORIGINS env var are permitted
  app.use(
    cors({
      origin: config.ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'X-Request-Timestamp',
        'X-Nonce',
        'X-Request-Id',
      ],
      credentials: true,
    }),
  );

  // Body parsers — 10 kb cap prevents request flooding
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // Hard timeout on every request — aborts after 30 s
  app.use(timeout('30s'));
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    const req = _req as Request & { timedout?: boolean };
    if (!req.timedout) next();
  });

  // Reject anything that isn't application/json on mutating methods.
  // Requests with no body (Content-Length: 0) are let through.
  app.use((req: Request, res: Response, next: NextFunction): void => {
    const mutating = ['POST', 'PATCH', 'PUT'];
    const hasBody =
      req.headers['content-length'] !== '0' &&
      (req.headers['content-type'] || req.headers['content-length']);

    if (mutating.includes(req.method) && hasBody && !req.is('application/json')) {
      res.status(415).json({
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Content-Type must be application/json',
          statusCode: 415,
        },
      });
      return;
    }
    next();
  });

  // Health check — no auth required
  /**
   * @swagger
   * /health:
   *   get:
   *     summary: Health check
   *     description: Returns server status. No authentication required.
   *     tags:
   *       - System
   *     security: []
   *     responses:
   *       200:
   *         description: Server is healthy
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: ok
   *                 timestamp:
   *                   type: string
   *                   format: date-time
   *                 uptime:
   *                   type: number
   *                   description: Process uptime in seconds
   */
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Swagger UI at /api-docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'GGI Backend API Docs',
    swaggerOptions: { persistAuthorization: true },
  }));

  // verifyToken + syncUser run globally on all /api/v1/* routes so every
  // handler can rely on req.dbUser being populated. Individual routes add
  // nonce, rate-limit, and validation on top as needed.
  app.use('/api/v1/chat', verifyToken, syncUser, createChatRouter());
  app.use('/api/v1/subscriptions', verifyToken, syncUser, createSubscriptionRouter());
  // Admin subscriptions registered before /api/v1/admin to avoid prefix clash
  app.use('/api/v1/admin/subscriptions', verifyToken, syncUser, createAdminSubscriptionRouter());
  app.use('/api/v1/admin', verifyToken, syncUser, createAdminRouter());

  // Error handler must be the last middleware
  app.use(errorHandler);

  return app;
}
