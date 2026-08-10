// Side-effect-only module. Must be the FIRST import in any integration test
// entry point (setup.js) — ES module evaluation runs all of a file's
// imports (in source order) before that file's own top-level statements,
// so plain `process.env.X = ...` lines in setup.js itself would run too
// late to affect src/config/env.js, which reads process.env at import time.
process.env.MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/imps_velocity_test?replicaSet=rs0';
process.env.MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? 'imps_velocity_test';
process.env.ADMIN_API_KEYS = process.env.ADMIN_API_KEYS ?? 'it-admin-key-1,it-admin-key-2';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
