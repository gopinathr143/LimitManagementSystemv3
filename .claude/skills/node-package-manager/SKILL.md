---
name: node-package-manager
description: Handles adding, removing, and updating dependencies strictly using Yarn, ensuring custom registry configurations in .yarnrc.yml are respected.
---

# Yarn Package Manager Guide

Strictly adhere to **Yarn** for dependency management. Never run `npm install` or `npx`.

## Package Commands

| Action | Command |
| :--- | :--- |
| **Add Production Dependency** | `yarn add <package>` |
| **Add Development Dependency** | `yarn add -D <package>` |
| **Remove Dependency** | `yarn remove <package>` |
| **Upgrade Package** | `yarn up <package>` |
| **Install Project Dependencies** | `yarn install` |

## Registry Rules

- Default registry in `.yarnrc.yml` must point to `https://registry.npmjs.org`.
- For scoped private registries, add registry rules to `.yarnrc.yml`:

```yaml
npmScopes:
  mycompany:
    npmRegistryServer: "https://npm.pkg.github.com"
```
