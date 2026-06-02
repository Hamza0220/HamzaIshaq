import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { verifyToken } from '../../shared/middleware/auth.middleware';
import { requireRole } from '../../shared/middleware/rbac.middleware';

// ---------------------------------------------------------------------------
// Prisma singleton
// ---------------------------------------------------------------------------

function createPrismaClient(): PrismaClient {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createAdminRouter(): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // GET /api/v1/admin/metrics
  // -------------------------------------------------------------------------

  /**
   * @swagger
   * /api/v1/admin/metrics:
   *   get:
   *     summary: System-wide metrics (admin only)
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Aggregated metrics
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/MetricsResponse'
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
    '/metrics',
    verifyToken,
    requireRole('ADMIN'),
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const [totalUsers, totalChats, activeSubscriptions, byTier] =
          await Promise.all([
            prisma.user.count(),
            prisma.chatMessage.count(),
            prisma.subscriptionBundle.count({ where: { active: true } }),
            prisma.subscriptionBundle.groupBy({
              by: ['tier'],
              where: { active: true },
              _count: { tier: true },
            }),
          ]);

        const subscriptionsByTier: Record<string, number> = {
          BASIC: 0,
          PRO: 0,
          ENTERPRISE: 0,
        };

        for (const row of byTier) {
          subscriptionsByTier[row.tier] = row._count.tier;
        }

        res.status(200).json({
          data: {
            totalUsers,
            totalChats,
            activeSubscriptions,
            subscriptionsByTier,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/admin/users
  // -------------------------------------------------------------------------

  /**
   * @swagger
   * /api/v1/admin/users:
   *   get:
   *     summary: List all users (admin only)
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: All users
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/User'
   *       401:
   *         description: Unauthorized
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       403:
   *         description: Forbidden
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.get(
    '/users',
    verifyToken,
    requireRole('ADMIN'),
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const users = await prisma.user.findMany({
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            auth0Id: true,
            email: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        res.status(200).json({ data: users });
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/admin/chats
  // -------------------------------------------------------------------------

  /**
   * @swagger
   * /api/v1/admin/chats:
   *   get:
   *     summary: List all chat messages across all users (admin only)
   *     tags:
   *       - Admin
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: All chat messages
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/ChatMessage'
   *       401:
   *         description: Unauthorized
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       403:
   *         description: Forbidden
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.get(
    '/chats',
    verifyToken,
    requireRole('ADMIN'),
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const chats = await prisma.chatMessage.findMany({
          orderBy: { createdAt: 'desc' },
        });

        res.status(200).json({ data: chats });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
