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
 * - {@link ValuesShape} — value shapes plus localised {@link DictionaryShape} language-tagged maps
 * - {@link ValueShape} — the concrete value shapes:
 *   - {@link BooleanShape} — boolean values
 *   - {@link NumberShape} — numeric values
 *   - {@link StringShape} — textual values
 *   - {@link ReferenceShape} — resource references
 *   - {@link ResourceShape} — linked data resources
 * - {@link UnionShape} — a disjunction of value-shape variants for a polymorphic value
 * - {@link SetShape} — a cardinality-constrained value set
 * - {@link RangeShape} — value range a {@link Probe} resolves to via {@link effective}: bounds and variants
 *
 * <img src="value.svg" alt="Shape hierarchy" style="width: 100%" />
 *
 * **Type Inference**
 *
 * Two companion types project a shape into the relevant TypeScript view:
 *
 * - {@link Schema} — the complete template declared by the shape, describing every property and
 *   carrying cardinality-driven optionality both on the value types and, for properties admitting
 *   absence, as an optional key (template side).
 * - {@link State} — the runtime state value matching the template, recovered through the
 *   {@link @metreeca/qest!Instance | Instance}; members admitting absence may be `undefined` or
 *   omitted outright (state side).
 *
 * Ancillary helpers {@link Resolved}, {@link Bounds}, and {@link Boxed}
 * factor the internal projections (narrowing the eager unwrap of a {@link Lazy} shape to the
 * {@link Shape} or {@link RangeShape} bound, resolving union branches, conditioning a shape's model on cardinality,
 * and boxing values into singleton tuples for multi-valued ranges) and are exported for tests
 * and downstream shape extensions.
 *
 * **Utilities**
 *
 * - {@link eager} resolves a {@link Lazy} shape factory to its concrete {@link Shape}, caching
 *   results and flattening {@link ResourceShape} members; a resolved {@link RangeShape} passes
 *   through unchanged.
 * - {@link model} extracts the runtime {@link Schema} of a shape, an ergonomic shortcut for
 *   `eager(shape).model`.
 * - {@link effective} resolves the effective {@link RangeShape} type for a {@link Probe} against a
 *   {@link Shape}, or re-probes a previously resolved {@link RangeShape} whose bounds compose into
 *   the traversal, walking property paths through nested resources, branching across
 *   {@link UnionShape} variants at the entry or at any property range, and applying each
 *   transform pipe stage. It yields an atomic {@link Trace} string when the probe cannot
 *   be resolved or its transform pipe cannot be applied to any resolved variant.
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/shacl/ SHACL - Shapes Constraint Language}
 */

import { type Eager, type Lazy } from "@metreeca/core";
import { TagRange } from "@metreeca/core/language";
import { immutable } from "@metreeca/core/structures";

import type { Trace } from "@metreeca/core/trace";
import { type Instance, type Probe } from "@metreeca/qest/template";
import type { BooleanShape } from "./boolean.js";
import type { DictionaryShape } from "./dictionary.js";
import { type NumberShape } from "./number.js";
import type { ReferenceShape } from "./reference.js";
import type { ResourceShape } from "./resource.js";
import { type StringShape } from "./string.js";
import type { UnionShape } from "./union.js";
import { eager, effective, model } from "./value.core.js";

export { eager, effective, model };


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
 * Extends {@link ValueShape} with {@link DictionaryShape}, whose language-map semantics inherently describe
 * a set of values regardless of cardinality.
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.2 Node Shapes}
 */
export type ValuesShape =
	| ValueShape
	| DictionaryShape;

/**
 * Discriminated union of value shapes that may describe either a scalar or a set.
 *
 * @see {@link ValuesShape}
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.2 Node Shapes}
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
 * Pairs a {@link Shape} with {@link SetShape.minCount | minCount} /
 * {@link SetShape.maxCount | maxCount} constraints that bound the expected number of values. Carried as the range of
 * a {@link resource!Property | property}, whose factories fix the bounds: the named
 * {@link resource!required | required}, {@link resource!optional | optional},
 * {@link resource!nonempty | nonempty} and {@link resource!multiple | multiple}, or
 * {@link resource!property | property} for an arbitrary pair.
 *
 * **Usage**
 *
 * ```typescript
 * import { multiple, nonempty, optional, property, required } from '@metreeca/blue/resource';
 * import { string } from '@metreeca/blue/string';
 * import { integer } from '@metreeca/blue/number';
 *
 * required(string())    // minCount=1, maxCount=1 → exactly one string
 * optional(integer())   // minCount=undefined, maxCount=1 → zero or one integer
 * nonempty(string())    // minCount=1, maxCount=undefined → one or more strings
 * multiple(string())    // minCount=undefined, maxCount=undefined → zero or more strings
 * property(string(), { minCount: 2, maxCount: 5 }) // custom range
 * ```
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link resource!ResourceShape.parents | parents}, each
 * set shape is merged according to the following rules.
 *
 * | Field      | Override Rule                                                                              |
 * | ---------- | ------------------------------------------------------------------------------------------ |
 * | `kind`     | Cannot be overridden                                                                       |
 * | `minCount` | Child ≥ parent, narrowing the minimum cardinality                                          |
 * | `maxCount` | Child ≤ parent, narrowing the maximum cardinality                                          |
 * | `shape`    | `kind` must match; a non-union child may narrow a {@link UnionShape | union} parent to one |
 *
 * A child holding a nested resource or a {@link reference!ReferenceShape | reference} refines the slot by naming a
 * target that extends the inherited target: the refining target carries the inherited definition through its own
 * inheritance chain, which is never restated.
 *
 * **Cross-Field Validation**
 *
 * - merged `minCount` must be ≤ merged `maxCount`
 *
 * @typeParam S The wrapped shape, eager or a {@link Lazy} factory for recursive self-reference
 * @typeParam L The {@link SetShape.minCount | minCount} constraint type
 * @typeParam U The {@link SetShape.maxCount | maxCount} constraint type
 *
 * @see {@link https://www.w3.org/TR/shacl/#MinCountConstraintComponent SHACL § 4.2.1 sh:minCount}
 * @see {@link https://www.w3.org/TR/shacl/#MaxCountConstraintComponent SHACL § 4.2.2 sh:maxCount}
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
	 * Scalar value sets hold the shape model directly; multi-valued sets hold a singleton `[element]` tuple.
	 * {@link DictionaryShape | Dictionary} shapes always hold a single language map because cardinality
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
	 * @see {@link https://www.w3.org/TR/shacl/#MinCountConstraintComponent SHACL § 4.2.1 sh:minCount}
	 */
	readonly minCount?: L;

	/**
	 * Maximum number of expected values.
	 *
	 * **Inheritance** — child value must be ≤ parent value, narrowing the maximum cardinality.
	 *
	 * @defaultValue `undefined` (no maximum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxCountConstraintComponent SHACL § 4.2.2 sh:maxCount}
	 */
	readonly maxCount?: U;


	/**
	 * The constrained value shape, or a union of value shapes for polymorphic values.
	 *
	 * **Inheritance** — child `shape.kind` must match parent `shape.kind`, with one exception: when parent is a
	 * {@link UnionShape | union}, child may supply a non-union value shape that narrows exactly one parent variant
	 * (single-variant narrowing). A nested resource or {@link reference!ReferenceShape | reference} child may name a
	 * target extending the inherited target, refining what the slot admits without restating the inherited definition.
	 * Otherwise delegated to value shape or {@link UnionShape | union} merge rules.
	 */
	readonly shape: Shape & { readonly model: State<S> };

};


/**
 * Resolved value range of a {@link Probe}.
 *
 * Carries the cardinality bounds ({@link RangeShape.minCount | minCount} / {@link RangeShape.maxCount | maxCount})
 * accumulated across the traversed steps, and {@link RangeShape.variants | variants}: the value shapes the path can
 * reach, a never-empty disjunction over the dictionary-including {@link ValuesShape} alphabet. The `"range"`
 * {@link RangeShape.kind | kind} distinguishes a resolved range from the atomic {@link Trace} string an
 * {@link effective} result otherwise carries.
 *
 * > [!NOTE]
 * > A path can reach a mix no declared shape expresses: for `creator.name` with `creator: union(Person,
 * > Organization)`, `Person.name: string()`, `Organization.name: dictionary()`, it reaches both string and
 * > dictionary, which a declared property cannot hold (a value-variant union and whole-property dictionary never
 * > combine).
 *
 * @see {@link effective}
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


//// Type Inference ////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Extracts the complete template declared by a shape.
 *
 * Returns the full structural description of the shape's template side, describing every declared
 * property and carrying cardinality-driven optionality both on the value types and, for properties
 * admitting absence, as an optional key. Produced by the runtime {@link model} helper and consumed
 * wherever the authoritative template is required, notably {@link State} projection and inheritance
 * override checking.
 *
 * @typeParam S The lazy {@link Shape} to extract from
 */
export type Schema<S extends Lazy<Shape>> =
	Resolved<S>["model"];

/**
 * Projects a shape to the runtime value type its values satisfy.
 *
 * Required members are present on every value; optional and multi-valued members may be `undefined`
 * and may equally be omitted, so a value literal spells out only the members it carries, whether
 * declared locally or inherited. Use to annotate retrieved resources, mutation payloads, and any
 * runtime instance the shape constrains. Pair with {@link Schema} when both the template and the
 * values satisfying it are needed.
 *
 * @typeParam S The lazy {@link Shape} to extract from
 */
export type State<S extends Lazy<Shape>> =
	Instance<Schema<S>>;


/**
 * Narrows the {@link Eager} unwrap of a {@link Lazy} shape to the {@link Shape} or {@link RangeShape} constraint, so
 * downstream indexed access stays sound.
 *
 * @typeParam S The lazy {@link Shape} or {@link RangeShape} to resolve
 */
export type Resolved<S extends Lazy<Shape | RangeShape>> =
	Eager<S> extends Shape | RangeShape ? Eager<S> : never;

/**
 * Conditions a shape's model on cardinality bounds to produce the template-side value type.
 *
 * Pairs a value or union shape with its cardinality bounds to yield the type that the matching
 * {@link SetShape.model | template slot} carries: the bare model value for scalar ranges
 * (`maxCount === 1`), a singleton tuple for multi-valued ranges, unioned with `undefined`
 * whenever the minimum cardinality permits absence. {@link DictionaryShape | Dictionary} shapes
 * project to a tag-keyed map — a single-string-per-tag map for scalar cardinality and a
 * string-array-per-tag map for multi-valued cardinality; when the model declares a specific tag set (for example
 * `dictionary({ en: "" })`), the map narrows to that key set so undeclared tags are rejected,
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
		T extends DictionaryShape
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
