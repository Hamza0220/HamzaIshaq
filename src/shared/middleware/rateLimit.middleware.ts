import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

const tooManyRequestsResponse = {
  error: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many requests, please try again later',
    statusCode: 429,
  },
};

/** Normalise an IPv4/IPv6 address via the official helper. */
function resolveIp(req: Request): string {
  const ip = req.ip ?? '0.0.0.0';
  return ipKeyGenerator(ip);
}

/**
 * Auth endpoints: 10 requests per 15 minutes per IP.
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: resolveIp,
  handler: (_req, res) => {
    res.status(429).json(tooManyRequestsResponse);
  },
});

/**
 * Chat endpoints: 20 requests per 1 minute per authenticated user (fallback to IP).
 */
export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use the Auth0 subject claim if available, otherwise fall back to IP
    const payload = (req as Request & { auth?: { payload?: { sub?: string } } }).auth
      ?.payload;
    return payload?.sub ?? resolveIp(req);
  },
  handler: (_req, res) => {
    res.status(429).json(tooManyRequestsResponse);
  },
});

/**
 * Subscription endpoints: 30 requests per 1 minute per IP.
 */
export const subscriptionRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: resolveIp,
  handler: (_req, res) => {
    res.status(429).json(tooManyRequestsResponse);
  },
});
