import 'dotenv/config';

function requireEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseList(value) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
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

  auth: {
    adminApiKeys: parseList(requireEnv('ADMIN_API_KEYS', 'change-me-admin-key')),
    apiKeyHeader: (process.env.API_KEY_HEADER ?? 'x-api-key').toLowerCase(),
    adminApiKeyHeader: (process.env.ADMIN_API_KEY_HEADER ?? 'x-admin-api-key').toLowerCase(),
  },
};
