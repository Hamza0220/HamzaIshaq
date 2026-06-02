/**
 * NonceValidation.test.ts
 *
 * Verifies the nonce middleware:
 *   - Missing headers → 400 MISSING_SECURITY_HEADERS
 *   - Expired timestamp → 400 REQUEST_EXPIRED
 *   - Reused nonce → 400 NONCE_REUSED
 *
 * Auth0 and syncUser are mocked so requests reach the nonce middleware.
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

const app    = createApp();
const BEARER = 'Bearer test-token';

describe('Nonce Validation', () => {
  it('returns 400 MISSING_SECURITY_HEADERS when X-Request-Timestamp is absent', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', BEARER)
      // No X-Request-Timestamp, no X-Nonce
      .set('Content-Type', 'application/json')
      .send({ question: 'hello' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_SECURITY_HEADERS');
  });

  it('returns 400 MISSING_SECURITY_HEADERS when X-Nonce is absent', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', BEARER)
      .set('X-Request-Timestamp', Date.now().toString())
      // No X-Nonce
      .set('Content-Type', 'application/json')
      .send({ question: 'hello' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_SECURITY_HEADERS');
  });

  it('returns 400 REQUEST_EXPIRED when timestamp is 6 minutes old', async () => {
    const sixMinutesAgo = (Date.now() - 6 * 60 * 1000).toString();

    const res = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', BEARER)
      .set('X-Request-Timestamp', sixMinutesAgo)
      .set('X-Nonce', `nonce-expired-${Date.now()}`)
      .set('Content-Type', 'application/json')
      .send({ question: 'hello' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REQUEST_EXPIRED');
  });

  it('returns 400 NONCE_REUSED when the same nonce is sent twice', async () => {
    // Use a unique nonce so it hasn't been seen by previous tests
    const nonce = `unique-nonce-${Date.now()}-${Math.random()}`;
    const ts    = Date.now().toString();

    // First request — should fail at rate-limit or later (nonce is consumed)
    await request(app)
      .post('/api/v1/chat')
      .set('Authorization', BEARER)
      .set('X-Request-Timestamp', ts)
      .set('X-Nonce', nonce)
      .set('Content-Type', 'application/json')
      .send({ question: 'hello' });

    // Second request with the same nonce — must be rejected
    const res2 = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', BEARER)
      .set('X-Request-Timestamp', Date.now().toString())
      .set('X-Nonce', nonce)
      .set('Content-Type', 'application/json')
      .send({ question: 'hello' });

    expect(res2.status).toBe(400);
    expect(res2.body.error.code).toBe('NONCE_REUSED');
  });
});
