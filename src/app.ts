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

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

export function createApp(): express.Application {
  const app = express();

  // -------------------------------------------------------------------------
  // 1. Attach requestId to every request
  // -------------------------------------------------------------------------
  app.use(requestLogger);

  // -------------------------------------------------------------------------
  // 2. pino-http structured request logging
  // -------------------------------------------------------------------------
  app.use(
    pinoHttp({
      logger,
      // Suppress the duplicate log — requestLogger already logs on finish
      autoLogging: false,
      genReqId: (req) => (req as Request).requestId,
    }),
  );

  // -------------------------------------------------------------------------
  // 3. Helmet — secure HTTP headers
  // -------------------------------------------------------------------------
  app.use(helmet());

  // -------------------------------------------------------------------------
  // 4. CORS
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // 5 & 6. Body parsers with 10 kb limit
  // -------------------------------------------------------------------------
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // -------------------------------------------------------------------------
  // 7. Global request timeout — 30 seconds
  // -------------------------------------------------------------------------
  app.use(timeout('30s'));
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    // After the timeout fires, stop processing
    const req = _req as Request & { timedout?: boolean };
    if (!req.timedout) next();
  });

  // -------------------------------------------------------------------------
  // 8. Strict Content-Type validation for mutating methods
  // -------------------------------------------------------------------------
  app.use((req: Request, res: Response, next: NextFunction): void => {
    const mutating = ['POST', 'PATCH', 'PUT'];
    if (mutating.includes(req.method) && !req.is('application/json')) {
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

  // -------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------

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

  // Swagger UI — available at /api-docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'GGI Backend API Docs',
    swaggerOptions: { persistAuthorization: true },
  }));

  // verifyToken → syncUser applied globally to all /api/v1/* protected routes.
  // Individual route handlers then add nonce, rate-limit, validate as needed.
  // Note: verifyToken + syncUser here ensures DB user exists before any handler runs.
  app.use('/api/v1/chat', verifyToken, syncUser, createChatRouter());
  app.use('/api/v1/subscriptions', verifyToken, syncUser, createSubscriptionRouter());
  // Admin subscriptions MUST be registered BEFORE /api/v1/admin to avoid prefix clash
  app.use('/api/v1/admin/subscriptions', verifyToken, syncUser, createAdminSubscriptionRouter());
  app.use('/api/v1/admin', verifyToken, syncUser, createAdminRouter());
  // -------------------------------------------------------------------------
  // Global error handler — MUST be last
  // -------------------------------------------------------------------------
  app.use(errorHandler);

  return app;
}
