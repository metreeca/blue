---
title: Project Guidelines
description: Development guidelines and conventions for the @metreeca/blue package.
---

> [!CAUTION]
> Activating and following skill guidance is **MANDATORY** for every task. Before starting any work, identify and
> activate all relevant skills. Skill instructions are binding and override default behaviours. When in doubt about
> whether skill guidance is current, relevant skills MUST be reloaded.

# References

## Standards

- [SHACL](https://www.w3.org/TR/shacl/) - Shapes Constraint Language

## Dependencies

- [@metreeca/core](https://github.com/metreeca/core) - Core utilities and shared types
- [@metreeca/qest](https://github.com/metreeca/qest) - Linked data models and query languages

# NPM Scripts

- **`npm run clean`** - Remove build artifacts and dependencies (dist, docs, node_modules)
- **`npm run setup`** - Install dependencies
- **`npm run build`** - Build TypeScript and generate TypeDoc documentation
- **`npm run check`** - Run Vitest test suite
- **`npm run watch`** - Watch and recompile TypeScript on changes
- **`npm run proof`** - Start TypeDoc watch mode and documentation server

# Data Model

**CRITICAL: `Template` keys are property identifiers, never bindings.** A `Template` (`{ [Identifier]: Placeholders }`)
retrieves a resource: its keys are plain property names, validated against `shape.properties` by `validateResult`.
Projection bindings (`"alias=year:released"`) key a `Projection`, and selection operators (`"<price"`, `"#"`) key a
`Selection`; both appear only inside a collection `Query` and are decoded through `decodeProbe()` / `effective()` by
`validateTemplate`, not by `validateResult`.
