# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unpublished](https://github.com/metreeca/blue/compare/v0.9.1...HEAD)

### Added

- Add `tag()` to associate entries with a shape for a given scope (`value`, `model`, `entry`) and to retrieve previously
	associated shapes; replaces `certify()`
- Add `Validator<T>` type for custom value validators returning `undefined | true | Trace`
- Validate constraint operator semantics against property value types in model validation — range, text search,
	disjunctive/conjunctive, focus, sort, and pagination operators are checked against the effective shape computed by
	`apply()`, including recursive validation against union variant types
- Add `classes` constraint on `ResourceShape` for accumulating parent class IRIs across inheritance

### Fixed

- Reject duplicate `Id` and `Type` entries across the full inheritance chain in resource shape factories — previously
	only local entries were checked; inherited duplicates are now detected via lineage traversal
- Enforce class-level constraints (`pattern`, `in`, `hasValue`) conjunctively across the inheritance chain in resource
	validation — child shapes can only restrict, never bypass, inherited constraints
- Reject IRI strings for embedded `ResourceShape` properties in model validation — only nested models are accepted; IRI
	references are exclusive to `ReferenceShape` properties

### Changed

- Replace `Some<Lazy<ResourceShape>>` with inline non-empty tuple for `ResourceConstraints.extends`
- Shape factories now validate constraint consistency on construction via check functions — contradictory constraints
	(e.g. `minLength > maxLength`, `hasValue` entries outside `in` set) are rejected with `RangeError`
- Standardize all trace messages — wrap scalar parameters in `<>` and list parameters in `[]`, start checker messages
	with adjectives, include offending values in checker diagnostics
- Replace internal `walk` with `flatten` for validation and probe resolution
- Always key per-resource validation traces by `@id` or blank node in `validateResource`, removing the flat-trace
	special case for single-resource arrays
- Redesign `Trace` type as a recursive `string | { readonly [key: string]: Trace }` union, replacing the mixed-array
	representation with keyed reports at every level (collection, resource, property, constraint)
- Redesign `validate()` to accept a single options object with `scope` (`value` | `model`), `shape`, and optional
	`depth`; `value` scope enforces full constraints on resources, `model` scope validates projection models

### Removed

- Replace `url()` and `uri()` string shape factories with `iri()` accepting a `variant` parameter (`hierarchical`,
	`absolute`, `internal`, `relative`) aligned with `@metreeca/core` `Variant` type; defaults to `relative`
- Remove `is*Shape` and `is*Constraints` type guard exports from all shape modules — structural validation is now
	integrated into the functional validators (`validateResource`, `validateModel`, etc.) and produces path-specific
	traces instead of boolean results
- Remove runtime `assert()` validation from shape factory arguments and return values — factories now trust TypeScript
	types; structural mismatches are caught by the validation pipeline
- Remove `Binding` from `ResourceShape.properties` and `Entries` key types — resource shape property keys are now
	`Identifier` only; bindings belong exclusively to model projections
- Remove `Projection` type utility — no longer needed without binding keys in entries
- Remove `temporal()` factory — temporal shapes are identified by their model values
- Remove `_transform()` model-based transform pipe validator
- Remove `validate()` query mode (`mode: "query"`) — queries are now validated as nested collection components within
	model validation, no longer requiring a separate entry point
- Replace `_transform()` with `apply(probe, shape)` accepting a `Probe` and any `ValueShape`, resolving property paths
	through resource shapes and returning a `Range` that preserves the target property's cardinality
	(`minCount`/`maxCount`) alongside the resolved output shape; `ReferenceShape` inputs are materialised and traversed as
	resource shapes; other leaf shapes return `undefined` for non-empty paths; aggregate transforms collapse cardinality
	to `maxCount: 1`; returns `undefined` instead of a trace relay when resolution fails
- Widen `Trace` record keys from `Identifier | Tag | TagRange` to `string` to support operator-prefixed query keys
- Rename `LocalConstraints.model` type from `LocalModel` to `Locale` and `LocalsConstraints.model` from `LocalsModel`
	to `Locales`, following upstream `@metreeca/qest` renames

### Fixed

- Validate transform binding keys in model validation, type-checking projection values against the post-transform output
	type, including recursive validation of embedded resource models
- Report query probe and binding validation errors keyed by the offending query key
- Accept references wherever a resource shape is expected in model validation, including inline resource properties and
	binding projections; thread nesting depth through binding and pipe validation
- Accept string-to-string transform pipes on `Local`/`Locals` shapes, preserving the input shape; reject transforms that
	would change the output type
- Enforce string type validation on `id`/`type` template values in model validation
- Require all union variants to be compatible when resolving transform pipes and traversing property paths in
	`apply()`; previously, the first matching variant was accepted
- Accept model bindings with unresolvable probes leniently; when `apply()` returns `undefined` (unknown property, domain
	violation, invalid pipe composition), the template value is accepted without validation since no result will ever be
	generated at runtime

## [0.9.1](https://github.com/metreeca/blue/releases/tag/v0.9.1)

Initial release.
