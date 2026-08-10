---
name: node-feature-generator
description: Generates clean-architecture components (Controller -> Service -> Repository -> Model -> Route) placed directly in layer-specific directories with feature-prefixed filenames.
---

# Feature Component Generator

Generate all JavaScript ESM feature logic strictly using layer folders (`controllers/`, `services/`, `repositories/`, `models/`, `routes/`).

## Architecture Separation

1. **Model** (`src/models/<feature>.model.js`) — Mongoose schema definition.
2. **Repository** (`src/repositories/<feature>.repository.js`) — Encapsulates DB queries using Mongoose models.
3. **Service** (`src/services/<feature>.service.js`) — Pure business logic; accepts repository via constructor injection.
4. **Controller** (`src/controllers/<feature>.controller.js`) — Request/response flow; accepts service via constructor injection.
5. **Route** (`src/routes/<feature>.routes.js`) — Route definitions with middleware integration window.

## Component Templates (Pure JavaScript)

### 1. Repository (`src/repositories/user.repository.js`)
```javascript
export class UserRepository {
  constructor(userModel) {
    this.userModel = userModel;
  }

  async findById(id) {
    return await this.userModel.findById(id);
  }

  async create(data) {
    return await this.userModel.create(data);
  }
}
```

### 2. Service (`src/services/user.service.js`)
```javascript
export class UserService {
  constructor(userRepository) {
    this.userRepository = userRepository;
  }

  async getUser(id) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }
    return user;
  }

  async createUser(data) {
    return await this.userRepository.create(data);
  }
}
```

### 3. Controller (`src/controllers/user.controller.js`)
```javascript
export class UserController {
  constructor(userService) {
    this.userService = userService;
  }

  getUserById = async (req, res, next) => {
    try {
      const user = await this.userService.getUser(req.params.id);
      res.status(200).json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  };

  create = async (req, res, next) => {
    try {
      const newUser = await this.userService.createUser(req.body);
      res.status(201).json({ success: true, data: newUser });
    } catch (error) {
      next(error);
    }
  };
}
```

### 4. Router & Middleware Window (`src/routes/user.routes.js`)
```javascript
import { Router } from 'express';

export const createUserRouter = (userController, routeMiddlewares = []) => {
  const router = Router();

  // Middleware Window: Apply route-level middleware (Auth, Validation, etc.)
  if (routeMiddlewares.length > 0) {
    router.use(...routeMiddlewares);
  }

  router.get('/:id', userController.getUserById);
  router.post('/', userController.create);

  return router;
};
```
