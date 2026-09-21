import fs from 'node:fs';
import 'dotenv/config';

const value = (name: string): string | undefined => process.env[name]?.trim() || undefined;
const port = Number(process.env['PORT'] ?? 3000);
const dbPort = Number(process.env['DB_PORT'] ?? NaN);
const osrmTimeoutMs = Number(process.env['OSRM_TIMEOUT_MS'] ?? 8000);
export const config = { port: Number.isFinite(port) ? port : 3000, corsOrigin: value('CORS_ORIGIN'), osrm: {
  // Single owner of the OSRM URL. Default is the public OSRM demo server —
  // a development convenience, NOT production infrastructure.
  baseUrl: value('OSRM_BASE_URL') ?? 'https://router.project-osrm.org',
  timeoutMs: Number.isFinite(osrmTimeoutMs) && osrmTimeoutMs > 0 ? osrmTimeoutMs : 8000,
}, db: { host: value('DB_HOST'), port: Number.isFinite(dbPort) ? dbPort : 3306, user: value('DB_USER'), password: value('DB_PASSWORD'), database: value('DB_NAME'), ssl: value('DB_SSL')?.toLowerCase() === 'true', caPath: value('DB_SSL_CA_PATH') } };

const REQUIRED_DB_VARS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const;

/**
 * Validate database configuration without printing secrets.
 *
 * Only variable NAMES are ever reported — values (especially DB_PASSWORD
 * and certificate contents) never appear in messages or logs. There is no
 * localhost fallback: blank values fail validation instead of silently
 * connecting somewhere unintended.
 */
export function databaseConfigError(
  dependencies: { fileExists?: (path: string) => boolean } = {},
): string | null {
  const fileExists = dependencies.fileExists ?? fs.existsSync;
  const lines: string[] = [];
  const missing = REQUIRED_DB_VARS.filter((key) => !value(key));
  if (missing.length) {
    lines.push('Missing database configuration:');
    for (const key of missing) lines.push(`- ${key}`);
  }
  if (config.db.ssl) {
    if (!config.db.caPath) {
      lines.push('DB_SSL=true requires DB_SSL_CA_PATH to point to the Aiven CA certificate.');
    } else if (!fileExists(config.db.caPath)) {
      lines.push('Aiven SSL certificate not found:');
      lines.push(config.db.caPath);
    }
  }
  return lines.length ? lines.join('\n') : null;
}
export function hasDbConfig(): boolean { return databaseConfigError() === null; }
