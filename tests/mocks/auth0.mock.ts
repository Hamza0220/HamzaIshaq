/**
 * auth0.mock.ts
 *
 * Replaces express-oauth2-jwt-bearer's `auth()` with a controlled test
 * implementation that injects req.auth without contacting Auth0.
 *
 * MUST be called before importing createApp() in each test file:
 *
 *   import { mockAuth0 } from '../../mocks/auth0.mock';
 *   mockAuth0('USER');
 *   // only then:
 *   import { createApp } from '../../../src/app';
 */

export type TestRole = 'USER' | 'ADMIN';

const ROLE_CLAIM    = 'https://api.ggi-backend.com/role';
const TEST_SUB      = 'auth0|test-user-id-integration';
const TEST_EMAIL    = 'test@example.com';

export function mockAuth0(role: TestRole = 'USER'): void {
  jest.mock('express-oauth2-jwt-bearer', () => ({
    auth: () =>
      (
        req: import('express').Request,
        res: import('express').Response,
        next: import('express').NextFunction,
      ) => {
        const authHeader = req.headers['authorization'];

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.status(401).json({
            error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token', statusCode: 401 },
          });
          return;
        }

        // Inject payload — use type assertion to avoid needing VerifyJwtResult
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).auth = {
          payload: {
            sub:        TEST_SUB,
            email:      TEST_EMAIL,
            iss:        'https://test.auth0.com/',
            aud:        'https://api.ggi-backend.com',
            exp:        Math.floor(Date.now() / 1000) + 3600,
            iat:        Math.floor(Date.now() / 1000),
            [ROLE_CLAIM]: role,
          },
          header: { alg: 'RS256', typ: 'JWT' },
          token:  'mock.test.token',
        };

        next();
      },
  }));
}

export { TEST_SUB, TEST_EMAIL };
