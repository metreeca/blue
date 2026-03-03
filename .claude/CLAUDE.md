---
title: Project Guidelines
description: Development guidelines and conventions for the @metreeca/blue package.
---

# References

## Standards

- [SHACL](https://www.w3.org/TR/shacl/) - Shapes Constraint Language

## Dependencies

- [Core](https://metreeca.github.io/core/) - Essential TypeScript abstractions
- [Qest](https://metreeca.github.io/qest/) - Linked data models

# NPM Scripts

- **`npm run clean`** - Remove build artifacts and dependencies (dist, docs, node_modules)
- **`npm run setup`** - Install dependencies and apply security fixes
- **`npm run build`** - Build TypeScript and generate TypeDoc documentation
- **`npm run check`** - Run Vitest test suite
- **`npm run watch`** - Watch and recompile TypeScript on changes
- **`npm run proof`** - Start TypeDoc watch mode and documentation server

# Data Model

**CRITICAL: Retrieval models contain only bindings.** Plain property keys like `{ name }` are shorthands for
`{ name=name }` and are handled by `decodeProbe()` with no need for dedicated processing. All model entries — whether
explicit bindings like `"alias=year:released"` or implicit ones like `"name"` — are uniformly processed through
`decodeProbe()` and `apply()`.
