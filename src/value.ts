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
 * Composite shapes and cardinality factories.
 *
 * Defines the shape hierarchy for describing the expected structure of linked data values,
 * along with cardinality factories for constraining how many values a property may hold.
 *
 * {@link ValueShape} — union of shapes that may describe either a scalar or a set:
 *
 * - {@link BooleanShape} - Booleans
 * - {@link NumberShape} - Numbers
 * - {@link StringShape} - Strings
 * - {@link ReferenceShape} - Resource IRI references
 * - {@link ResourceShape} - Resources
 *
 * {@link ValuesShape} — union of all concrete value shapes, including those that always describe a set:
 *
 * - Everything in {@link ValueShape}
 * - {@link LocalisedShape} - Language-tagged maps (always a set, with per-tag cardinality)
 *
 * Composite shapes:
 *
 * - {@link SetShape} - Cardinality-constrained value sets
 * - {@link UnionShape} - Discriminated type alternatives for polymorphic values
 *
 * <img src="value.svg" alt="Shape hierarchy" style="width: 100%" />
 *
 * **Effective Shape Resolution**
 *
 * Use {@link apply} to resolve the effective shape after applying a {@link Probe} to a values shape, resolving
 * property paths through nested resources and deriving the effective type through each transform pipe stage.
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/shacl/ | SHACL - Shapes Constraint Language}
 */

import type { Identifier, Lazy } from "@metreeca/core";
import { immutable } from "@metreeca/core/deep";
import { error } from "@metreeca/core/report";
import type { Probe, Transform } from "@metreeca/qest/template";
import type { BooleanShape } from "./boolean.js";
import type { LocalisedShape } from "./localised.js";
import { decimal, integer, type NumberShape } from "./number.js";
import type { ReferenceShape } from "./reference.js";
import type { ResourceShape } from "./resource.js";
import { date, duration, instant, iri, string, type StringShape, time, timestamp, year } from "./string.js";
import { materialize } from "./value.core.js";


/**
 * Registry of transforms mapped to their shape-level type metadata.
 */
const Transforms: Record<Transform, {

	/**
	 * Whether the transform is an aggregate.
	 *
	 * Aggregate transforms set `maxCount` to `1`; scalar transforms preserve `maxCount` from the path. All
	 * transforms set `minCount` to undefined.
	 */
	readonly aggregate: boolean,

	readonly accepts: "*" | "numeric" | "temporal" | "string",
	readonly returns: "*" | "integer" | "decimal" | "string"

}> = immutable({

	count: { aggregate: true, accepts: "*", returns: "integer" },
	min: { aggregate: true, accepts: "*", returns: "*" },
	max: { aggregate: true, accepts: "*", returns: "*" },
	sum: { aggregate: true, accepts: "numeric", returns: "*" },
	avg: { aggregate: true, accepts: "numeric", returns: "decimal" },

	abs: { aggregate: false, accepts: "numeric", returns: "*" },
	floor: { aggregate: false, accepts: "numeric", returns: "*" },
	ceil: { aggregate: false, accepts: "numeric", returns: "*" },
	round: { aggregate: false, accepts: "numeric", returns: "*" },

	lower: { aggregate: false, accepts: "string", returns: "*" },
	upper: { aggregate: false, accepts: "string", returns: "*" },
	length: { aggregate: false, accepts: "string", returns: "integer" },

	year: { aggregate: false, accepts: "temporal", returns: "integer" },
	month: { aggregate: false, accepts: "temporal", returns: "integer" },
	day: { aggregate: false, accepts: "temporal", returns: "integer" },
	hours: { aggregate: false, accepts: "temporal", returns: "integer" },
	minutes: { aggregate: false, accepts: "temporal", returns: "integer" },
	seconds: { aggregate: false, accepts: "temporal", returns: "decimal" }

});
/**
 * Known temporal string shape models.
 *
 * Closed set of all model values produced by temporal string shape factories. Used by {@link apply}
 * to distinguish temporal strings from plain strings when checking transform compatibility.
 */

const Temporal: ReadonlySet<string> = new Set([

	year,
	date,
	time,
	instant,
	timestamp,
	duration

].map(factory =>
	factory().model
));


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Discriminated union of all concrete value shapes, including those that always describe a set.
 *
 * Extends {@link ValueShape} with {@link LocalisedShape}, whose language-map semantics inherently describe
 * a set of values regardless of cardinality.
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.3.1 Node Shapes}
 */
export type ValuesShape =
	| ValueShape
	| LocalisedShape;

/**
 * Discriminated union of value shapes that may describe either a scalar or a set.
 *
 * @see {@link ValuesShape}
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.3.1 Node Shapes}
 */
export type ValueShape =
	| BooleanShape
	| NumberShape
	| StringShape
	| ReferenceShape
	| ResourceShape;


/**
 * Shape for a cardinality-constrained value set.
 *
 * Pairs a {@link ValuesShape} or {@link UnionShape} with {@link SetShape.minCount | minCount} /
 * {@link SetShape.maxCount | maxCount} constraints that bound the expected number of values.
 * Cardinality factory functions — {@link required}, {@link optional}, {@link repeatable}, and
 * {@link multiple} — produce instances with pre-set bounds; use {@link cardinality} for custom ranges.
 *
 * **Usage**
 *
 * ```typescript
 * import { required, optional, repeatable, multiple, cardinality } from '@metreeca/blue/value';
 * import { string } from '@metreeca/blue/string';
 * import { integer } from '@metreeca/blue/number';
 *
 * required(string())    // minCount=1, maxCount=1 → exactly one string
 * optional(integer())   // minCount=undefined, maxCount=1 → zero or one integer
 * repeatable(string())  // minCount=1, maxCount=undefined → one or more strings
 * multiple(string())    // minCount=undefined, maxCount=undefined → zero or more strings
 * cardinality(2, 5)(string()) // custom range
 * ```
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link resource!ResourceConstraints.extends | extends}, each
 * set shape is merged according to the following rules.
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
 * @typeParam T The value type inferred from the wrapped shape
 * @typeParam L The {@link SetShape.minCount | minCount} constraint type
 * @typeParam U The {@link SetShape.maxCount | maxCount} constraint type
 * @typeParam S The wrapped shape type (value or union, possibly lazy)
 *
 * @see {@link https://www.w3.org/TR/shacl/#MinCountConstraintComponent SHACL § 4.1.1 sh:minCount}
 * @see {@link https://www.w3.org/TR/shacl/#MaxCountConstraintComponent SHACL § 4.1.2 sh:maxCount}
 */
export type SetShape<
	T = unknown,
	L extends undefined | number = undefined | number,
	U extends undefined | number = undefined | number,
	S extends Lazy<ValuesShape | UnionShape> = Lazy<ValuesShape | UnionShape>
> = {

	/**
	 * Discriminator identifying this as a set shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "set";

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
	readonly shape: (ValuesShape | UnionShape) & { readonly model: T };

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

	readonly [variant: Identifier]: ValuesShape

} = {

	readonly [variant: Identifier]: ValuesShape

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
	readonly model: { readonly [K in keyof Declared<V>]?: V[K] extends ValuesShape ? V[K]["model"] : never };


	/**
	 * Named value shape variants.
	 *
	 * Each key serves as a type discriminator for polymorphic property values.
	 *
	 * **Inheritance** — variant keys must match parent's; each variant delegated to value shape merge rules.
	 */
	readonly variants: V;

}


//// Type Inference ////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Extracts the model type from a {@link Lazy} shape or {@link UnionShape}.
 *
 * Resolves lazy factories to their return type and extracts the `model` property from the underlying shape.
 *
 * @typeParam S The shape or lazy shape to extract from
 */
export type Infer<S extends Lazy<ValuesShape | UnionShape>> =
	S extends () => { readonly model: infer T } ? T
		: S extends { readonly model: infer T } ? T
			: never;

/**
 * Resolves a {@link Lazy} shape to its eager {@link ValuesShape}.
 *
 * Unwraps lazy factories to their return type; passes direct shapes through unchanged.
 *
 * @typeParam S The lazy shape to resolve
 */
export type Eager<S extends Lazy<ValuesShape>> =
	S extends Lazy<infer T extends ValuesShape> ? T
		: S extends ValuesShape ? S
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
 * Maps {@link SetShape} cardinality constraints to TypeScript content types.
 *
 * Resolves `minCount` and `maxCount` to the appropriate TypeScript optionality and collection types:
 *
 * - **Scalar** (`maxCount === 1`): `V` or `undefined | V` depending on `minCount`
 * - **Multi-valued** (`maxCount > 1`): `readonly V[]` or `readonly [V, ...V[]]`
 *
 * Union-specific distribution is handled separately by {@link Variants}.
 *
 * @typeParam V The value type
 * @typeParam L The {@link SetShape.minCount} constraint
 * @typeParam U The {@link SetShape.maxCount} constraint
 */
export type Cardinality<V, L extends undefined | number, U extends undefined | number> =
	U extends 1
		? L extends undefined | 0 ? undefined | V : V
		: L extends undefined | 0 ? undefined | readonly V[] : readonly [V, ...V[]];


//// Factories /////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Maps a {@link UnionShape} model to its cardinality-aware form.
 *
 * For scalar cardinality (`maxCount === 1`), each variant key holds a single value. For multi-valued
 * cardinality, each variant key holds an array — grouping values by variant rather than wrapping the
 * whole record in an array.
 *
 * @typeParam V The union model type
 * @typeParam U The {@link SetShape.maxCount} constraint
 */
export type Variants<V, U extends undefined | number = undefined | number> =
	U extends 1
		? { readonly [K in keyof V]?: NonNullable<V[K]> }
		: { readonly [K in keyof V]?: readonly NonNullable<V[K]>[] };

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
export function union<V extends { readonly [variant: Identifier]: Lazy<ValuesShape> }>(variants: V): UnionShape<{

	readonly [K in keyof V]: Eager<V[K]>

}> {

	const materialized = Object.fromEntries(
		Object.entries(variants)
			.map(([k, v]) => [k, materialize(v)])
	);

	return immutable({

		kind: "union",

		model: Object.fromEntries(Object.entries(materialized).map(([k, v]) =>
			[k, (v as ValuesShape).model]
		)),

		variants: materialized

	}) as UnionShape<{ readonly [K in keyof V]: Eager<V[K]> }>;

}

/**
 * Creates a {@link SetShape} with no cardinality constraints (0..*).
 *
 * Allows zero or more values, resulting in an optional array type (`undefined | readonly V[]`).
 *
 * > [!WARNING]
 * > For {@link LocalisedShape | localised} shapes, each tag in the map holds a string array.
 * > `minCount`/`maxCount` apply **per tag**, not as an aggregate across all tags — this differs from
 * > vanilla SHACL aggregate counting, though expressible via per-tag property shapes.
 *
 * @typeParam S The {@link Lazy} {@link ValuesShape} or {@link UnionShape} type
 *
 * @param shape The {@link Lazy} {@link ValuesShape} or {@link UnionShape} to constrain
 *
 * @returns An immutable {@link SetShape} with no minimum or maximum count
 */
export function multiple<S extends Lazy<ValuesShape | UnionShape>>(shape: S): SetShape<Infer<S>, undefined, undefined, S> {

	return cardinality(undefined, undefined)(shape);

}

/**
 * Creates a {@link SetShape} requiring at least one value (1..*).
 *
 * Requires one or more values, resulting in a non-empty array type (`readonly [V, ...V[]]`).
 *
 * > [!WARNING]
 * > For {@link LocalisedShape | localised} shapes, each tag in the map holds a non-empty string
 * > array and the map must contain at least one tag. `minCount`/`maxCount` apply **per tag**, not as
 * > an aggregate across all tags — this differs from vanilla SHACL aggregate counting, though
 * > expressible via per-tag property shapes.
 *
 * @typeParam S The {@link Lazy} {@link ValuesShape} or {@link UnionShape} type
 *
 * @param shape The {@link Lazy} {@link ValuesShape} or {@link UnionShape} to constrain
 *
 * @returns An immutable {@link SetShape} with minCount=1 and no maximum count
 */
export function repeatable<S extends Lazy<ValuesShape | UnionShape>>(shape: S): SetShape<Infer<S>, 1, undefined, S> {

	return cardinality(1, undefined)(shape);

}

/**
 * Creates a {@link SetShape} for at most one value (0..1).
 *
 * Allows zero or one value, resulting in an optional scalar type (`undefined | V`).
 *
 * > [!WARNING]
 * > For {@link LocalisedShape | localised} shapes, each tag in the map holds a single string.
 * > `minCount`/`maxCount` apply **per tag**, not as an aggregate across all tags — this differs from
 * > vanilla SHACL aggregate counting, though expressible via per-tag property shapes.
 *
 * @typeParam S The {@link Lazy} {@link ValuesShape} or {@link UnionShape} type
 *
 * @param shape The {@link Lazy} {@link ValuesShape} or {@link UnionShape} to constrain
 *
 * @returns An immutable {@link SetShape} with no minimum count and maxCount=1
 */
export function optional<S extends Lazy<ValuesShape | UnionShape>>(shape: S): SetShape<Infer<S>, undefined, 1, S> {

	return cardinality(undefined, 1)(shape);

}

/**
 * Creates a {@link SetShape} for exactly one value (1..1).
 *
 * Requires exactly one value, resulting in a required scalar type (`V`).
 *
 * > [!WARNING]
 * > For {@link LocalisedShape | localised} shapes, each tag in the map holds exactly one string and
 * > the map must contain at least one tag. `minCount`/`maxCount` apply **per tag**, not as an
 * > aggregate across all tags — this differs from vanilla SHACL aggregate counting, though
 * > expressible via per-tag property shapes.
 *
 * @typeParam S The {@link Lazy} {@link ValuesShape} or {@link UnionShape} type
 *
 * @param shape The {@link Lazy} {@link ValuesShape} or {@link UnionShape} to constrain
 *
 * @returns An immutable {@link SetShape} with minCount=1 and maxCount=1
 */
export function required<S extends Lazy<ValuesShape | UnionShape>>(shape: S): SetShape<Infer<S>, 1, 1, S> {

	return cardinality(1, 1)(shape);

}

/**
 * Creates a {@link SetShape} factory with custom cardinality constraints.
 *
 * Returns a factory function that wraps a shape into a {@link SetShape} with the specified bounds.
 *
 *
 * @typeParam L The minimum count constraint type
 * @typeParam U The maximum count constraint type
 *
 * @param lower Minimum number of expected values
 * @param upper Maximum number of expected values
 *
 * @returns A factory function that creates immutable {@link SetShape} instances with the specified cardinality
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
): <S extends Lazy<ValuesShape | UnionShape>>(shape: S) => SetShape<Infer<S>, L, U, S> {

	if ( lower !== undefined && lower < 0 ) {
		throw new TypeError(`expected non-negative minCount <${lower}>`);
	}

	if ( upper !== undefined && upper < 0 ) {
		throw new TypeError(`expected non-negative maxCount <${upper}>`);
	}

	if ( lower !== undefined && upper !== undefined && lower > upper ) {
		throw new TypeError(`inconsistent bounds <${lower}> > <${upper}>`);
	}

	return <S extends Lazy<ValuesShape | UnionShape>>(shape: S) => {

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

			kind: "set",
			model: model as Query,

			minCount: lower,
			maxCount: upper,

			shape: materialized as (ValuesShape | UnionShape) & {
				readonly model: Infer<S>
			}

		});

	};

}


//// Probe Resolution //////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Apply a {@link Probe} to a shape, resolving the effective {@link SetShape}.
 *
 * Traverses the {@link Probe.path} segments through nested resource properties to locate the target shape, then applies
 * the {@link Probe.pipe} transforms to compute the effective value set with accumulated cardinality.
 *
 * **Shape dispatch:**
 *
 * - {@link ResourceShape}: traverses path segments through nested properties
 * - {@link ReferenceShape}: materialises the lazy target shape, then proceeds as for {@link ResourceShape}
 * - Other shapes: returns `undefined` for any non-empty path, otherwise applies the transform pipe directly
 *
 * **Path traversal** — at each step, flattens inheritance and looks up the next property. Unknown properties resolve
 * to `undefined`. At {@link UnionShape} boundaries, variants lacking the property are skipped; the path resolves to
 * `undefined` only when no variant defines it.
 *
 * **Pipe application** — applies transforms to the shape resolved by path traversal. Domain violations (a transform
 * applied outside its declared domain) and invalid compositions (aggregate after aggregate) resolve to `undefined`.
 *
 * **Cardinality** — the effective cardinality is the accumulated product of per-step constraints:
 *
 * - `minCount`: product across steps; `undefined` if any step has `minCount` undefined or `0`
 * - `maxCount`: product across steps; `undefined` if any step has `maxCount` undefined
 * - {@link UnionShape} steps do not introduce additional cardinality
 * - All transforms set `minCount` to `undefined`; scalar transforms preserve `maxCount`; aggregate transforms set
 *   `maxCount` to `1`
 *
 * @param probe The probe containing property path and transform pipe
 * @param shape The {@link ValuesShape} to inspect
 *
 * @returns An immutable {@link SetShape} with accumulated cardinality, or `undefined` when the probe is
 *     demonstrated to never produce a valid value at runtime
 *
 * @see {@link https://metreeca.github.io/qest/documents/model.Model_Design.html Model Design}
 */
export function apply({ pipe, path }: Probe, shape: Lazy<ValuesShape>): undefined | SetShape {

	type Focus = {

		readonly minCount?: number
		readonly maxCount?: number

		readonly variants: readonly ValuesShape[]

	}


	const materialized = materialize(shape);

	return transform(traverse(
		materialized.kind === "reference" // materialise reference shapes to their target resource shape
			? materialize(materialized.shape)
			: materialized
	));


	/**
	 * Traverse the property path, accumulating cardinality and collecting resolved variants.
	 */
	function traverse(shape: ValuesShape): Focus | undefined {

		return path.reduce<Focus | undefined>((accumulated, segment) => {

			return accumulated?.variants.reduce<Focus | undefined>((merged, variant) => {

				const resolved = resolve(variant, segment);

				if ( resolved === undefined ) { // skip variants that lack the property

					return merged;

				} else if ( merged === undefined ) { // seed with accumulated cardinality

					return {

						minCount: multiply(accumulated.minCount, resolved.minCount),
						maxCount: multiply(accumulated.maxCount, resolved.maxCount),

						variants: resolved.variants

					};

				} else { // merge variants

					return {

						minCount: merged.minCount,
						maxCount: merged.maxCount,

						variants: [...merged.variants, ...resolved.variants]
					};

				}

			}, undefined);

		}, {

			minCount: 1,
			maxCount: 1,

			variants: [shape]
		});

	}

	/**
	 * Resolve a single property step, returning its cardinality and value shape variants.
	 */
	function resolve(shape: ValuesShape, property: Identifier): Focus | undefined {

		const resolved = shape.kind === "resource" ? shape
			: shape.kind === "reference" ? materialize(shape.shape)
				: undefined;

		const properties = resolved !== undefined
			? resolved.properties
			: undefined;

		if ( properties === undefined ) {

			return undefined; // non-traversable leaf type: skip in union context

		} else {

			const entry = properties[property];

			if ( entry === undefined ) {

				return undefined; // undefined property: resolution fails

			} else if ( entry.kind === "id" ) {

				return {

					maxCount: 1,

					variants: [iri({ variant: "absolute" })]

				};

			} else if ( entry.kind === "type" ) {

				return {

					maxCount: 1,

					variants: [iri({ variant: "absolute" })]

				};

			} else {

				const { range } = entry;

				return {

					minCount: range.minCount,
					maxCount: range.maxCount,

					variants: range.shape.kind === "union"
						? Object.values(range.shape.variants)
						: [range.shape]

				};

			}

		}

	}

	/**
	 * Multiply optional cardinalities, propagating undefined.
	 */
	function multiply(a: number | undefined, b: number | undefined): number | undefined {

		if ( a === undefined || b === undefined ) {
			return undefined;
		} else {
			return a*b === 0 ? undefined : a*b;
		}

	}


	/**
	 * Apply the transform pipe to each variant, adjusting cardinality and assembling the effective value set.
	 */
	function transform(focus: Focus | undefined): SetShape | undefined {

		if ( focus === undefined ) { return undefined; } else {

			const successes = focus.variants
				.map(reduce)
				.filter(r => r !== undefined);

			if ( successes.length === 0 ) {

				return undefined;

			} else {

				const piped = pipe.length > 0;
				const aggregate = pipe.some(name => Transforms[name].aggregate);

				return toRange({

					minCount: piped ? undefined : focus.minCount,
					maxCount: aggregate ? 1 : focus.maxCount,

					variants: successes

				});

			}
		}
	}

	/**
	 * Apply the transform pipe to a single shape, returning undefined on type incompatibility.
	 */
	function reduce(shape: ValuesShape): ValuesShape | undefined {

		return pipe.reduce<{ shape: ValuesShape; aggregate: boolean } | undefined>((state, name) => {

			if ( state === undefined ) { return undefined; } else {

				const localised = isLocalised(state.shape);
				const transform = Transforms[name];

				const accepted = localised ? (transform.accepts === "string" && transform.returns === "*")
					: transform.accepts === "*" ? true
						: transform.accepts === "numeric" ? isNumeric(state.shape)
							: transform.accepts === "string" ? isTextual(state.shape)
								: transform.accepts === "temporal" ? isTemporal(state.shape)
									: false;

				return !accepted || (transform.aggregate && state.aggregate) ? undefined : {

					aggregate: state.aggregate || transform.aggregate,

					shape: transform.returns === "*" ? state.shape
						: transform.returns === "integer" ? integer()
							: transform.returns === "decimal" ? decimal()
								: transform.returns === "string" ? (localised ? state.shape : string())
									: error<ValuesShape>(`unsupported transform output type '${transform.returns}'`)

				};

			}

		}, {

			aggregate: false,
			shape

		})?.shape;

	}


	function isNumeric(shape: ValuesShape) {
		return shape.kind === "number";
	}

	function isTextual(shape: ValuesShape) {
		return shape.kind === "string" && !Temporal.has(shape.model);
	}

	function isTemporal(shape: ValuesShape) {
		return shape.kind === "string" && Temporal.has(shape.model);
	}

	function isLocalised(shape: ValuesShape) {
		return shape.kind === "localised";
	}


	/**
	 * Convert a focus to a {@link SetShape}, wrapping multiple variants into a union.
	 */
	function toRange({ minCount, maxCount, variants }: Focus): SetShape {

		const isScalar = maxCount === 1;

		const shape = variants.length === 1 ? variants[0] : {

			kind: "union",

			model: Object.fromEntries(variants.map((s, i) => [s.kind+"#"+i, s.model])),
			variants: Object.fromEntries(variants.map((s, i) => [s.kind+"#"+i, s]))

		};

		const model = shape.kind === "union"
			? Object.fromEntries(Object.entries(shape.model).map(([key, value]) =>
				[key, isScalar ? value : [value]]
			))
			: isScalar ? shape.model
				: [shape.model];

		return immutable({

			kind: "set",

			minCount,
			maxCount,

			shape,
			model

		}) as SetShape;

	}

}
