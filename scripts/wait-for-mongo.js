import { MongoClient } from 'mongodb';

const uri = process.env.MONGO_URI ?? 'mongodb://localhost:27017/imps_velocity?replicaSet=rs0';
const maxAttempts = 30;
const delayMs = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForMongo = async () => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
    try {
      await client.connect();
      const admin = client.db().admin();
      const status = await admin.command({ replSetGetStatus: 1 });
      const hasPrimary = status.members?.some((member) => member.stateStr === 'PRIMARY');
      await client.close();
      if (hasPrimary) {
        console.log(`Mongo replica set rs0 is ready (attempt ${attempt}).`);
        return;
      }
    } catch (error) {
      await client.close().catch(() => {});
    }
    await sleep(delayMs);
  }
  console.error(`Mongo replica set did not become ready after ${maxAttempts} attempts.`);
  process.exit(1);
};

await waitForMongo();
