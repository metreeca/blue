# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unpublished](https://github.com/metreeca/blue/compare/v0.9.1...HEAD)

### Added

- Add `Validator<T>` type for custom value validators returning `undefined | true | Trace`
- Add `validate()` overloaded function — resource validation with `{ shape }` and template validation with
	`{ fetch: true, shape }`; returns a `Relay` resolving to `{ value }` on success or `{ trace }` on failure;
	idempotent on a specific shape, skipping re-validation when the same shape and compatible options are presented again
- Add `plain` option to template validation for rejecting aggregate transforms (count, sum, min, max, avg); defaults
	to `false`
- Add `entry` option to resource validation for matching the resource's `id` entry against an expected reference;
	ignored when the resource has no `id` entry; idempotency sealing accounts for the entry value
- Add `depth` option to template validation for limiting nested reference and resource expansion and property path
	length in queries; `0` rejects nested templates while still accepting IRI references; defaults to unlimited
- Add `limit` option to template validation for capping the `#` pagination constraint in queries; if a query specifies
	`#` exceeding this value, the query is rejected; if the query omits `#`, the limit value is injected as a default;
	defaults to unlimited
- Add `reference` module with `ReferenceShape` interface, `ReferenceConstraints` interface, and `reference()` factory
  accepting optional constraints (`foreign`, `captive`)
- Add `value` module with composite shapes (`SetShape`, `UnionShape`), cardinality factories (`required`, `optional`,
	`repeatable`, `multiple`, `cardinality`), `union()` factory, `apply()` probe resolver, and type utilities (`Infer`,
	`Eager`, `Declared`, `Cardinality`, `Variants`)
- Add `TraceError` class extending `RangeError` with a typed `cause: Trace` and pretty-printed trace in the error
	message
- Add `classes` constraint on `ResourceShape` for accumulating parent class IRIs across inheritance
- Add `url()` string factory as a convenience alias for `iri({ variant: "hierarchical" })`
- Add `const` type parameters to `localised()`, `number()`, and `string()` constraint overloads — non-empty array
	constraints (`in`, `hasValue`, `languageIn`) are now inferred as tuples without explicit casts
- Add `resource()` overload accepting `Lazy<T>` — validates, materialises, and deeply flattens manual shape definitions
	with memoised caching
- Add `model` field to `SetShape` — holds the runtime prototype value, computed from the shape model and cardinality
- Reject `id`/`type` entries in embedded resource shapes

### Changed

- **Breaking:** Redesign `validate()` as an overloaded function discriminated by `fetch` option — resource validation
	(`fetch` omitted or `false`) enforces all constraints; template validation (`fetch: true`) enforces structural
	constraints only; replaces the former scope-based API and the separate `sealResource()`/`sealTemplate()` functions
- **Breaking:** Make `id` property optional in resource validation
- **Breaking:** Make template validation lenient by default — aggregate transforms and unlimited nesting depth are
	accepted unless restricted via `plain` and `depth` options
- **Breaking:** Restrict nested scalar references to template recursion only
- **Breaking:** Restrict top-level query keys to plain identifiers — computed values, filtering constraints, sorting
	criteria, and pagination limits are now only permitted inside singleton template tuples for collection properties
- **Breaking:** Rename `ValuesShape` to `SetShape` and change `kind` discriminator from `"values"` to `"set"` (Closes
	#17)
- **Breaking:** Split `ValueShape` into `ValueShape` (scalar-or-set shapes) and `ValuesShape` (all concrete value
	shapes including `LocalisedShape`)
- **Breaking:** Unify `local()`/`locals()` into single `localised()` factory — cardinality of the enclosing `SetShape`
	determines whether each tag holds a scalar or an array; `minCount`/`maxCount` apply per tag (Closes #16)
- **Breaking:** Multi-valued union properties now represent values as a single indexed record with per-variant arrays
	instead of an array of single-variant containers
- **Breaking:** Union property values must always be indexed objects — bare scalar values are no longer accepted
- **Breaking:** Reject `foreign` reference properties during resource validation — foreign links are managed by the
	target resource and are not part of the source resource state; mixed unions exclude foreign variants from validation
- **Breaking:** Enforce inherited semantics for non-overridable fields — `foreign`, `captive`, and `shape` in
	`mergeReference()`; `name`, `description`, `forward`, and `reverse` in `mergeProperty()` are now inherited from the
	parent and redefinition by the child is rejected
- Detect conflicting localised `model` across parents in `checkParents()` — reports an error when multiple parents
	define different models and the child does not override
- Rename `ReferenceShape.backlink` property and `backlink()` factory to `foreign` for clarity
- Rename `Union` type to `UnionShape` for naming consistency with other shape types
- Redesign `Trace` type as a recursive `string | { readonly [key: string]: Trace }` union, replacing the mixed-array
	representation with keyed reports at every level
- Shape factories now validate constraint consistency on construction — contradictory constraints are rejected with
	`TraceError`
- Detect circular `extends` chains — throws `TraceError` keyed by the factory function name
- Parameterise `Property<P, R>` and `PropertyConstraints<P>` with a `Predicate` type parameter; export `Predicate` type

### Removed

- Remove `sealResource()` and `sealTemplate()` — replaced by overloaded `validate()`
- Remove `audit()`, `identify()`, and `classify()` functions
- Remove `validate()` entry scope
- Remove `validate()` query mode — queries are now validated as nested components within template validation
- Remove `tag()` — replaced by seal-based idempotency in `validate()`
- Remove `local()` and `locals()` factories, `LocalShape`, `LocalsShape`, and related types — replaced by unified
	`localised()` factory
- Replace `url()` and `uri()` string factories with `iri()` accepting a `variant` parameter
- Remove `Binding` from `ResourceShape.properties` and `Entries` key types; remove `Projection` type utility
- Remove `temporal()` factory — temporal shapes are identified by their model values

### Fixed

- Accept local/locals shorthand values in cardinality counting
- Accept `locals` array shorthand on scalar cardinality properties
- Unwrap indexed union containers in value scope validation — reference variants are dereferenced through their target
	resource shape
- Allow child local/locals shapes to override the parent model during merge
- Inherit `forward`/`reverse` metadata when overriding inherited properties
- Reject duplicate `Id` and `Type` entries across the full inheritance chain in resource shape factories
- Enforce class-level constraints conjunctively across the inheritance chain in resource validation
- Reject IRI strings for embedded `ResourceShape` properties — only nested models are accepted
- Enforce string type validation on `id`/`type` template values

## [0.9.1](https://github.com/metreeca/blue/releases/tag/v0.9.1)

Initial release.
