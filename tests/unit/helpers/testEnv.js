process.env.ADMIN_API_KEYS = process.env.ADMIN_API_KEYS ?? 'test-admin-key-1,test-admin-key-2';
process.env.MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/imps_velocity_test?replicaSet=rs0';
process.env.MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? 'imps_velocity_test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';

export function mockReq({ headers = {}, body = {}, params = {} } = {}) {
  const lowerHeaders = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: lowerHeaders,
    header(name) {
      return lowerHeaders[name.toLowerCase()];
    },
    body,
    params,
    originalUrl: '/test',
  };
}

export function mockNext() {
  const calls = [];
  const next = (err) => calls.push(err);
  next.calls = calls;
  return next;
}
