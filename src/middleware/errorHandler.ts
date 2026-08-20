import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: 'NOT_FOUND', message: `no route for ${req.method} ${req.path}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err }, 'unhandled app error');
    }
    const body: Record<string, unknown> = { error: err.code, message: err.message };
    if ('details' in err && err.details !== undefined) body.details = err.details;
    res.status(err.statusCode).json(body);
    return;
  }

  logger.error({ err }, 'unexpected error');
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'an unexpected error occurred' });
}
