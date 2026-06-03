import type { Request } from 'express';

// Augmented request type that includes the JWT payload (set by express-oauth2-jwt-bearer)
// and the synced DB user (set by syncUser middleware).
export type AuthRequest = Request & {
  auth?: { payload?: { sub?: string } };
  dbUser?: { id: string; email: string; role: string };
};
