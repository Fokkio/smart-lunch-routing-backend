import type { NextFunction, Request, Response } from 'express';

/**
 * Centralized Express error handler (intentionally small).
 * Controllers pass errors via next(err); this middleware formats the response.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = err instanceof Error ? err.message : 'Internal server error';
  const statusCode = err && typeof err === 'object' ? (err as { statusCode?: unknown; status?: unknown }).statusCode ?? (err as { status?: unknown }).status : undefined;
  const notConfigured =
    message.includes('Database not configured') ||
    message.includes('Database configuration is incomplete') ||
    message.includes('Missing database configuration');
  // 503 makes "DB env missing" distinguishable from real 500 bugs.
  const status =
    typeof statusCode === 'number' && Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : notConfigured ? 503 : 500;
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ message: status >= 500 ? 'Service unavailable; please try again later' : message });
}
