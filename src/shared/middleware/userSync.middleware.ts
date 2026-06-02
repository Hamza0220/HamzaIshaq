import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../errors/AppError';

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
// Extend Express.Request with the synced DB user
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      dbUser?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Type alias for the JWT payload shape after verifyToken
// ---------------------------------------------------------------------------

type AuthPayload = {
  sub?: string;
  email?: string;
  [key: string]: unknown;
};

type AuthRequest = Request & {
  auth?: { payload?: AuthPayload };
};

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * syncUser — runs immediately after verifyToken.
 *
 * Upserts the authenticated user in the database using their Auth0 sub claim,
 * then attaches the DB record to req.dbUser so downstream middleware and
 * controllers can use the internal UUID instead of the Auth0 ID.
 */
export async function syncUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authReq = req as AuthRequest;
  const payload = authReq.auth?.payload;
  const sub = payload?.sub;

  if (!sub) {
    next(new AppError('Missing auth subject', 'UNAUTHORIZED', 401));
    return;
  }

  try {
    // M2M tokens (client_credentials) don't carry an email claim.
    // Fall back to a synthetic email derived from the sub so the unique
    // constraint is satisfied. Real user tokens supply the actual email.
    const email =
      (payload?.email as string | undefined) ??
      `${sub.replace(/[^a-zA-Z0-9]/g, '_')}@m2m.local`;

    const user = await prisma.user.upsert({
      where: { auth0Id: sub },
      update: {}, // nothing to update — profile changes come from Auth0
      create: {
        auth0Id: sub,
        email,
        role: 'USER',
      },
      select: { id: true, email: true, role: true },
    });

    // Attach to req so controllers and rate-limiters can use the DB id
    req.dbUser = { id: user.id, email: user.email, role: user.role };

    // Also populate the existing req.userId field used by the request logger
    req.userId = user.id;

    next();
  } catch (err) {
    next(err);
  }
}
