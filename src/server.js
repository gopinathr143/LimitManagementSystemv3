import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectToDatabase, closeDatabase } from './config/database.js';
import { createApp } from './app.js';

async function main() {
  const db = await connectToDatabase();
  const app = createApp(db);

  // BRD §4.3 "read at startup"; STORY-02-06 — warm every ACTIVE client's
  // registry/limits into the in-process cache before accepting traffic,
  // then keep it fresh via polling so a change on another instance
  // propagates without a restart.
  const warmedClientIds = await app.locals.warmConfigCache();
  logger.info({ count: warmedClientIds.length }, 'Config cache warmed');
  app.locals.configCache.startPolling();

  // BRD §3.1.1 — the stale-claim reaper, freeing transactionIds orphaned by a crashed instance.
  app.locals.staleClaimReaperService.start();

  const server = app.listen(env.port, () => {
    logger.info({ port: env.port, nodeEnv: env.nodeEnv }, 'IMPS Outward Velocity Limit System listening');
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down');
    app.locals.configCache.stopPolling();
    app.locals.staleClaimReaperService.stop();
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
