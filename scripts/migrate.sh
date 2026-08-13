#!/usr/bin/env bash
# Builds and runs the Liquibase migration image (deploy/liquibase/) against
# MongoDB — real db/changelog, no local `liquibase` CLI required. Shared by
# `yarn migrate`/`yarn migrate:status` and `make migrate`/`make migrate-status`
# so the actual logic lives in exactly one place. See deploy/liquibase/README.md.
#
# Usage: scripts/migrate.sh <update|status|...any liquibase command>
#
# Same MONGO_* precedence as the app itself (src/config/env.js): MONGO_URI
# wins if set; otherwise assembled from MONGO_HOSTS/MONGO_USERNAME/
# MONGO_PASSWORD/MONGO_REPLICA_SET/MONGO_AUTH_SOURCE. Override any of these,
# plus LIQUIBASE_IMAGE/LIQUIBASE_DOCKER_NETWORK, via the environment, e.g.:
#   LIQUIBASE_DOCKER_NETWORK= MONGO_HOSTS=host1:27017,host2:27017,host3:27017 \
#     MONGO_USERNAME=app MONGO_PASSWORD=secret scripts/migrate.sh update
set -euo pipefail

COMMAND="${1:-update}"
LIQUIBASE_IMAGE="${LIQUIBASE_IMAGE:-imps-liquibase-migration:local}"

# Defaults target `make mongo-up`'s local replica set. That container
# initiates itself with member host "localhost:27017" (docker-compose.yml),
# so by default this joins its network namespace directly
# (--network container:imps-velocity-mongo) rather than going through the
# host's published port — otherwise the MongoDB driver discovers the
# replica set topology, sees the member advertised as "localhost", and
# reconnects to ITS OWN loopback instead of the mongo container (verified:
# this is exactly what happens over a plain host-port connection). Real
# multi-node clusters don't have this quirk (real DNS-resolvable hostnames,
# not "localhost") — set LIQUIBASE_DOCKER_NETWORK="" to disable this and
# point MONGO_HOSTS at one instead.
LIQUIBASE_DOCKER_NETWORK="${LIQUIBASE_DOCKER_NETWORK-container:imps-velocity-mongo}"
MONGO_HOSTS="${MONGO_HOSTS:-localhost:27017}"

docker build -f deploy/liquibase/Dockerfile -t "$LIQUIBASE_IMAGE" .

NETWORK_ARGS=()
if [ -n "$LIQUIBASE_DOCKER_NETWORK" ]; then
  NETWORK_ARGS=(--network "$LIQUIBASE_DOCKER_NETWORK")
fi

docker run --rm "${NETWORK_ARGS[@]}" \
  -e MONGO_URI \
  -e MONGO_HOSTS="$MONGO_HOSTS" \
  -e MONGO_REPLICA_SET \
  -e MONGO_AUTH_SOURCE \
  -e MONGO_USERNAME \
  -e MONGO_PASSWORD \
  -e MONGO_DB_NAME \
  "$LIQUIBASE_IMAGE" "$COMMAND"
