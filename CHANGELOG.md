# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unpublished](https://github.com/metreeca/blue/compare/v0.9.1...HEAD)

### Removed

- Remove `Binding` from `ResourceShape.properties` and `Entries` key types — resource shape property keys are now
  `Identifier` only; bindings belong exclusively to model projections
- Remove `Projection` type utility — no longer needed without binding keys in entries
- Remove `temporal()` factory — temporal shapes are identified by their model values
- Remove `_transform()` model-based transform pipe validator
- Remove `validate()` query mode (`mode: "query"`) — queries are now validated as nested collection components within
  model validation, no longer requiring a separate entry point

### Changed

- Widen `validate()` model overload type parameter from `T extends Model` to `T extends Value`, accepting any value
  shape for projection validation
- Rename `validate()` default mode from `"value"` to `"state"` aligning with qest resource state terminology
- Replace `_transform()` with `apply(probe, shape)` accepting a `Probe` and any `ValueShape`, resolving property
  paths through resource shapes and returning a `Range` that preserves the target property's cardinality
  (`minCount`/`maxCount`) alongside the resolved output shape; `ReferenceShape` inputs are materialised and traversed
  as resource shapes; other leaf shapes return `undefined` for non-empty paths; aggregate transforms collapse
  cardinality to `maxCount: 1`; returns `undefined` instead of a trace relay when resolution fails
- Widen `Trace` record keys from `Identifier | Tag | TagRange` to `string` to support operator-prefixed query keys
- Rename `LocalConstraints.model` type from `LocalModel` to `Locale` and `LocalsConstraints.model` from `LocalsModel`
  to `Locales`, following upstream `@metreeca/qest` renames

### Fixed

- Validate transform binding keys in model validation, type-checking projection values against the post-transform output
  type, including recursive validation of embedded resource models
- Report query probe and binding validation errors keyed by the offending query key
- Accept references wherever a resource shape is expected in model validation, including inline resource properties and
  binding projections; thread nesting depth through binding and pipe validation
- Accept string-to-string transform pipes on `Local`/`Locals` shapes, preserving the input shape; reject transforms
  that would change the output type
- Enforce string type validation on `id`/`type` template values in model validation
- Require all union variants to be compatible when resolving transform pipes and traversing property paths in
  `apply()`; previously, the first matching variant was accepted
- Accept model bindings with unresolvable probes leniently; when `apply()` returns `undefined` (unknown property,
  domain violation, invalid pipe composition), the template value is accepted without validation since no result will
  ever be generated at runtime

## [0.9.1](https://github.com/metreeca/blue/releases/tag/v0.9.1)

Initial release.
