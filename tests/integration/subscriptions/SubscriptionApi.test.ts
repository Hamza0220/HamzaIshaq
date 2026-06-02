/**
 * SubscriptionApi.test.ts
 *
 * Integration tests for /api/v1/subscriptions and admin routes.
 * Auth0 is mocked as USER role. syncUser and SubscriptionRepository are mocked.
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

const mockBundle = {
  id: 'sub-test-id',
  userId: 'test-db-user-id',
  tier: 'BASIC',
  billingCycle: 'MONTHLY',
  maxMessages: 10,
  remainingMessages: 10,
  price: 9.99,
  startDate: new Date().toISOString(),
  endDate: new Date().toISOString(),
  renewalDate: new Date().toISOString(),
  autoRenew: true,
  active: true,
  cancelledAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

jest.mock('../../../src/modules/subscriptions/repositories/SubscriptionRepository', () => {
  return {
    SubscriptionRepository: jest.fn().mockImplementation(() => ({
      createBundle: jest.fn().mockResolvedValue(mockBundle),
      findById: jest.fn().mockResolvedValue(mockBundle),
      findByUserId: jest.fn().mockResolvedValue([mockBundle]),
      findActiveByUserId: jest.fn().mockResolvedValue([mockBundle]),
      findDueForRenewal: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([mockBundle]),
      update: jest.fn().mockResolvedValue(mockBundle),
      cancel: jest.fn().mockResolvedValue(undefined),
      markInactive: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

// ── Imports ───────────────────────────────────────────────────────────────
import request from 'supertest';
import { createApp } from '../../../src/app';

const app    = createApp();
const BEARER = 'Bearer test-token';

describe('Subscription API', () => {
  // ── POST /api/v1/subscriptions ───────────────────────────────────────────

  it('POST /api/v1/subscriptions returns 201 for valid BASIC MONTHLY bundle', async () => {
    const res = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', BEARER)
      .set('Content-Type', 'application/json')
      .send({ tier: 'BASIC', billingCycle: 'MONTHLY', autoRenew: true });

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.tier).toBe('BASIC');
    expect(res.body.data.billingCycle).toBe('MONTHLY');
  });

  it('POST /api/v1/subscriptions returns 400 for invalid tier', async () => {
    const res = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', BEARER)
      .set('Content-Type', 'application/json')
      .send({ tier: 'INVALID', billingCycle: 'MONTHLY' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/subscriptions returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/v1/subscriptions')
      .set('Content-Type', 'application/json')
      .send({ tier: 'BASIC', billingCycle: 'MONTHLY' });

    expect(res.status).toBe(401);
  });

  // ── GET /api/v1/subscriptions ────────────────────────────────────────────

  it('GET /api/v1/subscriptions returns 200 with an array', async () => {
    const res = await request(app)
      .get('/api/v1/subscriptions')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // ── Admin routes (USER role → 403) ───────────────────────────────────────

  it('GET /api/v1/admin/subscriptions returns 403 for USER role', async () => {
    const res = await request(app)
      .get('/api/v1/admin/subscriptions')
      .set('Authorization', BEARER);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /api/v1/admin/metrics returns 403 for USER role', async () => {
    const res = await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', BEARER);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /api/v1/admin/subscriptions/process-renewals returns 403 for USER role', async () => {
    const res = await request(app)
      .post('/api/v1/admin/subscriptions/process-renewals')
      .set('Authorization', BEARER)
      .set('Content-Type', 'application/json')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
