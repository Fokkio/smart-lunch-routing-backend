import type { Server } from 'node:http';
import app from './app';

import {
  config,
  databaseConfigError,
} from './config/env';

import {
  checkConnection,
  closePool,
} from './database/mysql.connection';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  // ตรวจสอบค่า environment variable ของ database
  const problem = databaseConfigError();

  if (problem) {
    console.error(problem);
    console.error('Fill in .env, then restart.');
    process.exit(1);
  }

  // ทดลองเชื่อมต่อ TiDB
  await checkConnection();

  // Start Express server
  const server = app.listen(config.port, () => {
    console.log(
      `[server] listening on http://localhost:${config.port}`,
    );
  });

  registerGracefulShutdown(server);
}

function registerGracefulShutdown(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      console.warn(`[server] ${signal} received while shutdown is already running.`);
      return;
    }

    shuttingDown = true;
    console.log(`[server] received ${signal}, shutting down...`);

    const forceExitTimer = setTimeout(() => {
      console.error('[server] graceful shutdown timed out. Exiting.');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    server.close((error) => {
      void (async () => {
        try {
          if (error) {
            console.error('[server] error while closing HTTP server:', error);
            process.exitCode = 1;
          }

          await closePool();
          console.log('[server] database pool closed.');
          console.log('[server] shutdown complete.');
        } catch (closeError) {
          console.error('[server] failed to close database pool:', closeError);
          process.exitCode = 1;
        } finally {
          clearTimeout(forceExitTimer);
          process.exit(process.exitCode ?? 0);
        }
      })();
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[server] fatal error:', err);
  process.exit(1);
});
