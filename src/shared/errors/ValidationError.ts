import type { ZodIssue } from 'zod';
import { AppError } from './AppError';

export class ValidationError extends AppError {
  public readonly details: ZodIssue[];

  constructor(message = 'Validation failed', details: ZodIssue[] = []) {
    super(message, 'VALIDATION_ERROR', 400);
    this.details = details;
  }
}
