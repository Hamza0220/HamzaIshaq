import { Request, Response, NextFunction } from 'express';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

// In-memory nonce store: nonce -> expiry timestamp
const usedNonces = new Map<string, number>();

/**
 * Purge expired nonces to keep memory bounded.
 */
function purgeExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, expiry] of usedNonces) {
    if (now > expiry) {
      usedNonces.delete(nonce);
    }
  }
}

/**
 * Replay-attack prevention middleware.
 *
 * Expects:
 *   X-Request-Timestamp  — Unix timestamp in milliseconds (string)
 *   X-Nonce              — Unique random value per request
 */
export function nonceValidation(req: Request, res: Response, next: NextFunction): void {
  const timestamp = req.headers['x-request-timestamp'];
  const nonce = req.headers['x-nonce'];

  // 1. Both headers must be present
  if (!timestamp || !nonce) {
    res.status(400).json({
      error: {
        code: 'MISSING_SECURITY_HEADERS',
        message: 'X-Request-Timestamp and X-Nonce headers are required',
        statusCode: 400,
      },
    });
    return;
  }

  const nonceStr = Array.isArray(nonce) ? (nonce[0] ?? '') : nonce;
  const tsStr = Array.isArray(timestamp) ? (timestamp[0] ?? '') : timestamp;
  const tsNum = Number(tsStr);

  // 2. Timestamp must not be older than 5 minutes
  const now = Date.now();
  if (isNaN(tsNum) || now - tsNum > FIVE_MINUTES_MS) {
    res.status(400).json({
      error: {
        code: 'REQUEST_EXPIRED',
        message: 'Request timestamp is expired or invalid',
        statusCode: 400,
      },
    });
    return;
  }

  // 3. Nonce must not have been seen before
  purgeExpiredNonces();
  if (usedNonces.has(nonceStr)) {
    res.status(400).json({
      error: {
        code: 'NONCE_REUSED',
        message: 'Nonce has already been used',
        statusCode: 400,
      },
    });
    return;
  }

  // Store nonce; auto-expire after 5 minutes
  usedNonces.set(nonceStr, now + FIVE_MINUTES_MS);
  setTimeout(() => usedNonces.delete(nonceStr), FIVE_MINUTES_MS);

  next();
}
