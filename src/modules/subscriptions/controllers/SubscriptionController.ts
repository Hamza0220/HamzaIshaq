import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { verifyToken } from '../../../shared/middleware/auth.middleware';
import { validate } from '../../../shared/middleware/validation.middleware';
import { requireRole } from '../../../shared/middleware/rbac.middleware';
import { subscriptionRateLimit } from '../../../shared/middleware/rateLimit.middleware';
import { SubscriptionService } from '../domain/services/SubscriptionService';
import { SubscriptionRepository } from '../repositories/SubscriptionRepository';
import { AppError } from '../../../shared/errors/AppError';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

export const CreateSubscriptionSchema = z
  .object({
    tier: z.enum(['BASIC', 'PRO', 'ENTERPRISE']),
    billingCycle: z.enum(['MONTHLY', 'YEARLY']),
    autoRenew: z.boolean().default(true),
  })
  .strict();

export type CreateSubscriptionRequest = z.infer<typeof CreateSubscriptionSchema>;

// ---------------------------------------------------------------------------
// Helper — extract Auth0 subject from verified JWT
// ---------------------------------------------------------------------------

type AuthRequest = Request & {
  auth?: { payload?: { sub?: string } };
  dbUser?: { id: string; email: string; role: string };
};

function getSubject(req: AuthRequest): string {
  if (req.dbUser?.id) return req.dbUser.id;
  const sub = req.auth?.payload?.sub;
  if (!sub) throw new AppError('Unable to identify user', 'UNAUTHORIZED', 401);
  return sub;
}

function resolveId(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return raw[0] ?? '';
  return raw ?? '';
}

// ---------------------------------------------------------------------------
// Router factories
// ---------------------------------------------------------------------------

/**
 * Returns the Express Router for /api/v1/subscriptions (user routes).
 */
export function createSubscriptionRouter(): Router {
  const router = Router();
  const repo = new SubscriptionRepository();
  const service = new SubscriptionService(repo);

  // -------------------------------------------------------------------------
  // POST /api/v1/subscriptions — create a new bundle
  // -------------------------------------------------------------------------

  /**
   * @swagger
   * /api/v1/subscriptions:
   *   post:
   *     summary: Create a new subscription bundle
   *     tags:
   *       - Subscriptions
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CreateSubscriptionRequest'
   *     responses:
   *       201:
   *         description: Bundle created
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SubscriptionBundle'
   *       400:
   *         description: Validation error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       401:
   *         description: Unauthorized
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.post(
    '/',
    verifyToken,
    subscriptionRateLimit,
    validate(CreateSubscriptionSchema),
    async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = getSubject(req);
        const { tier, billingCycle, autoRenew } =
          req.body as CreateSubscriptionRequest;

        const bundle = await service.createBundle(userId, tier, billingCycle, autoRenew);
        res.status(201).json({ data: bundle });
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/subscriptions — list own bundles
  // -------------------------------------------------------------------------

  /**
   * @swagger
   * /api/v1/subscriptions:
   *   get:
   *     summary: List the authenticated user's subscription bundles
   *     tags:
   *       - Subscriptions
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of bundles
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/SubscriptionBundle'
   *       401:
   *         description: Unauthorized
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.get(
    '/',
    verifyToken,
    async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = getSubject(req);
        const bundles = await service.getUserBundles(userId);
        res.status(200).json({ data: bundles });
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/subscriptions/:id — single bundle (own only)
  // -------------------------------------------------------------------------

  /**
   * @swagger
   * /api/v1/subscriptions/{id}:
   *   get:
   *     summary: Get a single subscription bundle (own only)
   *     tags:
   *       - Subscriptions
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - $ref: '#/components/parameters/ResourceId'
   *     responses:
   *       200:
   *         description: Subscription bundle
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SubscriptionBundle'
   *       401:
   *         description: Unauthorized
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       404:
   *         description: Subscription not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.get(
    '/:id',
    verifyToken,
    async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = getSubject(req);
        const id = resolveId(req.params['id']);

        const bundle = await repo.findById(id, userId);
        if (!bundle) {
          res.status(404).json({
            error: {
              code: 'SUBSCRIPTION_NOT_FOUND',
              message: 'Subscription not found',
              statusCode: 404,
            },
          });
          return;
        }

        res.status(200).json({ data: bundle });
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /api/v1/subscriptions/:id/cancel
  // -------------------------------------------------------------------------

  /**
   * @swagger
   * /api/v1/subscriptions/{id}/cancel:
   *   patch:
   *     summary: Cancel a subscription bundle
   *     description: >
   *       Sets cancelledAt to now and disables auto-renew. The bundle remains
   *       active until endDate. All historical chat data is preserved.
   *     tags:
   *       - Subscriptions
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - $ref: '#/components/parameters/ResourceId'
   *     responses:
   *       200:
   *         description: Cancelled bundle
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SubscriptionBundle'
   *       400:
   *         description: Already cancelled
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       401:
   *         description: Unauthorized
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       404:
   *         description: Subscription not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.patch(
    '/:id/cancel',
    verifyToken,
    async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = getSubject(req);
        const id = resolveId(req.params['id']);

        const bundle = await service.cancelBundle(id, userId);
        res.status(200).json({ data: bundle });
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /api/v1/subscriptions/:id/auto-renew
  // -------------------------------------------------------------------------

  /**
   * @swagger
   * /api/v1/subscriptions/{id}/auto-renew:
   *   patch:
   *     summary: Toggle automatic renewal for a subscription bundle
   *     tags:
   *       - Subscriptions
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - $ref: '#/components/parameters/ResourceId'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/AutoRenewRequest'
   *     responses:
   *       200:
   *         description: Updated bundle
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/SubscriptionBundle'
   *       401:
   *         description: Unauthorized
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       404:
   *         description: Subscription not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.patch(
    '/:id/auto-renew',
    verifyToken,
    validate(
      z.object({ autoRenew: z.boolean() }).strict(),
    ),
    async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = getSubject(req);
        const id = resolveId(req.params['id']);
        const { autoRenew } = req.body as { autoRenew: boolean };

        const bundle = await service.toggleAutoRenew(id, userId, autoRenew);
        res.status(200).json({ data: bundle });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

/**
 * Returns the Express Router for /api/v1/admin/subscriptions (admin routes).
 */
export function createAdminSubscriptionRouter(): Router {
  const router = Router();
  const repo = new SubscriptionRepository();
  const service = new SubscriptionService(repo);

  // -------------------------------------------------------------------------
  // GET /api/v1/admin/subscriptions — all bundles
  // -------------------------------------------------------------------------

  /**
   * @swagger
   * /api/v1/admin/subscriptions:
   *   get:
   *     summary: List all subscription bundles (admin only)
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: All subscription bundles
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/SubscriptionBundle'
   *       401:
   *         description: Unauthorized
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       403:
   *         description: Forbidden — ADMIN role required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.get(
    '/',
    verifyToken,
    requireRole('ADMIN'),
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const bundles = await repo.findAll();
        res.status(200).json({ data: bundles });
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/v1/admin/subscriptions/process-renewals
  // -------------------------------------------------------------------------

  /**
   * @swagger
   * /api/v1/admin/subscriptions/process-renewals:
   *   post:
   *     summary: Trigger the subscription renewal job (admin only)
   *     description: >
   *       Loops over all active bundles whose renewalDate has passed, simulates
   *       payment (80% success rate), and either extends the subscription or
   *       marks it inactive.
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Renewal job results
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/RenewalResult'
   *       401:
   *         description: Unauthorized
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       403:
   *         description: Forbidden — ADMIN role required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.post(
    '/process-renewals',
    verifyToken,
    requireRole('ADMIN'),
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = await service.processRenewals();
        res.status(200).json({ data: result });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
