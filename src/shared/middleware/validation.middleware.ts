import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

// Validates req.body against the provided Zod schema.
// On success, replaces req.body with the parsed (sanitised, type-safe) data.
// On failure, returns a 400 with the full Zod issue list.
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const error = result.error as ZodError;
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          statusCode: 400,
          details: error.issues,
        },
      });
      return;
    }

    req.body = result.data;
    next();
  };
}
