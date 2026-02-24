import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly detail?: string
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(resource: string, id: string): AppError {
    return new AppError('NOT_FOUND', `${resource} not found`, 404, `No ${resource} with id "${id}"`);
  }

  static invalidInput(message: string, detail?: string): AppError {
    return new AppError('INVALID_INPUT', message, 422, detail);
  }

  static forbidden(message: string): AppError {
    return new AppError('FORBIDDEN', message, 403);
  }

  static dbError(detail?: string): AppError {
    return new AppError('DB_ERROR', 'Database query failed', 500, detail);
  }
}

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    detail?: string;
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    const body: ErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.detail ? { detail: err.detail } : {}),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Generic / unexpected error — never leak internals to client
  const isNeo4jError = err.name === 'Neo4jError' || err.constructor?.name === 'Neo4jError';
  const statusCode = 500;
  const detailForClient = config.isProd
    ? undefined
    : `${err.name}: ${err.message}`;
  const body: ErrorBody = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      ...(detailForClient ? { detail: detailForClient } : {}),
    },
  };

  // Always log full detail internally (never send stack to client)
  console.error('[error]', err.name, err.message);
  if (config.isDev && (err as Error).stack) {
    console.error('[error] stack:', (err as Error).stack);
  }
  if (isNeo4jError) {
    console.error('[error] Neo4j detail:', (err as Error).message);
  }
  res.status(statusCode).json(body);
}
