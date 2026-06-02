import { AppError } from './AppError';

export class QuotaExhaustedError extends AppError {
  constructor(message = 'Message quota exhausted') {
    super(message, 'QUOTA_EXHAUSTED', 429);
  }
}
