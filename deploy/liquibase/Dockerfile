# Liquibase + the MongoDB extension, packaged as a self-contained migration
# image: db/changelog is baked in, so this image runs identically in any
# environment (local, GoCD agent, Kubernetes Job) with no repo checkout and
# no Liquibase CLI installed on the host — just `docker run`.
#
# db/changelog/*.xml is this project's real source of truth (see
# Docs/DEPLOYMENT.md and scripts/init-db.js's own header comment, which
# existed only because no environment had the Liquibase CLI available
# before this image did).

# Global-scope ARG (declared before the first FROM) — must live here, not
# inside a stage, to be usable in the `FROM ${LIQUIBASE_BASE_IMAGE}` line
# below. Default is the public liquibase/liquibase image; this is exactly
# the knob to point at your private registry instead — e.g.
#   docker build --build-arg LIQUIBASE_BASE_IMAGE=registry.example.com/liquibase_mongo_migration:1.2.3 -f deploy/liquibase/Dockerfile .
# If your private image already bundles the MongoDB extension, the jars
# COPYed below just sit alongside your own copies — harmless redundancy,
# not a conflict (Liquibase loads every jar under /liquibase/lib). See
# deploy/liquibase/README.md.
ARG LIQUIBASE_BASE_IMAGE=liquibase/liquibase:5.0.3

# --- fetch: download + checksum-verify the OSS MongoDB extension and the
# MongoDB Java driver it depends on. Kept as a separate stage (plain
# `RUN curl ... && sha256sum -c`, not `ADD --checksum=`) so this builds on
# the plain legacy Docker builder too, not just BuildKit — verified in this
# session on Docker 29.5.2 without buildx installed. ---
FROM alpine:3.20 AS fetch
RUN apk add --no-cache curl
WORKDIR /jars

ARG LIQUIBASE_MONGODB_EXT_VERSION=5.0.3
ARG MONGODB_DRIVER_VERSION=5.7.0

# Versions picked to track each other: liquibase-mongodb's own release notes
# describe 5.0.x as "aligned with Liquibase [core] version 5.0.x" (see
# deploy/liquibase/README.md), so this extension version is paired with
# LIQUIBASE_BASE_IMAGE's default tag (liquibase/liquibase:5.0.3) below —
# change both together if you bump either.
RUN set -eux; \
    curl -fsSL -o liquibase-mongodb.jar "https://repo1.maven.org/maven2/org/liquibase/ext/liquibase-mongodb/${LIQUIBASE_MONGODB_EXT_VERSION}/liquibase-mongodb-${LIQUIBASE_MONGODB_EXT_VERSION}.jar" && \
    echo "a5b11ee083c09d127096d21aaeaf9477f3d28dbf307e86f62f877da4a759ea75  liquibase-mongodb.jar" | sha256sum -c -
RUN set -eux; \
    curl -fsSL -o mongodb-driver-sync.jar "https://repo1.maven.org/maven2/org/mongodb/mongodb-driver-sync/${MONGODB_DRIVER_VERSION}/mongodb-driver-sync-${MONGODB_DRIVER_VERSION}.jar" && \
    echo "30f694ccc185256620f5f55e567aaeb28d33c6ab5065ec5cae5e4865fc64ebb2  mongodb-driver-sync.jar" | sha256sum -c -
RUN set -eux; \
    curl -fsSL -o mongodb-driver-core.jar "https://repo1.maven.org/maven2/org/mongodb/mongodb-driver-core/${MONGODB_DRIVER_VERSION}/mongodb-driver-core-${MONGODB_DRIVER_VERSION}.jar" && \
    echo "35697a1ab3b2b35bc53c4af61f71a933bb1bc41cffc53197234f9d79899fc542  mongodb-driver-core.jar" | sha256sum -c -
RUN set -eux; \
    curl -fsSL -o bson.jar "https://repo1.maven.org/maven2/org/mongodb/bson/${MONGODB_DRIVER_VERSION}/bson-${MONGODB_DRIVER_VERSION}.jar" && \
    echo "93f4fb5223221d9d1d92e65dc50bcc6301a5f681947d413d3b30aa51f603d615  bson.jar" | sha256sum -c -

# --- runtime ---
FROM ${LIQUIBASE_BASE_IMAGE}

# --chown= explicitly, rather than relying on the inherited USER context —
# the base image's legacy-builder COPY didn't reliably grant the `liquibase`
# user write/chmod rights on these otherwise (verified: a plain COPY without
# --chown here failed a later `chmod +x` with "Operation not permitted").
COPY --chown=liquibase:liquibase --from=fetch /jars/*.jar /liquibase/lib/

# The official image's own docker-entrypoint.sh already auto-detects a
# populated /liquibase/changelog directory and cd's into it for relative
# paths (verified by reading that script directly — see README.md) — baking
# the changelog in at exactly this path gets that behavior for free, no
# custom path logic needed here.
COPY --chown=liquibase:liquibase db/changelog /liquibase/changelog

COPY --chown=liquibase:liquibase deploy/liquibase/entrypoint.sh /liquibase/imps-entrypoint.sh
RUN chmod +x /liquibase/imps-entrypoint.sh

ENTRYPOINT ["/liquibase/imps-entrypoint.sh"]
CMD ["update"]
