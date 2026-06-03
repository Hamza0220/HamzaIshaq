import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../errors/AppError';

function createPrismaClient(): PrismaClient {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();

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

type AuthPayload = {
  sub?: string;
  email?: string;
  [key: string]: unknown;
};

type AuthRequest = Request & {
  auth?: { payload?: AuthPayload };
};

// Runs after verifyToken. Upserts the Auth0 user into our database and attaches
// the resulting DB record to req.dbUser so controllers can work with the
// internal UUID instead of the raw Auth0 subject claim.
export async function syncUser(
  req: Request,
  _res: Response,
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
    // M2M tokens from client_credentials flow don't include an email claim.
    // We derive a synthetic one so the DB unique constraint stays satisfied.
    const email =
      (payload?.email as string | undefined) ??
      `${sub.replace(/[^a-zA-Z0-9]/g, '_')}@m2m.local`;

    const user = await prisma.user.upsert({
      where: { auth0Id: sub },
      update: {},
      create: {
        auth0Id: sub,
        email,
        role: 'USER',
      },
      select: { id: true, email: true, role: true },
    });

    req.dbUser = { id: user.id, email: user.email, role: user.role };
    req.userId = user.id;

    next();
  } catch (err) {
    next(err);
  }
}
