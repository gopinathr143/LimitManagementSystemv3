# syntax=docker/dockerfile:1

# package.json pins engines.node to the exact release (24.12.0) — this build
# uses that same exact tag, not a floating node:24-alpine, so CI/production
# actually runs what the project declares (see .yarnrc's comment: local dev
# machines relax this, CI/production must not).
FROM node:24.12.0-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable && yarn install --immutable

# --- runtime: only what src/server.js needs at process start ---
FROM node:24.12.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY db ./db

USER app
EXPOSE 3000

# No curl/wget in alpine by default — Node 24 ships a stable global fetch,
# so the healthcheck costs nothing extra in the image.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form — node is PID 1 and receives SIGTERM/SIGINT directly; src/server.js
# already handles both for graceful shutdown (config cache, sweepers, DB connection).
CMD ["node", "src/server.js"]
