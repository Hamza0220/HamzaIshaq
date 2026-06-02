/**
 * AuthMiddleware.test.ts
 *
 * Tests that protected routes reject requests without an Authorization header.
 * Uses the mockAuth0 so verifyToken is controlled — the mock returns 401 when
 * no Bearer token is present, mirroring real Auth0 middleware behaviour.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────
import { mockAuth0 } from '../../mocks/auth0.mock';
mockAuth0('USER');

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

describe('Auth Middleware', () => {
  it('GET /api/v1/chat/history returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/v1/chat/history');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/subscriptions returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/v1/subscriptions');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/admin/metrics returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/v1/admin/metrics');
    expect(res.status).toBe(401);
  });
});
