/**
 * Local/test bootstrap that mirrors db/changelog exactly.
 *
 * The Liquibase MongoDB extension (db/changelog/*.xml) is the source of
 * truth for real deployments. This script exists because this environment
 * has no Liquibase CLI installed — it applies the same collection
 * validators and indexes idempotently via the native driver so `yarn dev`
 * and the test suites are self-contained. Keep it in lockstep with the
 * changelog by hand; do not let it drift into being a second source of truth.
 */
import { MongoClient } from 'mongodb';
import { env } from '../src/config/env.js';

const clientsValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['_id', 'clientId', 'name', 'status', 'timezone', 'createdAt', 'updatedAt'],
    properties: {
      _id: { bsonType: 'string' },
      clientId: { bsonType: 'string' },
      name: { bsonType: 'string', minLength: 1 },
      status: { enum: ['ACTIVE', 'SUSPENDED'] },
      timezone: { bsonType: 'string' },
      createdBy: { bsonType: 'string' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

const configAuditValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['clientId', 'resource', 'action', 'actor', 'occurredAt'],
    properties: {
      clientId: { bsonType: 'string' },
      resource: { enum: ['CLIENT'] },
      action: { bsonType: 'string' },
      actor: { bsonType: 'string' },
      before: { bsonType: ['object', 'null'] },
      after: { bsonType: ['object', 'null'] },
      occurredAt: { bsonType: 'date' },
    },
  },
};

const clientConfigsValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['_id', 'clientId', 'configVersion', 'limitsVersion', 'allowedDimensions', 'createdAt', 'updatedAt'],
    properties: {
      _id: { bsonType: 'string' },
      clientId: { bsonType: 'string' },
      configVersion: { bsonType: 'number', minimum: 1 },
      limitsVersion: { bsonType: 'number', minimum: 0 },
      allowedDimensions: { bsonType: 'array' },
      createdBy: { bsonType: 'string' },
      updatedBy: { bsonType: 'string' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

const limitsValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['clientId', 'dimensionCode', 'windowType', 'currency', 'isActive', 'effectiveFrom', 'definitionVersion', 'createdAt', 'updatedAt'],
    properties: {
      clientId: { bsonType: 'string' },
      dimensionCode: { bsonType: 'string' },
      scope: { bsonType: ['object', 'null'] },
      windowType: { enum: ['PER_TXN', 'DAILY_CALENDAR', 'DAILY_ROLLING', 'MONTHLY'] },
      thresholdAmount: { bsonType: ['number', 'null'] },
      thresholdCount: { bsonType: ['number', 'null'] },
      currency: { enum: ['INR'] },
      isActive: { bsonType: 'bool' },
      effectiveFrom: { bsonType: 'date' },
      effectiveTo: { bsonType: ['date', 'null'] },
      definitionVersion: { bsonType: 'number', minimum: 1 },
      createdBy: { bsonType: 'string' },
      updatedBy: { bsonType: 'string' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

const limitsAuditValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['clientId', 'resource', 'action', 'actor', 'occurredAt'],
    properties: {
      clientId: { bsonType: 'string' },
      resource: { enum: ['REGISTRY', 'LIMIT_DEFINITION'] },
      action: { bsonType: 'string' },
      actor: { bsonType: 'string' },
      definitionVersion: { bsonType: ['number', 'null'] },
      before: { bsonType: ['object', 'array', 'null'] },
      after: { bsonType: ['object', 'array', 'null'] },
      occurredAt: { bsonType: 'date' },
    },
  },
};

const countersValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['_id', 'clientId', 'expireAt'],
    properties: {
      _id: { bsonType: 'string' },
      clientId: { bsonType: 'string' },
      amount: { bsonType: ['number', 'null'] },
      count: { bsonType: ['number', 'null'] },
      buckets: { bsonType: ['object', 'null'] },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
      expireAt: { bsonType: 'date' },
    },
  },
};

async function ensureCollection(db, name, validator) {
  const existing = await db.listCollections({ name }).toArray();
  if (existing.length === 0) {
    await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' });
  } else {
    await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
  }
}

export async function initDb(client, dbName = env.mongo.dbName) {
  const db = client.db(dbName);

  await ensureCollection(db, 'clients', clientsValidator);
  await db.collection('clients').createIndex({ clientId: 1 }, { unique: true, name: 'idx_clients_clientId_unique' });
  await db.collection('clients').createIndex({ status: 1 }, { name: 'idx_clients_status' });

  await ensureCollection(db, 'configAudit', configAuditValidator);
  await db
    .collection('configAudit')
    .createIndex({ clientId: 1, occurredAt: -1 }, { name: 'idx_configAudit_clientId_occurredAt' });

  await ensureCollection(db, 'clientConfigs', clientConfigsValidator);
  await db
    .collection('clientConfigs')
    .createIndex({ clientId: 1 }, { unique: true, name: 'idx_clientConfigs_clientId_unique' });

  await ensureCollection(db, 'limits', limitsValidator);
  await db
    .collection('limits')
    .createIndex({ clientId: 1, dimensionCode: 1, windowType: 1 }, { name: 'idx_limits_clientId_dimensionCode_windowType' });
  await db.collection('limits').createIndex({ clientId: 1 }, { name: 'idx_limits_clientId' });

  await ensureCollection(db, 'limitsAudit', limitsAuditValidator);
  await db
    .collection('limitsAudit')
    .createIndex({ clientId: 1, occurredAt: -1 }, { name: 'idx_limitsAudit_clientId_occurredAt' });

  await ensureCollection(db, 'counters', countersValidator);
  await db.collection('counters').createIndex({ expireAt: 1 }, { expireAfterSeconds: 0, name: 'idx_counters_expireAt_ttl' });
  await db.collection('counters').createIndex({ clientId: 1 }, { name: 'idx_counters_clientId' });
}

async function main() {
  const client = new MongoClient(env.mongo.uri);
  try {
    await client.connect();
    await initDb(client);
    console.log('Database initialised (clients, configAudit, clientConfigs, limits, limitsAudit, counters).');
  } finally {
    await client.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('DB init failed:', error);
    process.exit(1);
  });
}
