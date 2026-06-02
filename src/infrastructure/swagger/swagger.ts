/**
 * Complete OpenAPI 3.0 spec defined inline — no JSDoc scanning needed.
 * This works reliably with ts-node-dev, tsc, and compiled output.
 */

const securityHeaders = [
  { $ref: '#/components/parameters/XRequestTimestamp' },
  { $ref: '#/components/parameters/XNonce' },
];

const bearerAuth = [{ bearerAuth: [] as string[] }];

const errorResponse = {
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
  },
};

export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'GGI Backend API',
    version: '1.0.0',
    description:
      'AI Chat & Subscription management API. All protected endpoints require a valid Auth0 Bearer token plus replay-attack prevention headers (X-Request-Timestamp, X-Nonce).',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development' }],

  // ---------------------------------------------------------------------------
  // Security
  // ---------------------------------------------------------------------------
  security: bearerAuth,

  // ---------------------------------------------------------------------------
  // Reusable components
  // ---------------------------------------------------------------------------
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Auth0 access token obtained from Auth0',
      },
    },
    parameters: {
      XRequestTimestamp: {
        in: 'header',
        name: 'X-Request-Timestamp',
        required: true,
        schema: { type: 'string', example: '1700000000000' },
        description: 'Unix timestamp ms — rejected if older than 5 min.',
      },
      XNonce: {
        in: 'header',
        name: 'X-Nonce',
        required: true,
        schema: { type: 'string', example: 'a1b2c3d4e5f6' },
        description: 'Unique random string — rejected if previously seen.',
      },
      ResourceId: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Resource UUID',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'UNAUTHORIZED' },
              message: { type: 'string', example: 'Unauthorized' },
              statusCode: { type: 'integer', example: 401 },
              requestId: { type: 'string', format: 'uuid' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      ChatRequest: {
        type: 'object',
        required: ['question'],
        additionalProperties: false,
        properties: {
          question: { type: 'string', minLength: 1, maxLength: 2000, example: 'What is TypeScript?' },
        },
      },
      ChatMessage: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string' },
          question: { type: 'string' },
          answer: { type: 'string' },
          promptTokens: { type: 'integer' },
          completionTokens: { type: 'integer' },
          totalTokens: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateSubscriptionRequest: {
        type: 'object',
        required: ['tier', 'billingCycle'],
        additionalProperties: false,
        properties: {
          tier: { type: 'string', enum: ['BASIC', 'PRO', 'ENTERPRISE'] },
          billingCycle: { type: 'string', enum: ['MONTHLY', 'YEARLY'] },
          autoRenew: { type: 'boolean', default: true },
        },
      },
      SubscriptionBundle: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string' },
          tier: { type: 'string', enum: ['BASIC', 'PRO', 'ENTERPRISE'] },
          billingCycle: { type: 'string', enum: ['MONTHLY', 'YEARLY'] },
          maxMessages: { type: 'integer', example: 100 },
          remainingMessages: { type: 'integer', example: 87 },
          price: { type: 'number', example: 29.99 },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          renewalDate: { type: 'string', format: 'date-time' },
          autoRenew: { type: 'boolean' },
          active: { type: 'boolean' },
          cancelledAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      AutoRenewRequest: {
        type: 'object',
        required: ['autoRenew'],
        additionalProperties: false,
        properties: { autoRenew: { type: 'boolean' } },
      },
      MetricsResponse: {
        type: 'object',
        properties: {
          totalUsers: { type: 'integer' },
          totalChats: { type: 'integer' },
          activeSubscriptions: { type: 'integer' },
          subscriptionsByTier: {
            type: 'object',
            properties: {
              BASIC: { type: 'integer' },
              PRO: { type: 'integer' },
              ENTERPRISE: { type: 'integer' },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          auth0Id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['USER', 'ADMIN'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      RenewalResult: {
        type: 'object',
        properties: {
          renewed: { type: 'integer', example: 5 },
          failed: { type: 'integer', example: 1 },
        },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Paths
  // ---------------------------------------------------------------------------
  paths: {
    // ── System ──────────────────────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        description: 'Returns server status. No authentication required.',
        security: [],
        responses: {
          200: {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                    uptime: { type: 'number', description: 'Process uptime in seconds' },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ── Chat ────────────────────────────────────────────────────────────────
    '/api/v1/chat': {
      post: {
        tags: ['Chat'],
        summary: 'Send a question and receive an AI response',
        description:
          'Consumes free monthly quota (3 msg/month) or deducts from an active subscription bundle. ENTERPRISE bundles are unlimited.',
        security: bearerAuth,
        parameters: securityHeaders,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChatRequest' } } },
        },
        responses: {
          200: {
            description: 'AI response with token usage',
            content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/ChatMessage' } } } } },
          },
          400: { description: 'Validation error or missing security headers', ...errorResponse },
          401: { description: 'Missing or invalid token', ...errorResponse },
          429: { description: 'Quota exhausted or rate limit exceeded', ...errorResponse },
        },
      },
    },
    '/api/v1/chat/history': {
      get: {
        tags: ['Chat'],
        summary: "Get the authenticated user's chat history",
        security: bearerAuth,
        responses: {
          200: {
            description: 'List of chat messages (newest first)',
            content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/ChatMessage' } } } } } },
          },
          401: { description: 'Unauthorized', ...errorResponse },
        },
      },
    },
    '/api/v1/chat/{id}': {
      get: {
        tags: ['Chat'],
        summary: 'Get a single chat message (own only)',
        security: bearerAuth,
        parameters: [{ $ref: '#/components/parameters/ResourceId' }],
        responses: {
          200: {
            description: 'Chat message',
            content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/ChatMessage' } } } } },
          },
          401: { description: 'Unauthorized', ...errorResponse },
          404: { description: 'Chat message not found', ...errorResponse },
        },
      },
    },

    // ── Subscriptions ────────────────────────────────────────────────────────
    '/api/v1/subscriptions': {
      post: {
        tags: ['Subscriptions'],
        summary: 'Create a new subscription bundle',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateSubscriptionRequest' } } },
        },
        responses: {
          201: { description: 'Bundle created', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/SubscriptionBundle' } } } } } },
          400: { description: 'Validation error', ...errorResponse },
          401: { description: 'Unauthorized', ...errorResponse },
        },
      },
      get: {
        tags: ['Subscriptions'],
        summary: "List the authenticated user's subscription bundles",
        security: bearerAuth,
        responses: {
          200: { description: 'List of bundles', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/SubscriptionBundle' } } } } } } },
          401: { description: 'Unauthorized', ...errorResponse },
        },
      },
    },
    '/api/v1/subscriptions/{id}': {
      get: {
        tags: ['Subscriptions'],
        summary: 'Get a single subscription bundle (own only)',
        security: bearerAuth,
        parameters: [{ $ref: '#/components/parameters/ResourceId' }],
        responses: {
          200: { description: 'Subscription bundle', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/SubscriptionBundle' } } } } } },
          401: { description: 'Unauthorized', ...errorResponse },
          404: { description: 'Not found', ...errorResponse },
        },
      },
    },
    '/api/v1/subscriptions/{id}/cancel': {
      patch: {
        tags: ['Subscriptions'],
        summary: 'Cancel a subscription bundle',
        description: 'Sets cancelledAt=now, autoRenew=false. Bundle stays active until endDate. All chat history preserved.',
        security: bearerAuth,
        parameters: [{ $ref: '#/components/parameters/ResourceId' }],
        responses: {
          200: { description: 'Cancelled bundle', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/SubscriptionBundle' } } } } } },
          400: { description: 'Already cancelled', ...errorResponse },
          401: { description: 'Unauthorized', ...errorResponse },
          404: { description: 'Not found', ...errorResponse },
        },
      },
    },
    '/api/v1/subscriptions/{id}/auto-renew': {
      patch: {
        tags: ['Subscriptions'],
        summary: 'Toggle automatic renewal for a subscription bundle',
        security: bearerAuth,
        parameters: [{ $ref: '#/components/parameters/ResourceId' }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AutoRenewRequest' } } },
        },
        responses: {
          200: { description: 'Updated bundle', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/SubscriptionBundle' } } } } } },
          401: { description: 'Unauthorized', ...errorResponse },
          404: { description: 'Not found', ...errorResponse },
        },
      },
    },

    // ── Admin ────────────────────────────────────────────────────────────────
    '/api/v1/admin/metrics': {
      get: {
        tags: ['Admin'],
        summary: 'System-wide metrics (ADMIN only)',
        security: bearerAuth,
        responses: {
          200: { description: 'Metrics', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/MetricsResponse' } } } } } },
          401: { description: 'Unauthorized', ...errorResponse },
          403: { description: 'Forbidden', ...errorResponse },
        },
      },
    },
    '/api/v1/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'List all users (ADMIN only)',
        security: bearerAuth,
        responses: {
          200: { description: 'All users', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } } } },
          401: { description: 'Unauthorized', ...errorResponse },
          403: { description: 'Forbidden', ...errorResponse },
        },
      },
    },
    '/api/v1/admin/chats': {
      get: {
        tags: ['Admin'],
        summary: 'List all chat messages (ADMIN only)',
        security: bearerAuth,
        responses: {
          200: { description: 'All chats', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/ChatMessage' } } } } } } },
          401: { description: 'Unauthorized', ...errorResponse },
          403: { description: 'Forbidden', ...errorResponse },
        },
      },
    },
    '/api/v1/admin/subscriptions': {
      get: {
        tags: ['Admin'],
        summary: 'List all subscription bundles (ADMIN only)',
        security: bearerAuth,
        responses: {
          200: { description: 'All bundles', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/SubscriptionBundle' } } } } } } },
          401: { description: 'Unauthorized', ...errorResponse },
          403: { description: 'Forbidden', ...errorResponse },
        },
      },
    },
    '/api/v1/admin/subscriptions/process-renewals': {
      post: {
        tags: ['Admin'],
        summary: 'Trigger subscription renewal job (ADMIN only)',
        description: 'Processes all bundles due for renewal. Simulates payment (80% success). Extends dates on success, marks inactive on failure.',
        security: bearerAuth,
        responses: {
          200: { description: 'Renewal results', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/RenewalResult' } } } } } },
          401: { description: 'Unauthorized', ...errorResponse },
          403: { description: 'Forbidden', ...errorResponse },
        },
      },
    },
  },
};
