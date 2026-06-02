import { Request, Response, NextFunction } from 'express';

type Role = 'USER' | 'ADMIN';

/**
 * Returns a middleware that enforces the required role.
 * ADMIN can access both ADMIN and USER routes.
 * USER can only access USER routes.
 *
 * Expects the user's role to be available on req.auth?.payload
 * as the custom claim (set by Auth0 rule/action).
 */
export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // express-oauth2-jwt-bearer populates req.auth after verifyToken runs
    const payload = (req as Request & { auth?: { payload?: Record<string, unknown> } }).auth
      ?.payload;

    const userRole = payload?.['https://api.ggi-backend.com/role'] as Role | undefined;

    if (!userRole) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Access forbidden: no role assigned',
          statusCode: 403,
        },
      });
      return;
    }

    // ADMIN satisfies any role requirement; USER only satisfies USER
    const hasAccess = userRole === 'ADMIN' || userRole === role;

    if (!hasAccess) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Access forbidden: requires ${role} role`,
          statusCode: 403,
        },
      });
      return;
    }

    next();
  };
}
