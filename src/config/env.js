import 'dotenv/config';

function requireEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Two supported shapes, resolved in this order:
 *   1. `MONGO_URI` set explicitly — used verbatim (local dev / CI / anywhere
 *      a single connection string is simplest; no credential-splitting need).
 *   2. Otherwise, assembled from discrete `MONGO_HOSTS`/`MONGO_REPLICA_SET`/
 *      `MONGO_AUTH_SOURCE` — the shape a multi-node replica set behind a
 *      Kubernetes ConfigMap+Secret wants: hosts/replicaSet/authSource are not
 *      secret and can sit in a ConfigMap; only the password is a Secret value,
 *      and it is never embedded in this string (see connectToDatabase's
 *      `auth` option) — nothing here ever concatenates it into a URI, so
 *      there is no percent-encoding footgun for special characters in a
 *      password either.
 * The end result behaves identically for local dev with no env vars at all
 * (`mongodb://localhost:27017/imps_velocity?replicaSet=rs0`, exactly the old
 * hardcoded default) as it did before this split existed.
 */
function buildMongoUri() {
  if (process.env.MONGO_URI) {
    return process.env.MONGO_URI;
  }
  const hosts = process.env.MONGO_HOSTS ?? 'localhost:27017';
  const dbName = process.env.MONGO_DB_NAME ?? 'imps_velocity';
  const replicaSet = process.env.MONGO_REPLICA_SET ?? 'rs0';
  const authSourceParam = process.env.MONGO_USERNAME ? `&authSource=${process.env.MONGO_AUTH_SOURCE ?? 'admin'}` : '';
  return `mongodb://${hosts}/${dbName}?replicaSet=${replicaSet}${authSourceParam}`;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 3000),
  logLevel: process.env.LOG_LEVEL ?? 'info',

  mongo: {
    uri: buildMongoUri(),
    dbName: requireEnv('MONGO_DB_NAME', 'imps_velocity'),
    // Credentials, kept separate from `uri` on purpose — see connectToDatabase.
    // Both undefined (not empty-string) when unset, so `if (env.mongo.username)`
    // reads as "auth was actually configured", not "auth with an empty username".
    username: process.env.MONGO_USERNAME || undefined,
    password: process.env.MONGO_PASSWORD || undefined,
  },

  // No authentication on this API — callers are trusted same-cluster
  // consumers. ACTOR_HEADER is an optional, unverified caller-supplied
  // identifier recorded on audit trail entries (who made this change);
  // it is not a credential. Revisit when OAuth+scopes are onboarded.
  actorHeader: (process.env.ACTOR_HEADER ?? 'x-actor-id').toLowerCase(),
};
