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
    required: ['_id', 'clientId', 'name', 'status', 'timezone', 'authBinding', 'createdAt', 'updatedAt'],
    properties: {
      _id: { bsonType: 'string' },
      clientId: { bsonType: 'string' },
      name: { bsonType: 'string', minLength: 1 },
      status: { enum: ['ACTIVE', 'SUSPENDED'] },
      timezone: { bsonType: 'string' },
      authBinding: {
        bsonType: 'object',
        required: ['type', 'apiKeyHash', 'fingerprint', 'rotatedAt'],
        properties: {
          type: { enum: ['API_KEY'] },
          apiKeyHash: { bsonType: 'string' },
          fingerprint: { bsonType: 'string' },
          rotatedAt: { bsonType: 'date' },
        },
      },
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
  await db.collection('clients').createIndex(
    { 'authBinding.apiKeyHash': 1 },
    { unique: true, sparse: true, name: 'idx_clients_apiKeyHash_unique' },
  );
  await db.collection('clients').createIndex({ status: 1 }, { name: 'idx_clients_status' });

  await ensureCollection(db, 'configAudit', configAuditValidator);
  await db
    .collection('configAudit')
    .createIndex({ clientId: 1, occurredAt: -1 }, { name: 'idx_configAudit_clientId_occurredAt' });
}

async function main() {
  const client = new MongoClient(env.mongo.uri);
  try {
    await client.connect();
    await initDb(client);
    console.log('Database initialised (clients, configAudit).');
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
