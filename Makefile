.DEFAULT_GOAL := help
.PHONY: help install dev start \
        mongo-up mongo-down db-init \
        migrate migrate-status \
        lint test test-integration test-integration-slow test-all \
        clean

## help: show this list (default target)
help:
	@echo "Available targets:"
	@grep -E '^## ' Makefile | sed 's/^## /  /'

## install: install dependencies from the lockfile (yarn install --immutable)
install:
	yarn install --immutable

## dev: run the server locally with nodemon (auto-reload)
dev:
	yarn dev

## start: run the server locally (no auto-reload)
start:
	yarn start

## mongo-up: start the local MongoDB replica set (docker-compose) and wait until rs0 is ready
mongo-up:
	yarn mongo:up

## mongo-down: stop and remove the local MongoDB container + its volume
mongo-down:
	yarn mongo:down

## db-init: apply collection validators/indexes to the running MongoDB (idempotent; hand-mirrors db/changelog — see scripts/init-db.js)
db-init:
	yarn db:init

## migrate: run the Liquibase changelog (db/changelog/db.changelog-master.xml) against MONGO_URI
# Requires the `liquibase` CLI (with the MongoDB extension) on PATH — not
# installed in this project's dev/CI environments to date; `make db-init`
# is the proven stand-in used by local dev and every test suite instead.
migrate:
	yarn migrate

## migrate-status: show pending Liquibase changesets without applying them
migrate-status:
	yarn migrate:status

## lint: syntax-check every file under src/ (node --check)
lint:
	yarn lint

## test: run the unit test suite (no MongoDB required)
test:
	yarn test

## test-integration: run the integration suite against a real MongoDB replica set (requires `make mongo-up` first)
test-integration:
	yarn test:integration

## test-integration-slow: run the slow/certification suite (throughput, hot-counter concurrency, TTL — ~45s, requires `make mongo-up` first)
test-integration-slow:
	yarn test:integration:slow

## test-all: lint + unit + integration — everything except the slow certification suite (requires `make mongo-up` first)
test-all: lint test test-integration

## clean: stop MongoDB and remove node_modules
clean: mongo-down
	rm -rf node_modules
