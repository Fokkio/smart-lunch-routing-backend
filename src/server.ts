import { createApp } from './app';
import { config, databaseConfigError } from './config/env';
import { checkConnection } from './database/mysql.connection';

async function main(): Promise<void> {
  // Fail fast on missing database configuration: print which variables are
  // blank (names only, never secrets) instead of silently falling back.
  const problem = databaseConfigError();
  if (problem) {
    console.error(problem);
    console.error('Fill in backend/.env, then restart. See backend/certs/README.md for the CA certificate.');
    process.exit(1);
  }
  // Configuration is present; the connection itself stays best-effort here
  // (a warning) so transient network issues do not mask startup.
  await checkConnection();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('[server] fatal error:', err);
  process.exit(1);
});
