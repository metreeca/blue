# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unpublished](https://github.com/metreeca/blue/compare/v0.9.1...HEAD)

### Added

- Add `audit()` to check whether a value or model was previously validated and retrieve the associated shape; accepts a
	required `scope` parameter (`"value"`, `"entry"`, `"model"`, or `"*"` wildcard matching both `"value"` and `"entry"`)
- Add `validate()` entry scope overload for id-only validation — checks only the `id` property against the shape's
	`pattern`, `in`, and `hasValue` constraints; all other properties are ignored
- Add `Validator<T>` type for custom value validators returning `undefined | true | Trace`
- Validate constraint operator semantics against property value types in model validation — range, text search,
	disjunctive/conjunctive, focus, sort, and pagination operators are checked against the effective shape computed by
	`apply()`, including recursive validation against union variant types
- Add `classes` constraint on `ResourceShape` for accumulating parent class IRIs across inheritance
- Add `stats` option to `validate()` model scope for controlling whether aggregate transforms (count, sum, min, max,
	avg) are accepted in client-defined models — defaults to `false` for safe-by-default protection against complexity
	attacks
- Add `url()` string factory as a convenience alias for `iri({ variant: "hierarchical" })`
- Add `const` type parameters to `local()`, `number()`, and `string()` constraint overloads — non-empty array
	constraints (`in`, `hasValue`, `languageIn`) are now inferred as tuples without explicit casts
- Add `identify(resource, shape)` to retrieve the resource identifier as an absolute IRI given the associated
	`ResourceShape`; returns `undefined` if the shape declares no `id` property, the resource doesn't include one, or the
	value is not a well-formed absolute IRI
- Add `classify(resource, shape)` to retrieve the resource type as an absolute IRI given the associated `ResourceShape`;
	returns `undefined` if the shape declares no `type` property, the resource doesn't include one, or the value is not a
	well-formed absolute IRI
- Add `resource()` overload accepting `Lazy<T>` — validates, materializes, and deeply flattens manual shape definitions
	with memoized caching; all public API `ResourceShape` parameters are resolved through this factory
- Add `Eager<S>` type alias for the materialized result of a lazy shape
- Move `Infer<S>` type to `resource.ts` and widen constraint to `Lazy<ValueShape> | UnionShape`
- Detect circular `extends` chains in `materialize()` — throws `TraceError` with `{ <factory>: "circular dependency" }`
	keyed by the factory function name

### Fixed

- Accept `locals` array shorthand on scalar cardinality properties in both constraint and value scope validation —
	previously `validateRange` rejected any array when `maxCount === 1`, blocking the `["v"]` shorthand for `{ und: ["v"] }`
- Unwrap indexed union containers in value scope validation — previously `validateUnion` passed the whole
	`{ variantKey: innerValue }` object to each variant without unwrapping, rejecting valid indexed container format
	documented for union properties; reference variants are now dereferenced through their target resource shape
- Allow child local/locals shapes to override the parent model during merge — previously required strict deep equality,
	blocking template labels like `local("{posted} / {author}")` in extending shapes
- Inherit `forward`/`reverse` metadata when overriding inherited properties with naked Range — previously lost during
	normalization and merge, causing `RangeError` on closed namespaces
- Reject duplicate `Id` and `Type` entries across the full inheritance chain in resource shape factories — previously
	only local entries were checked; inherited duplicates are now detected via lineage traversal
- Enforce class-level constraints (`pattern`, `in`, `hasValue`) conjunctively across the inheritance chain in resource
	validation — child shapes can only restrict, never bypass, inherited constraints
- Reject IRI strings for embedded `ResourceShape` properties in model validation — only nested models are accepted; IRI
	references are exclusive to `ReferenceShape` properties
- Support `UnionShape` as non-lazy shape in cardinality type constraints
- Propagate `stats` option through recursive `validateModel` calls — previously lost on nested resource shapes

### Changed

- Add `TraceError` class extending `RangeError` with a typed `cause: Trace` and pretty-printed trace in the error
	message — replaces `Object.assign(new RangeError(…), { trace })` for visible diagnostics in stack traces
- Rename `ReferenceShape.backlink` property and `backlink()` factory to `foreign` for clarity
- Rename `Union` type to `UnionShape` for naming consistency with other shape types
- Move probe resolution from `core/probe` into the main index module as `apply(probe, shape)` — swapped argument order
	for consistency with probe-first pipeline usage
- Internalize `materialize()` behind a caching layer — no longer exported; lazy shapes are resolved and flattened
	through `resource()`
- Extract internal operators (`brand`, `trace`) to `core/` submodules and use `import type` for index re-exports
- Replace `Some<Lazy<ResourceShape>>` with inline non-empty tuple for `ResourceConstraints.extends`
- Shape factories now validate constraint consistency on construction via check functions — contradictory constraints
	(e.g. `minLength > maxLength`, `hasValue` entries outside `in` set) are rejected with `TraceError`
- Standardize all trace messages — wrap scalar parameters in `<>` and list parameters in `[]`, start checker messages
	with adjectives, include offending values in checker diagnostics
- Parameterise `Property<P, R>` and `PropertyConstraints<P>` with a `Predicate` type parameter distinguishing unresolved
	namespace predicates from resolved IRI references; export `Predicate` type for consumer use
- Replace internal `walk` with `flatten` for validation and probe resolution
- Always key per-resource validation traces by `@id` or blank node in `validateResource`, removing the flat-trace
	special case for single-resource arrays
- Redesign `Trace` type as a recursive `string | { readonly [key: string]: Trace }` union, replacing the mixed-array
	representation with keyed reports at every level (collection, resource, property, constraint)
- Redesign `validate()` to accept a single options object with `scope` (`value` | `entry` | `model`), `shape`, and
	optional `depth`; `value` scope enforces full constraints on resources, `entry` scope validates identity only, `model`
	scope validates projection models; relay result key matches the scope name (`value`, `entry`, or `model`)

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
- Remove `tag()` — replaced by `audit()` for shape retrieval and `validate()` with `entry` scope for identity
	association

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
