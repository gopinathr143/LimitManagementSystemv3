import 'dotenv/config';

function requireEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 3000),
  logLevel: process.env.LOG_LEVEL ?? 'info',

  mongo: {
    uri: requireEnv('MONGO_URI', 'mongodb://localhost:27017/imps_velocity?replicaSet=rs0'),
    dbName: requireEnv('MONGO_DB_NAME', 'imps_velocity'),
  },

  // No authentication on this API — callers are trusted same-cluster
  // consumers. ACTOR_HEADER is an optional, unverified caller-supplied
  // identifier recorded on audit trail entries (who made this change);
  // it is not a credential. Revisit when OAuth+scopes are onboarded.
  actorHeader: (process.env.ACTOR_HEADER ?? 'x-actor-id').toLowerCase(),
};
