/*
 * Copyright © 2025-2026 Metreeca srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Linked data validation API.
 *
 * Provides a type-safe DSL for defining resource shapes with validation constraints based on the
 * {@link https://www.w3.org/TR/shacl/ | Shapes Constraint Language} (SHACL). Shapes define both the expected
 * structure and validation rules for resources, enabling compile-time type inference and runtime validation.
 *
 * **Shape Types**
 *
 * {@link ValueShape} is a discriminated union of all concrete shape types:
 *
 * - {@link BooleanShape} - Booleans
 * - {@link NumberShape} - Numbers
 * - {@link StringShape} - Strings
 * - {@link LocalisedShape} - Language-tagged maps (scalar or array per tag, determined by cardinality)
 * - {@link ReferenceShape} - Resource IRI references
 * - {@link ResourceShape} - Resources
 *
 * Composite shapes:
 *
 * - {@link ValuesShape} - Value set shape with cardinality constraints
 * - {@link UnionShape} - Discriminated type alternatives for polymorphic values
 *
 * <img src="index.svg" alt="Shape type hierarchy" style="width: 100%" />
 *
 * **Defining Shapes**
 *
 * Define resource shapes with property constraints and value ranges:
 *
 * ```typescript
 * import { required, optional, repeatable } from '@metreeca/blue';
 * import { boolean } from '@metreeca/blue/boolean';
 * import { integer } from '@metreeca/blue/number';
 * import { string, date } from '@metreeca/blue/string';
 * import { resource, id } from '@metreeca/blue/resource';
 *
 * const Product = resource({
 *   id: id(),
 *   name: required(string({ minLength: 1, maxLength: 100 })),
 *   price: required(integer({ minInclusive: 0 })),
 *   available: optional(boolean()),
 *   tags: repeatable(string()),
 *   releaseDate: optional(date())
 * });
 * ```
 *
 * **Validating Values**
 *
 * Validate values against shapes using pattern matching on the {@link Relay} result:
 *
 * ```typescript
 * import { validate } from '@metreeca/blue';
 *
 * validate(data, { scope: "state", shape: Product })({
 *   value: product => console.log(product.name),
 *   error: trace => console.error(trace)
 * });
 * ```
 *
 * **Validating Entries**
 *
 * Validate only the `id` property of a value against a shape's identity constraints:
 *
 * ```typescript
 * validate(data, { scope: "entry", shape: Product });
 * ```
 *
 * **Validating Models**
 *
 * > [!WARNING]
 * > Query validation is safe against complexity attacks by default: aggregate transforms and nested model expansion
 * > are disabled. Enable `stats` and/or `depth` explicitly only when the additional complexity is required.
 *
 * Validate projection models specifying which properties to retrieve from a resource:
 *
 * ```typescript
 * validate(data, { scope: "model", shape: Product });
 * validate(data, { scope: "model", shape: Product, stats: true });
 * validate(data, { scope: "model", shape: Product, depth: 2 });
 * ```
 *
 * **Auditing Validated Data**
 *
 * Use {@link audit} to check whether a value or model was previously validated by {@link validate} and retrieve the
 * associated shape:
 *
 * ```typescript
 * audit(validated, { scope: "state" }); // associated shape or undefined
 * audit(validated, { scope: "*" }); // matches both state and entry scopes
 * ```
 *
 * **Effective Shape Resolution**
 *
 * Use {@link apply} to resolve the effective shape after applying a probe to a value shape, resolving property paths
 * through nested resources and deriving the effective type through each transform pipe stage.
 *
 * @module index
 *
 * @see {@link https://www.w3.org/TR/shacl/ | SHACL - Shapes Constraint Language}
 */

import { type Identifier, type Lazy } from "@metreeca/core";
import { immutable } from "@metreeca/core/deep";
import { createRelay, type Relay } from "@metreeca/core/relay";
import { message } from "@metreeca/core/report";
import type { Query } from "@metreeca/qest/model";
import type { Resource, Value } from "@metreeca/qest/state";
import { type Reference }from "@metreeca/qest"
import type { BooleanShape } from "./boolean.js";
import { brand, branded } from "./core/brand.js";
import { materialize } from "./core/cache.js";
import { apply } from "./core/probe.js";
import { TraceError } from "./core/trace.js";
import { validateValue } from "./index.core.js";
import type { LocalisedShape } from "./localised.js";
import type { NumberShape } from "./number.js";
import { validateEntry, validateQuery, validateResource } from "./resource.core.js";
import type { ReferenceShape, ResourceShape } from "./resource.js";
import type { StringShape } from "./string.js";

export { apply, TraceError };


/**
 * Symbol key for storing the validation scope on branded resources.
 */
const ValidationScope: unique symbol = Symbol("ValidationScope");

/**
 * Symbol key for storing the associated shape on branded resources.
 */
const ValidationShape: unique symbol = Symbol("ValidationShape");


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Discriminated union of all concrete shape types.
 *
 * Each member carries its own `kind` discriminator and `model` type, enabling runtime type narrowing and
 * compile-time type inference without a shared base interface.
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes | SHACL § 2.3.1 Node Shapes}
 */
export type ValueShape =
	| BooleanShape
	| NumberShape
	| StringShape
	| LocalisedShape
	| ReferenceShape
	| ResourceShape;

/**
 * Shape for a set of values with cardinality constraints.
 *
 * Combines a {@link ValueShape} or {@link UnionShape} with minimum and maximum count constraints to define
 * the expected size of the value set.
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link resource!ResourceConstraints.extends | extends}, each
 * value set shape is merged according to the following rules.
 *
 * | Field      | Override Rule                                                                     |
 * | ---------- | ------------------------------------------------------------------------------- |
 * | `kind`     | Cannot be overridden                                                              |
 * | `minCount` | Child ≥ parent, narrowing the minimum cardinality                                |
 * | `maxCount` | Child ≤ parent, narrowing the maximum cardinality                                |
 * | `shape`    | `kind` must match; delegated to value shape or {@link UnionShape} merge rules    |
 *
 * **Cross-Field Validation**
 *
 * - merged `minCount` must be ≤ merged `maxCount`
 *
 * @typeParam T The value type
 * @typeParam L The minimum count constraint type
 * @typeParam U The maximum count constraint type
 *
 * @see {@link https://www.w3.org/TR/shacl/#MinCountConstraintComponent SHACL § 4.1.1 sh:minCount}
 * @see {@link https://www.w3.org/TR/shacl/#MaxCountConstraintComponent SHACL § 4.1.2 sh:maxCount}
 */
export type ValuesShape<
	T = unknown,
	L extends undefined | number = undefined | number,
	U extends undefined | number = undefined | number,
	S extends Lazy<ValueShape | UnionShape> = Lazy<ValueShape | UnionShape>
> = {

	/**
	 * Discriminator identifying this as a value set shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "values";

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * Scalar value sets hold the shape model directly; multi-valued sets hold an array or, for union shapes,
	 * a {@link Variants} record with per-key arrays. {@link LocalisedShape | Localised} shapes always hold
	 * a single language map because cardinality applies per tag within the map, not to the map itself.
	 *
	 * **Inheritance** — computed from shape and cardinality, not user-defined.
	 */
	readonly model: S extends UnionShape ? Variants<T, U>
		: S extends Lazy<LocalisedShape> ? (U extends 1
				? string | { readonly [tag: string]: string }
				: readonly string[] | { readonly [tag: string]: readonly string[] })
			: U extends 1 ? T
				: readonly T[];


	/**
	 * Minimum number of expected values.
	 *
	 * **Inheritance** — child value must be ≥ parent value, narrowing the minimum cardinality.
	 *
	 * @defaultValue `undefined` (no minimum constraint, equivalent to 0)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinCountConstraintComponent SHACL § 4.1.1 sh:minCount}
	 */
	readonly minCount?: L;

	/**
	 * Maximum number of expected values.
	 *
	 * **Inheritance** — child value must be ≤ parent value, narrowing the maximum cardinality.
	 *
	 * @defaultValue `undefined` (no maximum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxCountConstraintComponent SHACL § 4.1.2 sh:maxCount}
	 */
	readonly maxCount?: U;


	/**
	 * The constrained value shape, or a union of value shapes for polymorphic values.
	 *
	 * **Inheritance** — `kind` must match; delegated to value shape or {@link UnionShape} merge rules.
	 */
	readonly shape: (ValueShape | UnionShape) & { readonly model: T };

}

/**
 * Discriminated type alternatives for polymorphic values.
 *
 * Values for unions are represented as {@link @metreeca/qest!Indexed | Indexed} records mapping variant identifiers to
 * values. In JSON-LD, this maps to an indexed container (`@container: @index`), where variant keys serve as type
 * discriminators.
 *
 * > [!NOTE]
 * > Indexed containers are designed exactly to provide JSON structure without affecting JSON-LD graph semantics,
 * > making unions unambiguous and manageable while preserving interoperability with linked data systems.
 *
 * **Cardinality**
 *
 * The expected cardinality of the polymorphic value set constrains how many variant entries may be present and the
 * form of the expected value; for example, given `union({ text: string(), postal: reference(PostalAddress) })`:
 *
 * | Cardinality  | Query Type                                                                          |
 * | ------------ | ----------------------------------------------------------------------------------- |
 * | scalar       | `{ text?: string, postal?: Reference }` — exactly one entry, holding a scalar value   |
 * | multi-valued | `{ text?: string[], postal?: Reference[] }` — one or more entries, each holding an array |
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link resource!ResourceConstraints.extends | extends}, union-typed
 * properties are merged according to the following rules.
 *
 * | Field      | Override Rule                                                                   |
 * | ---------- | ------------------------------------------------------------------------------ |
 * | `kind`     | Cannot be overridden                                                           |
 * | `model`    | Computed from variants, not user-defined                                       |
 * | `variants` | Variant keys must match parent's; each variant delegated to value shape merge  |
 *
 * Adding or removing variant keys changes the discriminated union structure and is always rejected. Within each
 * matched variant, the corresponding value shape merge rules apply.
 *
 * @typeParam V The variants record type mapping names to value shapes
 *
 * @see {@link https://www.w3.org/TR/shacl/#OrConstraintComponent SHACL § 4.7.2 sh:or}
 * @see {@link https://www.w3.org/TR/json-ld11/#data-indexing JSON-LD 1.1 § 4.6.1 Data Indexing}
 */
export type UnionShape<V extends {

	readonly [variant: Identifier]: ValueShape

} = {

	readonly [variant: Identifier]: ValueShape

}> = {

	/**
	 * Discriminator identifying this as a union.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "union";

	/**
	 * Scalar prototype value for runtime model assembly.
	 *
	 * An indexed record mapping variant keys to their model types. Each variant key is individually optional.
	 * For scalar cardinality, this is the model directly. For multi-valued cardinality, each variant value is
	 * wrapped in an array.
	 *
	 * **Inheritance** — computed from variants, not user-defined.
	 */
	readonly model: { readonly [K in keyof Declared<V>]?: V[K] extends ValueShape ? V[K]["model"] : never };


	/**
	 * Named value shape variants.
	 *
	 * Each key serves as a type discriminator for polymorphic property values.
	 *
	 * **Inheritance** — variant keys must match parent's; each variant delegated to value shape merge rules.
	 */
	readonly variants: V;

}


/**
 * Validation trace.
 *
 * Represents the result of validating a resource against a shape as a recursive union of violation messages and keyed
 * reports. An `undefined` trace signals successful validation; a non-empty trace is always a failure.
 *
 * Key semantics shift by nesting depth:
 *
 * - **Collection level**: resource identifier values
 * - **Resource level**: property keys (`name`, `type`, …)
 * - **Property level**: SHACL-derived constraint names (`minLength`, `pattern`, `in`, …)
 * - **Leaf level**: human-readable error message
 *
 * @see {@link https://www.w3.org/TR/shacl/#validation-report | SHACL § 3.6 Validation Report}
 */
export type Trace =
	| string
	| { readonly [key: string]: Trace }

/**
 * Value validator.
 *
 * A function that examines a value and returns a {@link Trace} describing any constraint violations:
 *
 * - `undefined` or `true` signals successful validation with no issues
 * - A trace describes constraint failures as a keyed report or violation message
 *
 * @typeParam T The value type being validated
 */
export type Validator<T = unknown> =
	(value: T) => undefined | true | Trace;


//// Type Inference ////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Extracts the model type from a {@link Lazy} shape or {@link UnionShape}.
 *
 * Resolves lazy factories to their return type and extracts the `model` property from the underlying shape.
 *
 * @typeParam S The shape or lazy shape to extract from
 */
export type Infer<S extends Lazy<ValueShape | UnionShape>> =
	S extends () => { readonly model: infer T } ? T
		: S extends { readonly model: infer T } ? T
			: never;

/**
 * Resolves a {@link Lazy} shape to its eager {@link ValueShape}.
 *
 * Unwraps lazy factories to their return type; passes direct shapes through unchanged.
 *
 * @typeParam S The lazy shape to resolve
 */
export type Eager<S extends Lazy<ValueShape>> =
	S extends Lazy<infer T extends ValueShape> ? T
		: S extends ValueShape ? S
			: never;

/**
 * Extracts explicitly declared entries from a type, stripping index signatures.
 *
 * Retains only entries whose keys are literal string or symbol types, filtering out broad `string` or `number`
 * index signatures. Used to resolve the concrete entries of a type parameter that includes a catch-all index
 * signature.
 *
 * @typeParam T The type to extract declared entries from
 */
export type Declared<T> =
	| { [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K] };

/**
 * Maps {@link ValuesShape} cardinality constraints to TypeScript content types.
 *
 * Resolves `minCount` and `maxCount` to the appropriate TypeScript optionality and collection types:
 *
 * - **Scalar** (`maxCount === 1`): `V` or `undefined | V` depending on `minCount`
 * - **Multi-valued** (`maxCount > 1`): `readonly V[]` or `readonly [V, ...V[]]`
 *
 * Union-specific distribution is handled separately by {@link Variants}.
 *
 * @typeParam V The value type
 * @typeParam L The {@link ValuesShape.minCount} constraint
 * @typeParam U The {@link ValuesShape.maxCount} constraint
 */
export type Cardinality<V, L extends undefined | number, U extends undefined | number> =
	U extends 1
		? L extends undefined | 0 ? undefined | V : V
		: L extends undefined | 0 ? undefined | readonly V[] : readonly [V, ...V[]];

/**
 * Maps a {@link UnionShape} model to its cardinality-aware form.
 *
 * For scalar cardinality (`maxCount === 1`), each variant key holds a single value. For multi-valued
 * cardinality, each variant key holds an array — grouping values by variant rather than wrapping the
 * whole record in an array.
 *
 * @typeParam V The union model type
 * @typeParam U The {@link ValuesShape.maxCount} constraint
 */
export type Variants<V, U extends undefined | number = undefined | number> =
	U extends 1
		? { readonly [K in keyof V]?: NonNullable<V[K]> }
		: { readonly [K in keyof V]?: readonly NonNullable<V[K]>[] };


//// Validation API ////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks whether a value was validated with a given scope.
 *
 * @param value The value to inspect
 * @param opts Retrieval options
 * @param opts.scope The scope to check against; `"*"` matches both `"state"` and `"entry"`
 *
 * @returns The associated {@link ResourceShape}, or `undefined` if the value was not validated with the expected scope
 */
export function audit(value: Value, opts: {

	readonly scope: "*" | "state" | "entry"

}): undefined | ResourceShape;

/**
 * Checks whether a query was validated with a given scope.
 *
 * @param query The query to inspect
 * @param opts Retrieval options
 * @param opts.scope The scope to check against
 *
 * @returns The associated {@link ResourceShape}, or `undefined` if the query was not validated with the expected scope
 */
export function audit(query: Query, opts: {

	readonly scope: "model"

}): undefined | ResourceShape;

/**
 * Checks whether a value or model was validated with a given scope.
 */
export function audit(entry: Value | Query, {

	scope

}: {

	readonly scope: "*" | "state" | "entry" | "model"

}): undefined | ResourceShape {

	const actual = branded(entry, ValidationScope);

	if ( scope === "*" ? actual === "state" || actual === "entry" : actual === scope ) {

		return branded(entry, ValidationShape) as ResourceShape;

	} else {

		return undefined;

	}

}


/**
 * Validates a value against a shape with a state scope.
 *
 * Enforces all shape constraints including type, cardinality, closed-shape checks, and custom validators.
 * For {@link Resource} values, which are property maps describing the complete state of a linked data resource,
 * unknown and missing properties are both rejected; all declared properties are required unless marked optional
 * by the shape.
 *
 * > [!TIP]
 * > For {@link Resource} values, the function is idempotent on a specific scope/shape combination: on re-validation
 * > against the same scope and shape, the previous association is trusted without repeating the validation process,
 * > so that you can safely re-validate defensively.
 *
 * > [!TIP]
 * > Use {@link audit} to check whether a value was previously validated with the `state` scope and retrieve the
 * > associated shape.
 *
 * @typeParam T The {@link Value} type inferred from `opts.shape`
 *
 * @param value The value to validate
 * @param opts Validation options
 * @param opts.scope Selects state-level validation with full constraint enforcement
 * @param opts.shape The {@link Lazy} shape defining validation constraints
 *
 * @returns A {@link Relay} resolving to either `{ value }` on success or `{ trace }` on
 * failure; for
 * {@link Resource} values, on success, the value is an immutable copy associated with the `state` scope and a verified
 * and flattened copy of the shape (see {@link resource!resource | resource}), retrievable via {@link audit}
 *
 * @throws {TraceError} If the shape contains invalid or incompatible entry definitions (see
 *     {@link resource!resource | resource})
 */
export function validate<T extends Value>(value: unknown, opts: {

	readonly scope: "state"
	readonly shape: Lazy<ValueShape & { model: T }>

}): Relay<{

	readonly value: T,
	readonly trace: Trace

}>;

/**
 * Validates value identity against a shape with an entry scope.
 *
 * For {@link Resource} values, checks only the `id` property: if the shape declares an `id` property, the value must
 * contain an `id` field with a valid absolute IRI satisfying the shape's `pattern`, `in`, and `hasValue` constraints.
 * All other properties are ignored. If the shape declares no `id` property, the value passes validation unchanged.
 * All other value types are accepted as is.
 *
 * > [!TIP]
 * > For {@link Resource} values, the function is idempotent on a specific scope/shape combination: on re-validation
 * > against the same scope and shape, the previous association is trusted without repeating the validation process,
 * > so that you can safely re-validate defensively.
 *
 * > [!TIP]
 * > Use {@link audit} to check whether a value was previously validated with the `entry` scope and retrieve the
 * > associated shape.
 *
 * @typeParam T The {@link Value} type inferred from `opts.shape`
 *
 * @param value The value to validate
 * @param opts Validation options
 * @param opts.scope Selects identity-only validation checking just the `id` property
 * @param opts.shape The {@link Lazy} shape defining validation constraints
 *
 * @returns A {@link Relay} resolving to either `{ entry }` on success or `{ trace }` on
 * failure; for
 * {@link Resource} values, on success, the entry is an immutable copy associated with the `entry` scope and a verified
 * and flattened copy of the shape (see {@link resource!resource | resource}), retrievable via {@link audit}
 *
 * @throws {TraceError} If the shape contains invalid or incompatible entry definitions (see
 *     {@link resource!resource | resource})
 */
export function validate<T extends Value>(value: unknown, opts: {

	readonly scope: "entry"
	readonly shape: Lazy<ValueShape & { model: T }>

}): Relay<{

	readonly entry: T,
	readonly trace: Trace

}>;

/**
 * Validates a query against a shape with a query scope.
 *
 * A {@link Query} is a recursively nested property map specifying which properties to retrieve from a resource.
 * Shape constraints beyond type are skipped as query values are placeholders rather than actual
 * data; cardinality is checked only for shape consistency (scalar if `maxCount` is 1, singleton tuple otherwise);
 * missing properties are accepted as not requested and unknown properties in expression paths are silently ignored.
 *
 * > [!TIP]
 * > The function is idempotent on a specific scope/shape combination: on re-validation against the same scope and
 * > shape, the previous association is trusted without repeating the validation process, so that you can safely
 * > re-validate defensively.
 *
 * > [!TIP]
 * > Use {@link audit} to check whether a query was previously validated with the `query` scope and retrieve the
 * > associated shape.
 *
 * > [!TIP]
 * > Wherever a property specifies a {@link ReferenceShape}, the query may be either an IRI {@link Reference}
 * > (retrieving just the id) or a nested {@link Query} (retrieving a projection of the referenced resource, validated
 * > against its target shape). Nesting is subject to `depth` limits; set `depth` to the minimum required level to
 * > guard against possible complexity attacks from deeply nested models.
 *
 * > [!WARNING]
 * > Default options are safe against complexity attacks from client-defined models: aggregate transforms are rejected
 * > (`stats` defaults to `false`) and nested query expansion is disabled (`depth` defaults to `0`). Explicitly set
 * > `stats` to `true` and/or `depth` to a positive value or `null` only when the additional complexity is required
 * > and acceptable.
 *
 * @typeParam T The {@link Query} type
 *
 * @param query The query to validate
 * @param opts Validation options
 * @param opts.scope Selects query-level validation with structural checks
 * @param opts.shape The {@link Lazy} shape defining the expected structure
 * @param opts.stats Whether aggregate transforms (count, sum, min, max, avg) are accepted; `true` allows them;
 *     `false` rejects any binding containing aggregate transforms; defaults to `false`
 * @param opts.depth Maximum nesting depth for {@link Reference} and embedded {@link Resource} expansion; `0` rejects
 *     any nested {@link Query} while still accepting IRI references; `null` for unlimited; defaults to `0`
 *
 * @returns A {@link Relay} resolving to either `{ query }` on success or `{ trace }` on
 * failure; on success, the query is an immutable copy associated with the `query` scope and a verified and
 * flattened copy of the
 * shape (see {@link resource!resource | resource}), retrievable via {@link audit}
 *
 * @throws TypeError If the shape contains invalid entry definitions (see {@link resource!resource | resource})
 * @throws RangeError If the shape contains incompatible inherited constraints
 * (see {@link resource!resource | resource})
 */
export function validate<T extends Query>(query: unknown, opts: {

	readonly scope: "model"
	readonly shape: Lazy<ValueShape>

	readonly stats?: boolean
	readonly depth?: null | number

}): Relay<{

	readonly query: T,
	readonly trace: Trace

}>;

/**
 * Validates a value or model against a shape within the specified scope.
 */
export function validate(value: unknown, {

	scope,
	shape,

	stats = false,
	depth = 0

}: {

	readonly scope: "state" | "model" | "entry"
	readonly shape: Lazy<ValueShape>

	readonly stats?: boolean
	readonly depth?: null | number

}): Relay<{

	readonly value: Value
	readonly entry: Value
	readonly query: Value | Query
	readonly trace: Trace

}> {

	try {

		const materialized = materialize(shape);

		if ( materialized.kind === "resource" ) {

			if ( branded(value, ValidationScope) === scope && branded(value, ValidationShape) === materialized ) {

				return scope === "state" ? createRelay({ value })
					: scope === "entry" ? createRelay({ entry: value })
						: createRelay({ query: value });

			} else if ( scope === "state" ) {

				const trace = validateResource([value], materialized);

				return trace === undefined
					? createRelay({
						value: brand(value, {
							[ValidationScope]: "state",
							[ValidationShape]: materialized
						})
					})
					: createRelay({ trace });

			} else if ( scope === "entry" ) {

				const trace = validateEntry([value], materialized);

				return trace === undefined
					? createRelay({
						entry: brand(value, {
							[ValidationScope]: "entry",
							[ValidationShape]: materialized
						})
					})
					: createRelay({ trace });

			} else {

				const trace = validateQuery([value], materialized, { depth, stats });

				return trace === undefined
					? createRelay({
						query: brand(value, {
							[ValidationScope]: "model",
							[ValidationShape]: materialized
						})
					})
					: createRelay({ trace });

			}

		} else {

			if ( scope === "entry" ) { // non-resource values accepted as-is

				return createRelay({ entry: value });

			} else if ( scope === "model" ) {

				const trace = validateValue([value], materialized);

				return trace === undefined
					? createRelay({ query: value })
					: createRelay({ trace });

			} else {

				const trace = validateValue([value], materialized);

				return trace === undefined
					? createRelay({ value: value as Value })
					: createRelay({ trace });

			}

		}

	} catch ( e ) {

		return createRelay({ trace: e instanceof TraceError ? e.cause : message(e) });

	}

}


//// Factories /////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a union of named value shapes.
 *
 * Each key in the record serves as a type discriminator for polymorphic values,
 * enabling JSON-LD `@container: @index` patterns while preserving RDF semantics
 *
 * @typeParam V The variants record type
 *
 * @param variants Record mapping variant names to value shapes
 *
 * @returns An immutable union with the specified variants
 *
 * @example
 *
 * ```typescript
 * const address = optional(union({
 *   string: string(),
 *   PostalAddress: PostalAddress
 * }));
 * ```
 *
 * @see {@link https://www.w3.org/TR/shacl/#OrConstraintComponent SHACL § 4.7.2 sh:or}
 * @see {@link https://www.w3.org/TR/json-ld11/#data-indexing JSON-LD 1.1 § 4.6.1 Data Indexing}
 */
export function union<V extends { readonly [variant: Identifier]: Lazy<ValueShape> }>(variants: V): UnionShape<{

	readonly [K in keyof V]: Eager<V[K]>

}> {

	const materialized = Object.fromEntries(
		Object.entries(variants)
			.map(([k, v]) => [k, materialize(v)])
	);

	return immutable({

		kind: "union",

		model: Object.fromEntries(Object.entries(materialized).map(([k, v]) =>
			[k, (v as ValueShape).model]
		)),

		variants: materialized

	}) as UnionShape<{ readonly [K in keyof V]: Eager<V[K]> }>;

}


/**
 * Creates a value set shape with no cardinality constraints (0..*).
 *
 * Allows zero or more values, resulting in an optional array type (`undefined | readonly V[]`).
 *
 * > [!WARNING]
 * > For {@link LocalisedShape | localised} shapes, each tag in the map holds a string array.
 * > `minCount`/`maxCount` apply **per tag**, not as an aggregate across all tags — this differs from
 * > vanilla SHACL aggregate counting, though expressible via per-tag property shapes.
 *
 * @typeParam S The {@link Lazy} {@link ValueShape} or {@link UnionShape} type
 *
 * @param shape The {@link Lazy} {@link ValueShape} or {@link UnionShape} to constrain
 *
 * @returns An immutable value set shape with no minimum or maximum count
 */
export function multiple<S extends Lazy<ValueShape | UnionShape>>(shape: S): ValuesShape<Infer<S>, undefined, undefined, S> {

	return cardinality(undefined, undefined)(shape);

}

/**
 * Creates a value set shape requiring at least one value (1..*).
 *
 * Requires one or more values, resulting in a non-empty array type (`readonly [V, ...V[]]`).
 *
 * > [!WARNING]
 * > For {@link LocalisedShape | localised} shapes, each tag in the map holds a non-empty string
 * > array and the map must contain at least one tag. `minCount`/`maxCount` apply **per tag**, not as
 * > an aggregate across all tags — this differs from vanilla SHACL aggregate counting, though
 * > expressible via per-tag property shapes.
 *
 * @typeParam S The {@link Lazy} {@link ValueShape} or {@link UnionShape} type
 *
 * @param shape The {@link Lazy} {@link ValueShape} or {@link UnionShape} to constrain
 *
 * @returns An immutable value set shape with minCount=1 and no maximum count
 */
export function repeatable<S extends Lazy<ValueShape | UnionShape>>(shape: S): ValuesShape<Infer<S>, 1, undefined, S> {

	return cardinality(1, undefined)(shape);

}

/**
 * Creates a value set shape for at most one value (0..1).
 *
 * Allows zero or one value, resulting in an optional scalar type (`undefined | V`).
 *
 * > [!WARNING]
 * > For {@link LocalisedShape | localised} shapes, each tag in the map holds a single string.
 * > `minCount`/`maxCount` apply **per tag**, not as an aggregate across all tags — this differs from
 * > vanilla SHACL aggregate counting, though expressible via per-tag property shapes.
 *
 * @typeParam S The {@link Lazy} {@link ValueShape} or {@link UnionShape} type
 *
 * @param shape The {@link Lazy} {@link ValueShape} or {@link UnionShape} to constrain
 *
 * @returns An immutable value set shape with no minimum count and maxCount=1
 */
export function optional<S extends Lazy<ValueShape | UnionShape>>(shape: S): ValuesShape<Infer<S>, undefined, 1, S> {

	return cardinality(undefined, 1)(shape);

}

/**
 * Creates a value set shape for exactly one value (1..1).
 *
 * Requires exactly one value, resulting in a required scalar type (`V`).
 *
 * > [!WARNING]
 * > For {@link LocalisedShape | localised} shapes, each tag in the map holds exactly one string and
 * > the map must contain at least one tag. `minCount`/`maxCount` apply **per tag**, not as an
 * > aggregate across all tags — this differs from vanilla SHACL aggregate counting, though
 * > expressible via per-tag property shapes.
 *
 * @typeParam S The {@link Lazy} {@link ValueShape} or {@link UnionShape} type
 *
 * @param shape The {@link Lazy} {@link ValueShape} or {@link UnionShape} to constrain
 *
 * @returns An immutable value set shape with minCount=1 and maxCount=1
 */
export function required<S extends Lazy<ValueShape | UnionShape>>(shape: S): ValuesShape<Infer<S>, 1, 1, S> {

	return cardinality(1, 1)(shape);

}


/**
 * Creates a value set shape factory with custom cardinality constraints.
 *
 * Returns a factory function that creates ranges with the specified minimum and maximum counts.
 *
 *
 * @typeParam L The minimum count constraint type
 * @typeParam U The maximum count constraint type
 *
 * @param lower Minimum number of expected values
 * @param upper Maximum number of expected values
 *
 * @returns A factory function that creates immutable ranges with the specified cardinality
 *
 * @example
 *
 * ```typescript
 * const twoToFive = cardinality(2, 5);
 * const tags = twoToFive(string());
 * ```
 */
export function cardinality<
	L extends undefined | number,
	U extends undefined | number = undefined
>(
	lower: L,
	upper?: U
): <S extends Lazy<ValueShape | UnionShape>>(shape: S) => ValuesShape<Infer<S>, L, U, S> {

	if ( lower !== undefined && lower < 0 ) {
		throw new TypeError(`expected non-negative minCount <${lower}>`);
	}

	if ( upper !== undefined && upper < 0 ) {
		throw new TypeError(`expected non-negative maxCount <${upper}>`);
	}

	if ( lower !== undefined && upper !== undefined && lower > upper ) {
		throw new TypeError(`inconsistent bounds <${lower}> > <${upper}>`);
	}

	return <S extends Lazy<ValueShape | UnionShape>>(shape: S) => {

		type Query = S extends UnionShape ? Variants<Infer<S>, U>
			: S extends Lazy<LocalisedShape> ? (U extends 1
				? string | { readonly [tag: string]: string }
				: readonly string[] | { readonly [tag: string]: readonly string[] })
				: U extends 1 ? Infer<S>
					: readonly Infer<S>[];

		const materialized = materialize(shape);

		const model = materialized.kind === "union" || materialized.kind === "localised"
			? Object.fromEntries(Object.entries(materialized.model).map(([key, value]) =>
				[key, upper === 1 ? value : [value]]
			))
			: upper === 1 ? materialized.model
				: [materialized.model];

		return immutable({

			kind: "values",
			model: model as Query,

			minCount: lower,
			maxCount: upper,

			shape: materialized as (ValueShape | UnionShape) & {
				readonly model: Infer<S>
			}

		});

	};

}
