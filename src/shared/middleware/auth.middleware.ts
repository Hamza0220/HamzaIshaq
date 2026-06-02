import { auth } from 'express-oauth2-jwt-bearer';
import { config } from '../../infrastructure/config/env';

/**
 * Validates the incoming Bearer JWT against Auth0.
 * Checks issuer, audience, expiry, and signature automatically.
 */
export const verifyToken = auth({
  issuerBaseURL: `https://${config.AUTH0_DOMAIN}`,
  audience: config.AUTH0_AUDIENCE,
  tokenSigningAlg: 'RS256',
});
