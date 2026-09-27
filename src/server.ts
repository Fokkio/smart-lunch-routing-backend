import app from "./app";

import {
  config,
  databaseConfigError,
} from "./config/env";

import {
  checkConnection,
  closePool,
} from "./database/mysql.connection";

async function main(): Promise<void> {
  // ตรวจสอบค่า environment variable ของ database
  const problem = databaseConfigError();

  if (problem) {
    console.error(problem);
    console.error("Fill in .env, then restart.");
    process.exit(1);
  }

  // ทดลองเชื่อมต่อ TiDB
  await checkConnection();

  // Start Express server
  const server = app.listen(config.port, () => {
    console.log(
      `[server] listening on http://localhost:${config.port}`
    );
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[server] received ${signal}, shutting down...`);

    server.close(async () => {
      try {
        await closePool();
        console.log("[server] database pool closed.");
      } catch (error) {
        console.error(
          "[server] failed to close database pool:",
          error
        );
      }

      process.exit(0);
    });
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((err) => {
  console.error("[server] fatal error:", err);
  process.exit(1);
});