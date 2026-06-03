import { Request, Response, NextFunction } from 'express';

type Role = 'USER' | 'ADMIN';

// ADMIN role satisfies any route requirement.
// USER role only satisfies routes that require USER.
export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
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
