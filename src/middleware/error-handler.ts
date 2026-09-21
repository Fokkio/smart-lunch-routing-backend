import type { NextFunction, Request, Response } from 'express';

/**
 * Centralized Express error handler (intentionally small).
 * Controllers pass errors via next(err); this middleware formats the response.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = err instanceof Error ? err.message : 'Internal server error';
  const statusCode = (err as { statusCode?: unknown }).statusCode;
  const notConfigured =
    message.includes('Database not configured') ||
    message.includes('Database configuration is incomplete');
  // 503 makes "DB env missing" distinguishable from real 500 bugs.
  const status =
    typeof statusCode === 'number' ? statusCode : notConfigured ? 503 : 500;
  res.status(status).json({ message });
}
