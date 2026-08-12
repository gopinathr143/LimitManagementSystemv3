import { MongoClient, ReadPreference } from 'mongodb';
import { env } from './env.js';
import { logger } from './logger.js';

let client;
let db;

/**
 * BRD §4.6 — the enforcement path MUST read counters from the primary; a
 * secondary read under replication lag yields stale totals and over-approves
 * (fail-open). `PRIMARY_READ_OPTS` is the option bag every enforcement-path
 * repository call must pass explicitly, rather than relying on a driver
 * default that a future config change could silently weaken.
 */
export const PRIMARY_READ_OPTS = Object.freeze({ readPreference: ReadPreference.PRIMARY, readConcern: { level: 'local' } });

/** BRD §4.6 — claim insert / status resolution use majority write concern; the transactions collection is the system of record. */
export const MAJORITY_WRITE_OPTS = Object.freeze({ writeConcern: { w: 'majority' } });

/** BRD §4.6 — counter increments use w:1 on the hot path for latency; reconciliation repairs any loss. */
export const HOT_PATH_WRITE_OPTS = Object.freeze({ writeConcern: { w: 1 } });

export async function connectToDatabase() {
  if (db) {
    return db;
  }

  const options = {
    retryWrites: true,
    readPreference: ReadPreference.PRIMARY,
  };
  // Credentials are passed as a separate driver option, never concatenated
  // into the connection string — env.mongo.uri (built in env.js) never
  // contains the password even when MONGO_USERNAME/MONGO_PASSWORD are set.
  if (env.mongo.username) {
    options.auth = { username: env.mongo.username, password: env.mongo.password };
  }

  client = new MongoClient(env.mongo.uri, options);

  await client.connect();
  db = client.db(env.mongo.dbName);
  logger.info({ dbName: env.mongo.dbName }, 'Connected to MongoDB');
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Database not connected. Call connectToDatabase() during startup first.');
  }
  return db;
}

export async function closeDatabase() {
  if (client) {
    await client.close();
    client = undefined;
    db = undefined;
    logger.info('MongoDB connection closed');
  }
}
