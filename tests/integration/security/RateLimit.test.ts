/**
 * RateLimit.test.ts
 *
 * Verifies that the chat rate limiter (20 req/min) returns 429 after the limit
 * is exceeded.
 *
 * Auth0 and syncUser are mocked so requests can actually reach the rate limiter.
 * mockOpenAI is mocked to avoid real latency.
 */

// ── Mocks (must come before any src imports) ─────────────────────────────
import { mockAuth0 } from '../../mocks/auth0.mock';
mockAuth0('USER');

jest.mock('../../../src/infrastructure/openai/mockOpenAI', () => ({
  mockOpenAIResponse: jest.fn().mockResolvedValue({
    message: 'mock',
    usage: { prompt_tokens: 1, completion_tokens: 47, total_tokens: 48 },
  }),
}));

// Mock syncUser so no real DB calls are needed
jest.mock('../../../src/shared/middleware/userSync.middleware', () => ({
  syncUser: (
    req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    req.dbUser = { id: 'test-db-user-id', email: 'test@example.com', role: 'USER' };
    req.userId = 'test-db-user-id';
    next();
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────
import request from 'supertest';
import { createApp } from '../../../src/app';

const app = createApp();
const BEARER = 'Bearer test-token';

describe('Rate Limiting — chat endpoint', () => {
  it('returns 429 with TOO_MANY_REQUESTS after exceeding 20 requests per minute', async () => {
    const nonce = () => `nonce-${Math.random().toString(36).slice(2)}`;
    const ts    = () => Date.now().toString();

    // Send 21 requests rapidly
    const responses = await Promise.all(
      Array.from({ length: 21 }, () =>
        request(app)
          .post('/api/v1/chat')
          .set('Authorization', BEARER)
          .set('X-Request-Timestamp', ts())
          .set('X-Nonce', nonce())
          .set('Content-Type', 'application/json')
          .send({ question: 'test' }),
      ),
    );

    const statuses = responses.map((r) => r.status);
    const has429   = statuses.includes(429);
    expect(has429).toBe(true);

    const rate429 = responses.find((r) => r.status === 429);
    expect(rate429?.body?.error?.code).toBe('TOO_MANY_REQUESTS');
  }, 15000);
});
