---
name: node-service-init
description: Scaffolds a Node.js service using pure JavaScript, Layered Clean Architecture (controllers, services, repositories, models), MongoDB, Yarn, and Liquibase.
---

# Node.js Service Initializer

Follow these strict rules to initialize the project runtime and architecture.

## 1. Registry & Runtime Environment

### `.nvmrc`
```text
20.18.0
```

### `.yarnrc.yml`
Configure Yarn 3+ / Berry to use standard NPM registry by default:
```yaml
nodeLinker: node-modules
npmRegistryServer: "https://registry.npmjs.org"
```

> **Developer Override:** If you need a private NPM registry, edit `npmRegistryServer` or configure `npmScopes` inside `.yarnrc.yml`.

## 2. Layer-Based Directory Structure

All components must be grouped by architectural layers (not feature folders). File names denote feature boundaries.

```text
src/
├── config/             # DB & environmental configuration
│   └── database.js
├── controllers/        # Request/response handling (e.g., user.controller.js)
├── services/           # Core business logic (e.g., user.service.js)
├── repositories/       # Database interactions (e.g., user.repository.js)
├── models/             # Mongoose schemas (e.g., user.model.js)
├── routes/             # Express route definitions (e.g., user.routes.js)
├── middleware/         # Middleware extension points
│   ├── index.js        # Global middleware window
│   └── errorHandler.js # Centralized error handler
├── utils/              # Helper utilities
├── app.js              # App express instance & pipeline assembly
└── server.js           # Service entrypoint
```

## 3. Middleware Integration Window (`src/middleware/index.js`)

Expose developer extension hooks for global middleware injection:

```javascript
import express from 'express';

/**
 * Global Middleware Register Window
 * Developer hook: Add custom global middlewares inside this function.
 */
export const registerGlobalMiddleware = (app) => {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Developer Extension Hook:
  // Example: app.use(authMiddleware);
  // Example: app.use(cors());
};
```

## 4. Initialization Commands
Always use **Yarn** for dependency management:
```bash
yarn init -y
yarn add express mongoose dotenv cors
yarn add -D nodemon
```
