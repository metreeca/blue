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

- **`npm run clean`** - Remove dependencies and build artefacts
- **`npm run prime`** - Install dependencies from the lockfile
- **`npm run setup`** - Configure for local development
- **`npm run build`** - Compile sources and generate docs
- **`npm run check`** - Run the test suite
- **`npm run proof`** - Serve live docs

# Data Model

**CRITICAL: `Template` keys are property identifiers, never bindings.** A `Template` (`{ [Identifier]: Placeholders }`)
retrieves a resource: its keys are plain property names, validated against `shape.members` by `validateResult`.
Projection bindings (`"alias=year:released"`) key a `Projection`, and selection operators (`"<price"`, `"#"`) key a
`Selection`; both appear only inside a collection `Query` and are decoded through `decodeProbe()` / `effective()` by
`validateTemplate`, not by `validateResult`.

**Three validation regimes.** Union matching (a non-union is a degenerate single-variant union) runs in three regimes,
mirroring qest §3.1/§5.2/§5.4 and named by the `Scope` type (`state | bound | model`):

- **state** (`sh:xone`) — a data value (a resource instance on ingress; a selection **option**, keyed by the `?`, `!`,
  or sort-focus `+` operators) MUST match **exactly one** variant against **all** constraints. It is a legal value
  fixing the branch that drives storage; no match is unsatisfiable, several is ambiguous, both rejected.
- **bound** (`sh:xone`, relaxed) — a relational **bound** (`<`, `>`, `<=`, `>=`) MUST match **exactly one** variant but
  need not be a legal element value: it skips the value-domain magnitude constraints and keys on the syntactic
  discriminators (`kind`, and `pattern` for literals) alone, so it requires the union's literal branches to be
  **literally disjoint**.
- **model** (`sh:or`) — a retrieval placeholder MUST match **at least one** variant by **JSON type alone**, ignoring
  every other constraint. Its value is immaterial and need not be legal; it may match several (retrieving each) and is
  rejected only when it matches none.

A `~` text search is neither regime: a plain search string applied to every string branch at once. See `src/union.md`
for the design rationale.
