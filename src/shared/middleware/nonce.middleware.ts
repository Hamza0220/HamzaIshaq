import { Request, Response, NextFunction } from 'express';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

// Maps nonce → expiry timestamp. Kept in memory; acceptable for a single
// instance. A distributed deployment would need Redis or similar.
const usedNonces = new Map<string, number>();

function purgeExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, expiry] of usedNonces) {
    if (now > expiry) usedNonces.delete(nonce);
  }
}

// Replay-attack prevention.
// Each POST to /chat must include:
//   X-Request-Timestamp  — Unix timestamp in milliseconds
//   X-Nonce              — A unique value that hasn't been used before
export function nonceValidation(req: Request, res: Response, next: NextFunction): void {
  const timestamp = req.headers['x-request-timestamp'];
  const nonce = req.headers['x-nonce'];

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

  if (isNaN(tsNum) || Date.now() - tsNum > FIVE_MINUTES_MS) {
    res.status(400).json({
      error: {
        code: 'REQUEST_EXPIRED',
        message: 'Request timestamp is expired or invalid',
        statusCode: 400,
      },
    });
    return;
  }

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

  usedNonces.set(nonceStr, Date.now() + FIVE_MINUTES_MS);
  setTimeout(() => usedNonces.delete(nonceStr), FIVE_MINUTES_MS);

  next();
}
