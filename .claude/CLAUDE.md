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
- **`npm run setup`** - Install dependencies and link sibling `@metreeca/*` repositories
- **`npm run build`** - Compile sources and generate docs
- **`npm run check`** - Run the test suite
- **`npm run proof`** - Serve live docs

> [!CAUTION]
> **`prime` and `setup` are not interchangeable.** Run `prime` when finalising a public release: `@metreeca/*` imports
> resolve to the published releases recorded in the lockfile. Run `setup` for local development against unpublished
> sibling branches: imports resolve to the working copies in the neighbouring repositories.

# Data Model

**CRITICAL: `Template` keys are property identifiers, never bindings.** A `Template` (`{ [Identifier]: Placeholder }`)
retrieves a resource: its keys are plain property names, validated against `shape.members` by `validateResult`.
Projection bindings (`"alias=year:released"`) key a `Projection`, and constraint operators (`"<price"`, `"#"`) key a
`Criteria`; both appear only where the entry reaches a collection, merged into it through `Query`, and are decoded
through `decodeProbe()` / `effective()` by `validateTemplate`, not by `validateResult`.

**Every leaf is `{}`.** A placeholder carries no value of its own: the `Atomic` leaf asks for the value as it stands,
a nested `Template` for the resource behind a link, a `Locale` map of tag ranges for localised text tag by tag, and a
branch map for one alternative of a union at a time. Cardinality is not stated by the notation either: a collection is
the entry naming it, carrying its `Criteria` keys alongside the keys retrieving its values.

**Three validation regimes.** Union matching (a non-union is a degenerate single-variant union) runs in three regimes,
mirroring qest §3.1/§5.2/§5.4 and named by the `Scope` type (`state | bound | model`):

- **state** (`sh:xone`) — a data value (a resource instance on ingress) MUST match **exactly one** variant against
  **all** constraints. It is a legal value fixing the branch that drives storage; no match is unsatisfiable, several is
  ambiguous, both rejected.
- **bound** (`sh:xone`, relaxed) — a relational **bound** (`<`, `>`, `<=`, `>=`) MUST match **exactly one** variant but
  need not be a legal element value: it skips the value-domain magnitude constraints and keys on the syntactic
  discriminators (`kind`, and `pattern` for literals) alone, so it requires the union's literal branches to be
  **literally disjoint**. A constraint **option**, keyed by the `?`, `!`, or sort-focus `+` operators, is matched by
  equality rather than by order and is relaxed further still: it keys on `kind` alone, `pattern` included among what it
  relaxes, so it requires the variants to be **kind-disjoint**. A localised variant takes its options as strings, stated
  plainly or grouped in a tag-keyed map, at whatever arity the filter lists.
- **model** (`sh:or`) — a retrieval placeholder MUST match **at least one** variant by **form alone**, ignoring every
  constraint: the `Atomic` leaf reaches every variant coming back as a value (an embedded resource, naming no
  identifier, excepted), a nested `Template` the variants naming a resource, a `Locale` map the localised ones. It
  carries no value to discriminate with, so it may match several (retrieving each) and is rejected only when it matches
  none. A localised variant takes its tag ranges within a projection column alone, coming back coalesced elsewhere.

A `~` text search is neither regime: a plain search string applied to every string branch at once. See
`src/union/index.md` for the design rationale.
