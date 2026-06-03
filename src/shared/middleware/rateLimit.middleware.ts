import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import { config } from '../../infrastructure/config/env';

const tooManyRequestsResponse = {
  error: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many requests, please try again later',
    statusCode: 429,
  },
};

function resolveIp(req: Request): string {
  const ip = req.ip ?? '0.0.0.0';
  return ipKeyGenerator(ip);
}

// Auth endpoints get tighter limits — 10 per 15 minutes per IP.
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

// Chat uses per-user limiting (falls back to IP for unauthenticated requests).
// Window and max are driven by env vars so they can be tuned per environment.
export const chatRateLimit = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const payload = (req as Request & { auth?: { payload?: { sub?: string } } }).auth?.payload;
    return payload?.sub ?? resolveIp(req);
  },
  handler: (_req, res) => {
    res.status(429).json(tooManyRequestsResponse);
  },
});

// Subscriptions get a slightly looser limit — 30 per minute per IP.
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
