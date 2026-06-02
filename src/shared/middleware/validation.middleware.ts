import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Factory that returns a validation middleware for the given Zod schema.
 * On success, req.body is replaced with the parsed (type-safe, sanitised) data.
 * On failure, responds 400 with VALIDATION_ERROR and the full Zod issue list.
 */
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
