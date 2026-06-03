import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { verifyToken } from '../../../shared/middleware/auth.middleware';
import { nonceValidation } from '../../../shared/middleware/nonce.middleware';
import { chatRateLimit } from '../../../shared/middleware/rateLimit.middleware';
import { validate } from '../../../shared/middleware/validation.middleware';
import { ChatService } from '../domain/services/ChatService';
import { ChatRepository } from '../repositories/ChatRepository';
import { SubscriptionRepository } from '../../subscriptions/repositories/SubscriptionRepository';
import { AppError } from '../../../shared/errors/AppError';
import type { AuthRequest } from '../../../shared/types/AuthRequest';

// Basic HTML stripping — avoids pulling in a sanitisation library for this.
function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

export const ChatRequestSchema = z
  .object({
    question: z
      .string()
      .min(1, 'Question must not be empty')
      .max(2000, 'Question must not exceed 2000 characters')
      .trim()
      .transform(stripHtml),
  })
  .strict();

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// Resolves the internal user ID from the request.
// Prefers req.dbUser.id (set by syncUser middleware) because that's the UUID
// foreign keys reference. Falls back to the raw Auth0 sub as a safety net.
function getSubject(req: AuthRequest): string {
  if (req.dbUser?.id) return req.dbUser.id;
  const sub = req.auth?.payload?.sub;
  if (!sub) throw new AppError('Unable to identify user', 'UNAUTHORIZED', 401);
  return sub;
}

export function createChatRouter(): Router {
  const router = Router();
  const chatRepository = new ChatRepository();
  const subscriptionRepository = new SubscriptionRepository();
  const chatService = new ChatService(chatRepository, subscriptionRepository);

  /**
   * @swagger
   * /api/v1/chat:
   *   post:
   *     summary: Send a question and receive an AI response
   *     description: >
   *       Consumes the user's free monthly quota (3 messages) or deducts from an
   *       active subscription bundle. ENTERPRISE bundles are unlimited.
   *     tags:
   *       - Chat
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - $ref: '#/components/parameters/XRequestTimestamp'
   *       - $ref: '#/components/parameters/XNonce'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ChatRequest'
   *     responses:
   *       200:
   *         description: AI response with token usage
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/ChatMessage'
   *       400:
   *         description: Validation error or missing security headers
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       401:
   *         description: Missing or invalid token
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       429:
   *         description: Quota exhausted or rate limit exceeded
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.post(
    '/',
    verifyToken,
    nonceValidation,
    chatRateLimit,
    validate(ChatRequestSchema),
    async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = getSubject(req);
        const { question } = req.body as ChatRequest;

        const message = await chatService.sendMessage(userId, question);

        res.status(200).json({
          data: {
            id: message.id,
            userId: message.userId,
            question: message.question,
            answer: message.answer,
            promptTokens: message.promptTokens,
            completionTokens: message.completionTokens,
            totalTokens: message.totalTokens,
            createdAt: message.createdAt,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /history must be registered before /:id so Express doesn't treat
  // the string "history" as a dynamic id parameter.

  /**
   * @swagger
   * /api/v1/chat/history:
   *   get:
   *     summary: Get the authenticated user's chat history
   *     tags:
   *       - Chat
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of chat messages ordered by newest first
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
   */
  router.get(
    '/history',
    verifyToken,
    async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = getSubject(req);
        const messages = await chatRepository.getByUserId(userId);
        res.status(200).json({ data: messages });
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * @swagger
   * /api/v1/chat/{id}:
   *   get:
   *     summary: Get a single chat message (own only)
   *     tags:
   *       - Chat
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - $ref: '#/components/parameters/ResourceId'
   *     responses:
   *       200:
   *         description: Chat message
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/ChatMessage'
   *       401:
   *         description: Unauthorized
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       404:
   *         description: Chat message not found
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
        const id = Array.isArray(req.params['id'])
          ? (req.params['id'][0] ?? '')
          : (req.params['id'] ?? '');

        if (!id) {
          res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'Missing id', statusCode: 400 },
          });
          return;
        }

        const message = await chatRepository.getById(id, userId);

        if (!message) {
          res.status(404).json({
            error: { code: 'NOT_FOUND', message: 'Chat message not found', statusCode: 404 },
          });
          return;
        }

        res.status(200).json({ data: message });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
