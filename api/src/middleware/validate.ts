import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from './errorHandler';

type ValidateTarget = 'params' | 'query' | 'body';

/**
 * Returns Express middleware that validates req[target] against a Zod schema.
 * On success, overwrites req[target] with the parsed (coerced) value.
 * On failure, calls next() with an AppError(422).
 */
export function validate<T>(schema: ZodSchema<T>, target: ValidateTarget = 'params') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const issues = formatZodError(result.error);
      next(AppError.invalidInput(`Validation failed on ${target}`, issues));
      return;
    }
    // Overwrite with coerced/defaulted values
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}

function formatZodError(err: ZodError): string {
  return err.issues
    .map((i) => `${i.path.join('.') || 'value'}: ${i.message}`)
    .join('; ');
}
