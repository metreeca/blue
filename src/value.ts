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
 * **Shape Hierarchy**
 *
 * - {@link Shape} — discriminated union of all value and union shapes
 * - {@link ValuesShape} — value shapes plus localised {@link TextShape} language-tagged maps
 * - {@link ValueShape} — the concrete value shapes:
 *   - {@link BooleanShape} — boolean values
 *   - {@link NumberShape} — numeric values
 *   - {@link StringShape} — textual values
 *   - {@link ReferenceShape} — resource references
 *   - {@link ResourceShape} — linked data resources
 * - {@link UnionShape} — a disjunction of value-shape variants for a polymorphic value
 * - {@link SetShape} — a cardinality-constrained value set
 * - {@link RangeShape} — value range a {@link Probe} resolves to via {@link apply}: bounds and variants
 * - {@link NullShape} — a provably absent value a {@link Probe} resolves to via {@link apply}
 *
 * <img src="value.svg" alt="Shape hierarchy" style="width: 100%" />
 *
 * **Type Inference**
 *
 * Two companion types project a shape into the relevant TypeScript view:
 *
 * - {@link Schema} — the complete template declared by the shape, with every property present
 *   and cardinality-driven optionality carried on the value types (template side).
 * - {@link State} — the runtime state value matching the template, recovered through the
 *   {@link @metreeca/qest!Instance | Instance} (state side).
 *
 * Ancillary helpers {@link Resolved}, {@link Variants}, {@link Bounds}, and {@link Boxed}
 * factor the internal projections (narrowing the eager unwrap of a {@link Lazy} shape to the
 * {@link Shape} bound, resolving union branches, conditioning a shape's model on cardinality,
 * and boxing values into singleton tuples for multi-valued ranges) and are exported for tests
 * and downstream shape extensions.
 *
 * **Utilities**
 *
 * - {@link eager} resolves a {@link Lazy} shape, caching factory results and flattening
 *   {@link ResourceShape} entries.
 * - {@link model} extracts the runtime {@link Schema} of a shape, an ergonomic shortcut for
 *   `eager(shape).model`.
 * - {@link apply} resolves the effective {@link RangeShape} type for a {@link Probe} against a
 *   {@link Shape}, walking property paths through nested resources, branching across
 *   {@link UnionShape} variants at the entry or at any property range, and applying each
 *   transform pipe stage. It yields a {@link NullShape} when the probe is accepted
 *   but provably resolves to no value, or an atomic {@link Trace} string when the probe cannot
 *   be resolved or its transform pipe cannot be applied.
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/shacl/ | SHACL - Shapes Constraint Language}
 */

import { type Eager, type Identifier, isFunction, isString, type Lazy } from "@metreeca/core";
import { immutable } from "@metreeca/core/deep";
import { TagRange } from "@metreeca/core/language";
import { assert, error } from "@metreeca/core/report";
import {
	type Instance,
	isProbe,
	type Probe,
	type Selection,
	type Transform,
	Transforms
} from "@metreeca/qest/template";
import type { BooleanShape } from "./boolean.js";
import { type Trace, TraceError } from "./index.js";
import { decimal, integer, type NumberShape } from "./number.js";
import type { ReferenceShape } from "./reference.js";
import { flatten } from "./resource.core.js";
import type { ResourceShape } from "./resource.js";
import { date, instant, iri, string, type StringShape, time, timestamp } from "./string.js";
import type { TextShape } from "./text.js";


/**
 * Known temporal string shape models.
 *
 * Closed set of all model values produced by temporal string shape factories. Used by {@link apply}
 * to distinguish temporal strings from plain strings when checking transform compatibility.
 */
const Temporal: ReadonlySet<string> = new Set([

	date,
	time,
	instant,
	timestamp

].map(factory => factory().model));


/**
 * Cache for eagerly resolved shapes from lazy factories.
 *
 * Uses WeakMap so entries are automatically released when the factory function is no longer referenced.
 * A `null` entry signals a factory currently being resolved, enabling circular dependency detection.
 */
const cache = new WeakMap<() => Shape, null | Shape>();


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Discriminated union of all value and union shapes.
 *
 * Combines every concrete {@link ValuesShape} with {@link UnionShape}, providing a single
 * supertype for generic constraints throughout the shape hierarchy.
 */
export type Shape =
	| ValuesShape
	| UnionShape;

/**
 * Discriminated union of all concrete value shapes, including those that always describe a set.
 *
 * Extends {@link ValueShape} with {@link TextShape}, whose language-map semantics inherently describe
 * a set of values regardless of cardinality.
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.3.1 Node Shapes}
 */
export type ValuesShape =
	| ValueShape
	| TextShape;

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
 * Discriminated type alternatives for polymorphic values.
 *
 * Variants act as alternatives during validation: a value satisfies the union if it satisfies at
 * least one variant. Order is preserved for deterministic error reporting but does not imply
 * priority. Each variant is a {@link ValueShape} (a literal, reference, or resource); localised
 * {@link text!text | text} is a whole-property type and is never a variant, so {@link union}
 * rejects a text shape. In a retrieval template a union-typed slot is addressed only through the
 * indexed {@link @metreeca/qest!Union | Union} form (`{"0": ..., "1": ...}`); a plain placeholder
 * over it is rejected.
 *
 * **Cardinality**
 *
 * The expected cardinality of the polymorphic value set constrains the form of the expected value;
 * for example, given `union(string(), reference(PostalAddress))`:
 *
 * | Cardinality  | Model Type                                  |
 * | ------------ | ------------------------------------------- |
 * | scalar       | `string \| Reference`                       |
 * | multi-valued | `readonly (string \| Reference)[]`          |
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link resource!ResourceConstraints.extends | extends}, a
 * union-typed property may drop variants and tighten the variants it keeps, but never add new ones. Narrowing takes one
 * of two forms, governed by a *discriminator* per variant (`kind` for `boolean` / `text`; `(kind, datatype)` for
 * `string` / `number`; `(kind, class)` for `reference` / `resource`):
 *
 * 1. **Single-variant narrowing** (Form 1) — child supplies a non-union value shape whose discriminator appears
 *    exactly once among the parent's variants. The result is the merged single shape; the enclosing
 *    {@link SetShape.shape | SetShape.shape} is no longer a union. Rejects when the discriminator is absent or
 *    non-unique within the parent.
 *
 * 2. **Union subsetting** (Form 2) — child supplies a union whose variants form a subsequence of the parent's. For each
 *    discriminator group in the parent, the child must contain either all parent variants of that group in the same
 *    relative order, or none. Each retained pair is merged pairwise; dropped variants are absent from the result.
 *
 * The merged union's `model` re-indexes contiguously from `0`. Dropping a parent variant renumbers every later
 * variant — consumers must key off the shape's own `model`, not assume positional alignment with an ancestor.
 * Union-form templates (`{"0": ..., "1": ...}`) are interpreted against the *current* shape's
 * variants; well-typed templates derived from {@link Schema} carry the correct indices automatically.
 *
 * | Field      | Override Rule                                                                                |
 * | ---------- | -------------------------------------------------------------------------------------------- |
 * | `kind`     | Cannot be overridden                                                                         |
 * | `model`    | Computed from variants, re-indexed contiguously from `0`                                     |
 * | `variants` | Dropped or kept per discriminator group (all-or-none, in order); kept variants pairwise narrowed |
 *
 * @typeParam V The variants tuple; each variant eager or a {@link Lazy} factory for recursive self-reference
 *
 * @see {@link https://www.w3.org/TR/shacl/#OrConstraintComponent SHACL § 4.7.2 sh:or}
 */
export type UnionShape<
	V extends readonly Lazy<ValueShape>[] = readonly ValueShape[]
> = {

	/**
	 * Discriminator identifying this as a union.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "union";

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * Variant-keyed record mapping each variant's position to its model type, matching the
	 * {@link @metreeca/qest!Union | Union} form expected by retrieval templates.
	 *
	 * **Inheritance** — computed from variants, not user-defined.
	 */
	readonly model: { readonly [K in keyof Variants<V> & `${number}`]: Variants<V>[K]["model"] };


	/**
	 * Ordered value shape variants.
	 *
	 * **Inheritance** — subsequence of the parent's variants that, per discriminator group, retains all of the group's
	 * variants in order or drops the whole group (see {@link UnionShape}); each retained variant is delegated to value
	 * shape merge rules.
	 */
	readonly variants: V;

};

/**
 * Shape for a cardinality-constrained value set.
 *
 * Pairs a {@link Shape} with {@link SetShape.minCount | minCount} /
 * {@link SetShape.maxCount | maxCount} constraints that bound the expected number of values.
 * Cardinality factory functions ({@link required}, {@link optional}, {@link repeatable}, and
 * {@link multiple}) produce instances with pre-set bounds; use {@link cardinality} for custom ranges.
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
 * | Field      | Override Rule                                                                              |
 * | ---------- | ------------------------------------------------------------------------------------------ |
 * | `kind`     | Cannot be overridden                                                                       |
 * | `minCount` | Child ≥ parent, narrowing the minimum cardinality                                          |
 * | `maxCount` | Child ≤ parent, narrowing the maximum cardinality                                          |
 * | `shape`    | `kind` must match; a non-union child may narrow a {@link UnionShape | union} parent to one |
 *
 * **Cross-Field Validation**
 *
 * - merged `minCount` must be ≤ merged `maxCount`
 *
 * @typeParam S The wrapped shape, eager or a {@link Lazy} factory for recursive self-reference
 * @typeParam L The {@link SetShape.minCount | minCount} constraint type
 * @typeParam U The {@link SetShape.maxCount | maxCount} constraint type
 *
 * @see {@link https://www.w3.org/TR/shacl/#MinCountConstraintComponent SHACL § 4.1.1 sh:minCount}
 * @see {@link https://www.w3.org/TR/shacl/#MaxCountConstraintComponent SHACL § 4.1.2 sh:maxCount}
 */
export type SetShape<
	S extends Lazy<Shape> = Lazy<Shape>,
	L extends undefined | number = undefined | number,
	U extends undefined | number = undefined | number
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
	 * Scalar value sets hold the shape model directly; multi-valued sets hold an `[element, Selection?]` tuple.
	 * {@link TextShape | Text} shapes always hold a single language map because cardinality
	 * applies per tag within the map, not to the map itself. The type is unioned with `undefined`
	 * when `minCount` is `0` or `undefined`, reflecting the optional arm on the template side. See
	 * {@link Bounds} for the projection rules.
	 *
	 * **Inheritance** — computed from shape and cardinality, not user-defined.
	 */
	readonly model: Bounds<S, L, U>;


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
	 * **Inheritance** — child `shape.kind` must match parent `shape.kind`, with one exception: when parent is a
	 * {@link UnionShape | union}, child may supply a non-union value shape whose discriminator appears exactly once
	 * among parent variants (single-variant narrowing). Otherwise delegated to value shape or
	 * {@link UnionShape | union} merge rules.
	 */
	readonly shape: Shape & { readonly model: State<S> };

};


/**
 * Factory function returned by {@link cardinality}.
 *
 * Accepts a value or union shape and returns a {@link SetShape} with the enclosing cardinality
 * bounds. An optional {@link @metreeca/qest!Selection | Selection} parameter is accepted when
 * the shape inherently represents a collection — either because the upper bound is not `1`
 * (multi-valued model held as a singleton tuple) or because the shape is a
 * {@link TextShape | Text} (always a set, regardless of cardinality). The selection is
 * silently merged into the runtime model without surfacing in the {@link SetShape} type.
 *
 * @typeParam L The {@link SetShape.minCount | minCount} bound
 * @typeParam U The {@link SetShape.maxCount | maxCount} bound
 */
export type SetFactory<
	L extends undefined | number,
	U extends undefined | number
> = <S extends Lazy<Shape>>(shape: S, selection?: SetSelection<S, U>) => SetShape<S, L, U>;

/**
 * Conditional {@link @metreeca/qest!Selection | Selection} parameter type for shape factories.
 *
 * {@link @metreeca/qest!Selection | Selection} for shapes that inherently represent a
 * collection, namely {@link TextShape | text} shapes (always a set, regardless of
 * cardinality) or multi-valued ranges (`maxCount !== 1`), and `never` for scalar shapes,
 * preventing callers from passing selection where it would have no effect.
 *
 * @typeParam S The {@link Lazy} {@link Shape} being constrained
 * @typeParam U The {@link SetShape.maxCount | maxCount} bound
 */
export type SetSelection<
	S extends Lazy<Shape>,
	U extends undefined | number = undefined
> =
	S extends Lazy<TextShape> ? Selection
		: U extends 1 ? never
			: Selection;


/**
 * Resolved value range of a {@link Probe}.
 *
 * Carries the cardinality bounds ({@link RangeShape.minCount | minCount} / {@link RangeShape.maxCount | maxCount})
 * accumulated across the traversed steps, and {@link RangeShape.variants | variants}: the value shapes the path can
 * reach, a never-empty disjunction over the text-including {@link ValuesShape} alphabet. The `"range"`
 * {@link RangeShape.kind | kind} discriminates it from an absent {@link NullShape} in an {@link apply} result.
 *
 * > [!NOTE]
 * > A path can reach a mix no declared shape expresses: for `creator.name` with `creator: union(Person,
 * > Organization)`, `Person.name: string()`, `Organization.name: text()`, it reaches both string and text, which a
 * > declared property cannot hold (a value-variant union and whole-property text never combine).
 *
 * @see {@link apply}
 *
 * @see {@link NullShape}
 */
export type RangeShape = {

	/**
	 * Discriminator identifying this as a resolved value range.
	 */
	readonly kind: "range";


	/**
	 * Minimum number of expected values across the enveloped branches; `undefined` imposes no lower bound.
	 */
	readonly minCount?: number;

	/**
	 * Maximum number of expected values across the enveloped branches; `undefined` imposes no upper bound.
	 */
	readonly maxCount?: number;


	/**
	 * Reachable value shapes in branch order; never empty.
	 */
	readonly variants: readonly ValuesShape[];

};

/**
 * Empty resolution of a {@link Probe}.
 *
 * Produced when static analysis proves the path carries no value, rather than when a runtime constraint fails. An
 * accepted outcome, not a failure, and therefore distinct from the {@link Trace} strings reported when the probe
 * cannot be resolved or its transform pipe cannot be applied. The `"null"` {@link NullShape.kind | kind} discriminates
 * it from a resolved {@link RangeShape} in an {@link apply} result.
 *
 * @see {@link apply}
 *
 * @see {@link RangeShape}
 */
export type NullShape = {

	/**
	 * Discriminator identifying this as an absent value.
	 */
	readonly kind: "null";

};


//// Type Inference ////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Extracts the complete template declared by a shape.
 *
 * Returns the full structural description of the shape's template side, with every declared
 * property present and cardinality-driven optionality carried on the value types. Produced by
 * the runtime {@link model} helper and consumed wherever the authoritative template is
 * required, notably {@link State} projection and inheritance override checking.
 *
 * @typeParam S The lazy {@link Shape} to extract from
 */
export type Schema<S extends Lazy<Shape>> =
	Resolved<S>["model"];

/**
 * Projects a shape to the runtime value type its values satisfy.
 *
 * Required properties are present on every value; optional and multi-valued properties may be
 * `undefined`. Use to annotate retrieved resources, mutation payloads, and any runtime instance
 * the shape constrains. Pair with {@link Schema} when both the template and the values
 * satisfying it are needed.
 *
 * @typeParam S The lazy {@link Shape} to extract from
 */
export type State<S extends Lazy<Shape>> =
	Instance<Schema<S>>;


/**
 * Narrows the {@link Eager} unwrap of a {@link Lazy} shape to the {@link Shape} constraint, so
 * downstream indexed access stays sound.
 *
 * @typeParam S The lazy {@link Shape} to resolve
 */
export type Resolved<S extends Lazy<Shape>> =
	Eager<S> extends Shape ? Eager<S> : never;

/**
 * Unwraps a tuple of {@link UnionShape} branches to their eagerly-resolved {@link ValueShape} types.
 *
 * Resolves each lazy factory in a union's branch tuple to its underlying shape, preserving
 * position and arity for the indexed projections that union-typed template slots rely on.
 * Internal helper used by union shape construction.
 *
 * @typeParam V The tuple of union branches (eager or lazy) to resolve
 */
export type Variants<V extends readonly Lazy<ValueShape>[]> = {

	readonly [K in keyof V]: V[K] extends Lazy<infer T extends ValueShape> ? T
		: V[K] extends ValueShape ? V[K]
			: never;

};

/**
 * Conditions a shape's model on cardinality bounds to produce the template-side value type.
 *
 * Pairs a value or union shape with its cardinality bounds to yield the type that the matching
 * {@link SetShape.model | template slot} carries: the bare model value for scalar ranges
 * (`maxCount === 1`), a singleton tuple for multi-valued ranges, unioned with `undefined`
 * whenever the minimum cardinality permits absence. {@link TextShape | Text} shapes
 * project to a tag-keyed map — a single-string-per-tag map for scalar cardinality and a
 * string-array-per-tag map for multi-valued cardinality; when the model declares a specific tag set (for example
 * `text({ en: "" })`), the map narrows to that key set so undeclared tags are rejected,
 * falling back to the open {@link TagRange}-indexed map when the model is unconstrained. Reach
 * for `Bounds` when a test or derived type needs to spell out the exact template type of a
 * property; for runtime values, use {@link State}.
 *
 * @typeParam S The lazy {@link Shape} to extract from
 * @typeParam L The {@link SetShape.minCount | minCount} conditioning the projection
 * @typeParam U The {@link SetShape.maxCount | maxCount} conditioning the projection
 */
export type Bounds<
	S extends Lazy<Shape>,
	L extends undefined | number,
	U extends undefined | number
> =
	S extends Lazy<infer T extends Shape>
		? (L extends undefined | 0 ? undefined : never) | (
		T extends TextShape
			? { readonly [K in keyof T["model"] & string]: Boxed<string, U> }
			: Boxed<T["model"], U>
		)
		: never;

/**
 * Boxes a value in a singleton tuple when cardinality admits multiple values.
 *
 * Yields the bare `V` for scalar ranges (`U extends 1`) and a `readonly [V]` singleton tuple
 * for unbounded or multi-valued ranges, encoding the scalar-or-tuple axis shared by every
 * {@link Bounds} arm so each call site can stay agnostic to cardinality.
 *
 * @typeParam V The underlying value type
 * @typeParam U The {@link SetShape.maxCount | maxCount} conditioning the projection;
 *     `1` yields the bare value, any other number or `undefined` yields the tuple form
 */
export type Boxed<V, U extends undefined | number> =
	U extends 1 ? V : readonly [V];


//// Factories /////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a union of value shapes.
 *
 * Variants act as alternatives during validation: a value satisfies the union if it satisfies at least one variant.
 * Variant order is preserved deterministically: it drives indexed `model` keys (`{"0": ..., "1": ...}`), positional
 * trace-error reporting, and the subsequence rule that gates narrowing in extending shapes (see {@link UnionShape} for
 * the full inheritance contract).
 *
 * Variants are grouped by *discriminator* (`kind` for `boolean` / `text`; `(kind, datatype)` for `string` / `number`;
 * `(kind, class)` for `reference` / `resource`), so a parent declaring
 * `union(reference(Person), reference(Organization))` exposes two distinct discriminator groups, and an extending shape
 * may narrow each independently. Variants sharing a
 * discriminator (for example two same-datatype `string` variants) collapse into one group at extends-time and must be
 * retained together or dropped together.
 *
 * @typeParam V The variants tuple type
 *
 * @param variants The variant shapes
 *
 * @returns An immutable union with the specified variants
 *
 * @throws {TypeError} If any variant is a {@link text!text | text} shape; localised text is a whole-property
 *     type and is never a union variant, retrieved through the standalone locale placeholder instead
 *
 * @example
 *
 * ```typescript
 * const address = optional(union(
 *   string(),
 *   reference(PostalAddress)
 * ));
 * ```
 *
 * @see {@link UnionShape} for the variant-narrowing inheritance forms (single-variant narrowing, union subsetting)
 * @see {@link https://www.w3.org/TR/shacl/#OrConstraintComponent SHACL § 4.7.2 sh:or}
 */
export function union<
	V extends readonly [Lazy<ValueShape>, ...Lazy<ValueShape>[]]
>(...variants: V): UnionShape<Variants<V>> {

	const resolved = variants.map(eager) as Variants<V>;

	// localised text is a whole-property type, never a union variant: a single language map cannot
	// mix into the property's value set alongside the literals, references, and resources of the
	// other branches; localised properties are obtained through the standalone locale placeholder

	if ( resolved.some((variant: ValuesShape) => variant.kind === "text") ) {

		throw new TypeError("unexpected <text> variant in union");

	}

	return immutable({

		kind: "union",

		model: Object.fromEntries(resolved.map((v: ValuesShape, i: number) => [`${i}`, v.model])),

		variants: resolved

	}) as UnionShape<Variants<V>>;

}


/**
 * Creates a {@link SetShape} with no cardinality constraints (0..*).
 *
 * Allows zero or more values, resulting in an optional array type (`undefined | readonly V[]`).
 * Accepts an optional {@link @metreeca/qest!Selection | Selection} that is silently merged
 * into the runtime model.
 *
 * > [!WARNING]
 * > For {@link TextShape | text} shapes, each tag in the map holds a string array.
 * > `minCount`/`maxCount` apply **per tag**, not as an aggregate across all tags. This differs from
 * > vanilla SHACL aggregate counting, though expressible via per-tag property shapes.
 *
 * @typeParam S The {@link Lazy} {@link Shape} type
 *
 * @param shape The {@link Lazy} {@link Shape} to constrain
 * @param selection Optional {@link @metreeca/qest!Selection | Selection} to merge into the model
 *
 * @returns An immutable {@link SetShape} with no minimum or maximum count
 */
export function multiple<S extends Lazy<Shape>>(shape: S, selection?: Selection): SetShape<S, undefined, undefined> {

	return cardinality(undefined, undefined)(shape, selection);

}

/**
 * Creates a {@link SetShape} requiring at least one value (1..*).
 *
 * Requires one or more values, resulting in a non-empty array type (`readonly [V, ...V[]]`).
 * Accepts an optional {@link @metreeca/qest!Selection | Selection} that is silently merged
 * into the runtime model.
 *
 * > [!WARNING]
 * > For {@link TextShape | text} shapes, each tag in the map holds a non-empty string
 * > array and the map must contain at least one tag. `minCount`/`maxCount` apply **per tag**, not as
 * > an aggregate across all tags. This differs from vanilla SHACL aggregate counting, though
 * > expressible via per-tag property shapes.
 *
 * @typeParam S The {@link Lazy} {@link Shape} type
 *
 * @param shape The {@link Lazy} {@link Shape} to constrain
 * @param selection Optional {@link @metreeca/qest!Selection | Selection} to merge into the model
 *
 * @returns An immutable {@link SetShape} with minCount=1 and no maximum count
 */
export function repeatable<S extends Lazy<Shape>>(shape: S, selection?: Selection): SetShape<S, 1, undefined> {

	return cardinality(1, undefined)(shape, selection);

}

/**
 * Creates a {@link SetShape} for at most one value (0..1).
 *
 * Allows zero or one value, resulting in an optional scalar type (`undefined | V`).
 * For {@link TextShape | text} shapes, accepts an optional
 * {@link @metreeca/qest!Selection | Selection} that is silently merged into the runtime model.
 *
 * > [!WARNING]
 * > For {@link TextShape | text} shapes, each tag in the map holds a single string.
 * > `minCount`/`maxCount` apply **per tag**, not as an aggregate across all tags. This differs from
 * > vanilla SHACL aggregate counting, though expressible via per-tag property shapes.
 *
 * @typeParam S The {@link Lazy} {@link Shape} type
 *
 * @param shape The {@link Lazy} {@link Shape} to constrain
 * @param selection Optional {@link @metreeca/qest!Selection | Selection} to merge into the model
 *     (accepted only for {@link TextShape | text} shapes)
 *
 * @returns An immutable {@link SetShape} with no minimum count and maxCount=1
 */
export function optional<S extends Lazy<Shape>>(shape: S, selection?: SetSelection<S, 1>): SetShape<S, undefined, 1> {

	return cardinality(undefined, 1)(shape, selection);

}

/**
 * Creates a {@link SetShape} for exactly one value (1..1).
 *
 * Requires exactly one value, resulting in a required scalar type (`V`).
 * For {@link TextShape | text} shapes, accepts an optional
 * {@link @metreeca/qest!Selection | Selection} that is silently merged into the runtime model.
 *
 * > [!WARNING]
 * > For {@link TextShape | text} shapes, each tag in the map holds exactly one string and
 * > the map must contain at least one tag. `minCount`/`maxCount` apply **per tag**, not as an
 * > aggregate across all tags. This differs from vanilla SHACL aggregate counting, though
 * > expressible via per-tag property shapes.
 *
 * @typeParam S The {@link Lazy} {@link Shape} type
 *
 * @param shape The {@link Lazy} {@link Shape} to constrain
 * @param selection Optional {@link @metreeca/qest!Selection | Selection} to merge into the model
 *     (accepted only for {@link TextShape | text} shapes)
 *
 * @returns An immutable {@link SetShape} with minCount=1 and maxCount=1
 */
export function required<S extends Lazy<Shape>>(shape: S, selection?: SetSelection<S, 1>): SetShape<S, 1, 1> {

	return cardinality(1, 1)(shape, selection);

}

/**
 * Creates a {@link SetFactory} with custom cardinality constraints.
 *
 * Returns a {@link SetFactory} that wraps a shape into a {@link SetShape} with the specified
 * bounds. The returned factory accepts an optional
 * {@link @metreeca/qest!Selection | Selection} when the shape inherently represents a
 * collection — either because the upper bound is not `1` or because the shape is a
 * {@link TextShape | Text}. For a multi-valued shape the selection is paired with the
 * element model as the second slot of a two-element `[element, Selection]` tuple, the collection
 * form of the {@link @metreeca/qest!Query | Query} grammar; a {@link TextShape | Text}
 * model merges the selection into its language map.
 *
 * @typeParam L The minimum count constraint type
 * @typeParam U The maximum count constraint type
 *
 * @param lower Minimum number of expected values
 * @param upper Maximum number of expected values
 *
 * @returns An immutable {@link SetFactory} with the specified cardinality bounds
 *
 * @throws TypeError If `lower` or `upper` is negative, or if `lower` exceeds `upper`
 *
 * @example
 *
 * ```typescript
 * const twoToFive = cardinality(2, 5);
 * const tags = twoToFive(string());
 * const items = cardinality(0, 100)(resource(ItemShape), { "#": 25 });
 * ```
 */
export function cardinality<
	L extends undefined | number,
	U extends undefined | number = undefined
>(
	lower: L,
	upper?: U
): SetFactory<L, U> {

	if ( lower !== undefined && lower < 0 ) {
		throw new TypeError(`expected non-negative minCount <${lower}>`);
	}

	if ( upper !== undefined && upper < 0 ) {
		throw new TypeError(`expected non-negative maxCount <${upper}>`);
	}

	if ( lower !== undefined && upper !== undefined && lower > upper ) {
		throw new TypeError(`inconsistent bounds <${lower}> > <${upper}>`);
	}

	return (<S extends Lazy<Shape>>(shape: S, selection?: Selection) => {

		const resolved = eager(shape);

		const model = resolved.kind === "text"
			? {
				...Object.fromEntries(Object.entries(resolved.model).map(([key, value]) =>
					[key, upper === 1 ? value : [value]]
				)),
				...selection
			}
			: upper === 1 ? resolved.model
				: selection === undefined ? [resolved.model]
					: [resolved.model, selection];

		return immutable({

			kind: "set",
			model: model as Bounds<S, L, U>,

			minCount: lower,
			maxCount: upper,

			shape: resolved as Shape & { readonly model: State<S> }

		});

	}) as SetFactory<L, U>;

}


//// Utilities /////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves a {@link Lazy} shape to its eager form, caching the result on repeated calls.
 *
 * When given a factory, evaluates it on first call and caches the outcome; subsequent calls
 * return the cached shape. {@link ResourceShape | Resource} shapes are flattened during
 * resolution; other shapes pass through unchanged.
 *
 * @typeParam S The {@link Lazy} {@link Shape} type
 *
 * @param shape A shape value or no-arg factory returning one
 *
 * @returns The eager shape, with resource shapes flattened
 *
 * @throws {TraceError} If the factory transitively references itself, producing a circular extends chain
 */
export function eager<S extends Lazy<Shape>>(shape: S): Resolved<S> {

	if ( isFunction(shape) ) {

		const cached = cache.get(shape);

		if ( cached === null ) {

			throw new TraceError("circular extends chain", {
				[shape.name || "<anonymous>"]: "circular dependency"
			});

		} else if ( cached === undefined ) {

			cache.set(shape, null);

			try {

				const resolved = shape();
				const flattened = (resolved.kind === "resource" ? flatten(resolved) : resolved);

				cache.set(shape, flattened);

				return flattened as Resolved<S>;

			} catch ( error ) {

				cache.delete(shape);

				throw error;

			}

		} else {

			return cached as Resolved<S>;

		}

	} else {

		return (shape.kind === "resource" ? flatten(shape) : shape) as Resolved<S>;

	}

}

/**
 * Extracts the deeply typed retrieval template from a {@link Lazy} value or union shape.
 *
 * Resolves the shape eagerly and returns its stored `model`, providing an ergonomic shortcut for
 * obtaining a typed template without explicit field access. The return type is computed by
 * {@link Schema}, which preserves cardinality-driven optionality, nested resource models,
 * and union variants in full structural detail.
 *
 * @typeParam S The lazy {@link Shape} to extract from
 *
 * @param shape The shape (or lazy factory) whose model to extract
 *
 * @returns The shape's stored model
 */
export function model<S extends Lazy<Shape>>(shape: S): Schema<S> {

	return eager(shape).model;

}

/**
 * Apply a {@link Probe} to a shape, resolving the effective {@link RangeShape}.
 *
 * Traverses the {@link Probe.path} segments through nested resource properties to locate the target shape, then
 * applies
 * the {@link Probe.pipe} transforms to compute the effective value set with accumulated cardinality.
 *
 * **Shape dispatch:**
 *
 * - {@link ResourceShape}: traverses path segments through nested properties
 * - {@link ReferenceShape}: eagerly resolves the lazy target shape, then proceeds as for {@link ResourceShape}
 * - {@link UnionShape}: seeds traversal with each variant, then proceeds as for the per-variant shape
 * - Other shapes: any non-empty path fails resolution; the empty path applies the transform pipe directly
 *
 * **Path traversal** — at each step, flattens inheritance and looks up the next property. Unknown properties cause
 * the path to fail. At {@link UnionShape} boundaries (either at the entry or encountered as a property range),
 * variants lacking the property are skipped; the path fails only when no variant defines it. Mid-path traversal past
 * an `id` or `type` field fails as an `"undefined property path"`, since these resolve to scalar IRIs with no
 * traversable structure; terminal `id`/`type` access remains valid.
 *
 * **Pipe application** — applies transforms to the shape resolved by path traversal, reducing each active variant
 * independently when multiple remain. A pipe composing more than one aggregate transform is rejected upfront as
 * `"multiple aggregate transforms"`, independently of the resolved shape. A non-empty pipe is coalesced access to a
 * localised leaf: a text shape contributes the winning tag's value(s) as an ordinary `xsd:string` for domain matching
 * and effective typing, at the leaf's per-tag cardinality (one value for single-string-per-tag, the winning tag's set
 * for array-per-tag). Among processing-space literals (boolean,
 * numeric, plain or temporal string), type compatibility is not a well-formedness condition: a transform applied to a
 * literal outside its declared domain is never an error, it simply drops the offending variant, and when no variant
 * survives the probe resolves to a {@link NullShape} (a known absent value), or, for a total
 * aggregate, to its empty-set value (`0`). The same leniency extends to values outside the processing space
 * (references and resources) which no transform other than `count` can act on, so they too drop
 * rather than erroring. The `count` aggregate accepts any
 * value, references included; `min` and `max` accept the literal processing types (boolean,
 * numeric, string, temporal); the remaining transforms accept their declared processing type only. `avg` always yields
 * a `decimal`: the specification narrows its range to `float` for `float` input and `double` for `double` input, but
 * that processing-space distinction is not preserved on egress, so the effective type is reported uniformly as
 * `decimal`.
 *
 * **Cardinality** — per-step constraints combine multiplicatively within a branch and by envelope
 * across sibling branches:
 *
 * - *Within a branch* — `minCount` and `maxCount` are the products of per-step bounds; either becomes
 *   `undefined` if any step has that bound undefined. A `0` product stands (for `minCount` an
 *   equivalent encoding of "no lower bound", for `maxCount` the strongest upper bound).
 * - *Across branches* — at entry-union or mid-path union-range crossings, the effective bounds
 *   are the envelope of per-branch products: `minCount` takes the lowest lower bound (`undefined`
 *   absorbs — no lower bound wins), `maxCount` takes the highest upper bound (`undefined` absorbs
 *   — unbounded wins). Matches SHACL `sh:or` — a value satisfies the union if at least one branch
 *   accepts it.
 * - {@link UnionShape} steps themselves contribute no per-step cardinality — the enclosing range
 *   carries the single cardinality shared by all variants.
 * - A **localised step** enters the product like any other: a text property is terminal (no path may
 *   traverse past it) and contributes its per-tag bounds (`maxCount` of `1` for single-string-per-tag,
 *   unbounded for array-per-tag), which multiply into the branch product. A single-string-per-tag leaf
 *   is single-valued on its own, but a multi-valued prefix multiplies through, so a deep coalescible
 *   key is correctly multi-valued for the sort/focus single-valued gates while matching and filtering
 *   stay cardinality-agnostic.
 * - A non-empty pipe sets `minCount` to `1` for the total aggregates `count` and `sum`, which always
 *   yield a value (`0` on the empty set), and to `undefined` for every other transform; scalar transforms
 *   preserve `maxCount`; aggregate transforms set `maxCount` to `1`.
 *
 * @param probe The probe containing property path and transform pipe
 * @param shape The {@link Shape} to inspect
 *
 * @returns A {@link RangeShape} effective type carrying the accumulated cardinality and the reachable value-shape
 *     variants when the probe resolves; a {@link NullShape} when the probe is accepted but provably resolves to no
 *     value (every surviving variant falling outside its transforms' declared domains). Returns an atomic
 *     {@link Trace} string when the probe cannot be resolved against the shape: `"undefined property path"` if the
 *     path fails to resolve (including a step past a non-traversable `id` / `type` field), or `"multiple aggregate
 *     transforms"` if the pipe composes more than one aggregate transform
 *
 * @throws {TypeError} If `probe` is not a well-formed {@link Probe} (a malformed `path`/`pipe`, or a `pipe`
 *     referencing an unknown transform)
 *
 * @see {@link https://metreeca.github.io/qest/documents/model.Model_Design.html Model Design}
 */
export function apply(probe: Probe, shape: Lazy<Shape>): RangeShape | NullShape | Extract<Trace, string> {

	type Branch = {

		readonly minCount?: number
		readonly maxCount?: number

		readonly variant: ValuesShape

	}


	// defensive: a hand-built probe may carry an unknown transform or a malformed path/pipe, which would
	// otherwise surface as a runtime crash deep in the pipe; reject it up front

	const { pipe, path } = assert(probe, isProbe, "malformed probe");

	const entry = eager(shape);

	return transform(traverse(
		entry.kind === "union" ? entry.variants.map(eager)
			: entry.kind === "reference" ? [eager(entry.shape)]
				: [entry]
	));


	/**
	 * Traverse the property path, enveloping per-branch cumulative cardinalities.
	 *
	 * Folds the path into a cohort of single-variant branches — each one carrying its own path
	 * cumulative `{min,max}` — by flat-mapping each branch's resolved variants at every segment.
	 * Branches that lack the next property are dropped; `id` / `type` fields resolve to scalar IRIs
	 * with no traversable structure, so a path stepping past them drops as well. A localised step
	 * multiplies its per-tag bounds into the branch product like any other step (see the cardinality
	 * rules on {@link apply}). The surviving cohort is then enveloped (SHACL `sh:or`) into a single
	 * focus; an exhausted cohort yields `"undefined property path"`.
	 */
	function traverse(seed: readonly ValuesShape[]): RangeShape | Extract<Trace, string> {

		const branches = path.reduce<readonly Branch[]>((branches, segment) =>

				branches.flatMap(branch => {

					const resolved = resolve(branch.variant, segment);

					return resolved === undefined ? [] // skip branches that lack the property
						: resolved.variants.map(variant => ({
							minCount: multiply(branch.minCount, resolved.minCount),
							maxCount: multiply(branch.maxCount, resolved.maxCount),
							variant
						}));

				}),

			seed.map(variant => ({ minCount: 1, maxCount: 1, variant }))
		);

		return branches.length === 0 ? "undefined property path" : {

			kind: "range",

			minCount: branches.map(branch => branch.minCount).reduce(min),
			maxCount: branches.map(branch => branch.maxCount).reduce(max),

			variants: branches.map(branch => branch.variant)

		};

	}

	/**
	 * Resolve a single property step, returning its cardinality and value shape variants.
	 */
	function resolve(shape: ValuesShape, property: Identifier): undefined | RangeShape {

		const resolved = shape.kind === "resource" ? shape
			: shape.kind === "reference" ? eager(shape.shape)
				: undefined;

		const properties = resolved !== undefined
			? resolved.properties
			: undefined;

		if ( properties === undefined ) {

			return undefined; // non-traversable leaf type: skip in union context

		} else {

			// gate lookup to own keys: prevents JSON-derived identifiers like __proto__,
			// constructor, toString from leaking into Object.prototype during resolution

			const entry = Object.hasOwn(properties, property) ? properties[property] : undefined;

			if ( entry === undefined ) {

				return undefined; // undefined property: resolution fails

			} else if ( entry.kind === "id" || entry.kind === "type" ) {

				// id / type fields resolve to a scalar absolute IRI with no traversable structure

				return {

					kind: "range",

					maxCount: 1,

					variants: [iri({ variant: "absolute" })]

				};

			} else {

				const { range } = entry;

				return {

					kind: "range",

					minCount: range.minCount,
					maxCount: range.maxCount,

					variants: range.shape.kind === "union"
						? range.shape.variants
						: [range.shape]

				};

			}

		}

	}

	/**
	 * Lowest lower bound across optional minimums; `undefined` absorbs — no lower bound wins.
	 */
	function min(a: number | undefined, b: number | undefined): number | undefined {

		return a === undefined || b === undefined ? undefined : Math.min(a, b);

	}

	/**
	 * Highest upper bound across optional maximums; `undefined` absorbs — unbounded wins.
	 */
	function max(a: number | undefined, b: number | undefined): number | undefined {

		return a === undefined || b === undefined ? undefined : Math.max(a, b);

	}

	/**
	 * Multiply optional cardinalities; `undefined` propagates, otherwise the product stands (including a
	 * `0`: the strongest upper bound for `maxCount`, an equivalent "no lower bound" for `minCount`).
	 */
	function multiply(a: number | undefined, b: number | undefined): number | undefined {

		return a === undefined || b === undefined ? undefined : a*b;

	}


	/**
	 * Apply the transform pipe to each variant, adjusting cardinality and assembling the effective value set.
	 *
	 * Forwards atomic traces from the upstream traversal unchanged; rejects a pipe composing more than one aggregate
	 * transform as `"multiple aggregate transforms"`. A non-empty pipe coalesces localised variants first: a text
	 * variant is replaced by its coalesced `xsd:string` view (the winning tag's value(s)) at its per-tag cardinality.
	 * When no variant resolves to a value set, yields the total aggregate's empty-set value (`0`) if the pipe applies
	 * one, otherwise a {@link NullShape}: every surviving variant having fallen outside its transforms' declared
	 * domains.
	 */
	function transform(focus: RangeShape | Extract<Trace, string>): RangeShape | NullShape | Extract<Trace, string> {

		if ( isString(focus) ) {

			return focus;

		} else if ( pipe.filter(name => Transforms[name].aggregate !== false).length > 1 ) {

			return "multiple aggregate transforms";

		} else {

			// a non-empty pipe is coalesced access to a localised leaf: a text variant contributes the
			// winning tag's value(s) as an ordinary xsd:string, the cardinality flowing through unchanged

			const staged = pipe.length === 0 ? focus.variants
				: focus.variants.map(shape => shape.kind === "text" ? string() : shape);

			const successes = staged
				.map(shape => pipe.reduceRight(stage, shape))
				.filter(shape => shape !== undefined);

			if ( successes.length > 0 ) {

				const piped = pipe.length > 0;
				const total = pipe.some(name => Transforms[name].aggregate === "total");
				const aggregate = pipe.some(name => Transforms[name].aggregate !== false);

				return {

					kind: "range",

					minCount: !piped ? focus.minCount : total ? 1 : undefined,
					maxCount: aggregate ? 1 : focus.maxCount,

					variants: successes

				};

			} else if ( pipe.some(name => Transforms[name].aggregate === "total") ) {

				// a total aggregate over an all-out-of-domain input still yields its empty-set value
				// (`0`); the scalar transforms wrapping the aggregate then apply to that integer base

				const wrapping = pipe.slice(0, pipe.findIndex(name => Transforms[name].aggregate !== false));
				const result = wrapping.reduceRight(stage, integer());

				return result !== undefined
					? { kind: "range", minCount: 1, maxCount: 1, variants: [result] }
					: { kind: "null" };

			} else {

				return { kind: "null" };

			}
		}

	}

	/**
	 * Applies one transform to the running pipe state, dropping the value to `undefined` once it falls
	 * outside a transform's declared domain.
	 */
	function stage(state: undefined | ValuesShape, transformType: Transform): undefined | ValuesShape {

		if ( state === undefined ) { return undefined; } else {

			const transform = Transforms[transformType];

			return accepts(transform.accepts, state) ? produce(transform.returns, state) : undefined;

		}

	}

	/**
	 * Resolve a transform's output shape from its declared return type.
	 */
	function produce(returns: (typeof Transforms)[Transform]["returns"], state: ValuesShape): ValuesShape {

		return returns === "same" ? state
			: returns === "integer" ? integer()
				: returns === "decimal" ? decimal()
					: returns === "string" ? string()
						: error<ValuesShape>(`unsupported transform output type '${returns}'`);

	}

	/**
	 * Whether a shape lies within a transform's declared input domain.
	 *
	 * `"any"` admits every shape (so `count` accepts references); `"literal"` admits the
	 * boolean, numeric, string, and temporal processing types; the remaining domains each admit a single
	 * processing type. Any shape
	 * outside the matched domain (references and resources included) fails, dropping the
	 * value to `undefined`. Localised text never reaches the domain check: {@link transform} coalesces text
	 * variants to their `xsd:string` view before staging.
	 */
	function accepts(domain: (typeof Transforms)[Transform]["accepts"], shape: ValuesShape): boolean {

		return domain === "any" ? true
			: domain === "literal" ? isLiteral(shape)
				: domain === "numeric" ? isNumeric(shape)
					: domain === "string" ? isTextual(shape)
						: domain === "temporal" ? isTemporal(shape)
							: false;

	}


	function isLiteral(shape: ValuesShape) {
		return shape.kind === "boolean" || shape.kind === "number" || shape.kind === "string";
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

}
