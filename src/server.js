import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectToDatabase, closeDatabase } from './config/database.js';
import { createApp } from './app.js';

async function main() {
  const db = await connectToDatabase();
  const app = createApp(db);

  const server = app.listen(env.port, () => {
    logger.info({ port: env.port, nodeEnv: env.nodeEnv }, 'IMPS Outward Velocity Limit System listening');
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error({ err: error }, 'Fatal startup error');
  process.exit(1);
});
