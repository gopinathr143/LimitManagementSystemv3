#!/bin/bash
# Thin wrapper: assembles the same MONGO_HOSTS/MONGO_USERNAME/MONGO_PASSWORD/
# MONGO_REPLICA_SET/MONGO_AUTH_SOURCE/MONGO_DB_NAME env vars the application
# itself uses (src/config/env.js's buildMongoUri) into the LIQUIBASE_COMMAND_*
# env vars Liquibase's own CLI understands natively, then hands off to the
# base image's own docker-entrypoint.sh — deliberately not reimplementing
# its relative-path/search-path handling (see README.md for what reading
# that script showed).
#
# Precedence, matching src/config/env.js exactly:
#   1. LIQUIBASE_COMMAND_URL already set — left untouched.
#   2. MONGO_URI set — used verbatim.
#   3. Otherwise assembled from the discrete MONGO_* vars, defaulting
#      exactly like local dev's docker-compose rs0 (no env vars at all ->
#      mongodb://localhost:27017/imps_velocity?replicaSet=rs0).
set -euo pipefail

if [ -z "${LIQUIBASE_COMMAND_URL:-}" ]; then
  if [ -n "${MONGO_URI:-}" ]; then
    export LIQUIBASE_COMMAND_URL="$MONGO_URI"
  else
    MONGO_HOSTS="${MONGO_HOSTS:-localhost:27017}"
    MONGO_DB_NAME="${MONGO_DB_NAME:-imps_velocity}"
    MONGO_REPLICA_SET="${MONGO_REPLICA_SET:-rs0}"
    AUTH_SOURCE_PARAM=""
    if [ -n "${MONGO_USERNAME:-}" ]; then
      AUTH_SOURCE_PARAM="&authSource=${MONGO_AUTH_SOURCE:-admin}"
    fi
    export LIQUIBASE_COMMAND_URL="mongodb://${MONGO_HOSTS}/${MONGO_DB_NAME}?replicaSet=${MONGO_REPLICA_SET}${AUTH_SOURCE_PARAM}"
  fi
fi

# Never embedded in LIQUIBASE_COMMAND_URL above — passed as separate
# Liquibase-native env vars instead, same reasoning as
# src/config/database.js's `auth` option: no percent-encoding footgun for
# special characters in the password.
if [ -n "${MONGO_USERNAME:-}" ]; then
  export LIQUIBASE_COMMAND_USERNAME="${LIQUIBASE_COMMAND_USERNAME:-$MONGO_USERNAME}"
  export LIQUIBASE_COMMAND_PASSWORD="${LIQUIBASE_COMMAND_PASSWORD:-${MONGO_PASSWORD:-}}"
fi

export LIQUIBASE_COMMAND_DRIVER="${LIQUIBASE_COMMAND_DRIVER:-liquibase.ext.mongodb.database.MongoClientDriver}"
# Relative on purpose (no leading /) — matches db/changelog/db.changelog-master.xml's
# own name, and its relative value is exactly what makes the base image's
# docker-entrypoint.sh auto-cd into /liquibase/changelog (where this image's
# Dockerfile bakes db/changelog in) and add --search-path=. automatically.
export LIQUIBASE_COMMAND_CHANGELOG_FILE="${LIQUIBASE_COMMAND_CHANGELOG_FILE:-db.changelog-master.xml}"

exec /liquibase/docker-entrypoint.sh "$@"
