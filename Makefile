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

## db-init: fast local/test-suite bootstrap (idempotent; hand-mirrors db/changelog — see scripts/init-db.js). Real deployments use `make migrate` instead.
db-init:
	yarn db:init

## migrate: build and run the real db/changelog (Liquibase, via Docker — no local CLI needed) against MongoDB — see deploy/liquibase/README.md
migrate:
	yarn migrate

## migrate-status: same as migrate, but only shows pending changesets without applying them
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
