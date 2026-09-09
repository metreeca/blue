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
 * Union shape and factories.
 *
 * Defines {@link UnionShape} and the {@link union} factory used to declare a polymorphic property that accepts more
 * than one value type, as an *exclusive* disjunction (`sh:xone`) of value-shape variants. The variants are mutually
 * exclusive alternatives, matched in two regimes: a **state** value on persistence singles out **exactly one** variant
 * (`sh:xone`) by value, while a **model** placeholder on retrieval matches **at least one** by kind (`sh:or`),
 * requesting each it fits; extends-time narrowing pairs each child variant with a single parent variant. Variant order
 * is preserved for deterministic error reporting and drives the indexed {@link @metreeca/qest!Union | Union} form
 * through which union-typed slots are addressed in retrieval templates.
 *
 * > [!NOTE]
 * > The [union design note](./union.md) covers how Blue drives full CRUD from union shapes, matched as `sh:xone` on
 * > write and `sh:or` on read.
 *
 * **Inheritance**
 *
 * When a {@link resource!ResourceShape | ResourceShape} extends a parent via
 * {@link resource!ResourceConstraints.extends | extends}, a union-typed property may drop variants and tighten the
 * variants it keeps, but never add new ones. Narrowing is the construction-time counterpart of the union's exclusive
 * discrimination: each child variant must *narrow* exactly one parent variant, where narrowing is the value-shape
 * override relation that governs non-union shapes — matching `kind` (and `datatype` for `string` / `number`, plus
 * `pattern` for `string` and `integral` for `number`), only-tightening constraints, and, for a `reference`, the parent
 * variant's target shape or one extending it, or, for a nested `resource`, a shape declaring every class the parent
 * variant declares. The pairing is order-independent and injective; either form is rejected when a child variant
 * narrows no parent variant (unsatisfiable), several (ambiguous), or a parent already taken by another child variant
 * (split). The child's form fixes the outcome:
 *
 * 1. **Single-variant narrowing** (Form 1) — the child is a non-union value shape; it narrows its one parent variant
 *    and the result collapses to that merged shape, so the enclosing {@link value!SetShape.shape | SetShape.shape} is
 *    no longer a union.
 *
 * 2. **Union subsetting** (Form 2) — the child is a union; its variants each narrow a distinct parent variant, the
 *    paired variants are merged, unpaired parent variants are dropped, and the result stays a union.
 *
 * The merged union's `model` re-indexes contiguously from `0`, following parent order. Dropping a parent variant
 * renumbers every later variant — consumers must key off the shape's own `model`, not assume positional alignment with
 * an ancestor. Union-form templates (`{"0": ..., "1": ...}`) are interpreted against the *current* shape's variants;
 * well-typed templates derived from {@link value!Schema | Schema} carry the correct indices automatically.
 *
 * @document ./union.md
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/shacl/#XoneConstraintComponent SHACL § 4.6.4 sh:xone}
 */

import type { Lazy } from "@metreeca/core";
import { immutable } from "@metreeca/core/structures";
import { eager, type ValueShape } from "./value.js";

export { getShapeVariants, getStateVariant, getBoundVariant, getModelVariants } from "./union.core.js";


/**
 * Discriminated type alternatives for polymorphic values.
 *
 * Variants are mutually exclusive alternatives (`sh:xone`). The union is not validated for exclusivity at
 * construction: branches may overlap, and the design proves nothing about their distinguishability. Discrimination is
 * instead data-driven against caller-supplied values: a `state` value (persistence) must single out exactly one
 * variant (`sh:xone`), rejected when it fits several (ambiguous) or none (unsatisfiable); a `model` placeholder
 * (retrieval) need only match at least one variant by kind (`sh:or`), requesting each it fits and rejected only when
 * it fits none. Order is preserved for deterministic error reporting but does not imply priority. Each variant is a
 * {@link ValueShape} (a literal, reference, or resource); a localised {@link dictionary!dictionary | dictionary} is a
 * whole-property type and is not a {@link ValueShape}, so a dictionary variant is a compile-time type error. In a
 * retrieval template a union-typed slot is addressed only through the indexed
 * {@link @metreeca/qest!Union | Union} form (`{"0": ..., "1": ...}`); a plain placeholder over it is rejected.
 *
 * > [!IMPORTANT]
 * > Variants are expected to be **disjoint**: a well-formed union declares branches that no single legal value can
 * > satisfy at once, so every admissible value singles out exactly one. Disjointness is a design contract, not checked
 * > at construction; overlapping branches are accepted, but a value that fits several is rejected as ambiguous at
 * > operation time.
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
 * When a {@link resource!ResourceShape | ResourceShape} extends a parent via
 * {@link resource!ResourceConstraints.extends | extends}, a union-typed property is merged according to the following
 * rules; see the module overview for the single-variant-narrowing (Form 1) and union-subsetting (Form 2) forms and the
 * full narrowing relation. The *child* is the extending shape; the *parent* is the inherited shape.
 *
 * | Field      | Override Rule                                                                              |
 * | ---------- | ------------------------------------------------------------------------------------------ |
 * | `kind`     | Cannot be overridden                                                                       |
 * | `model`    | Computed from variants, re-indexed contiguously from `0`                                   |
 * | `variants` | Each child variant narrows exactly one parent variant (injective); unpaired parents dropped |
 *
 * @typeParam V The variants tuple; each variant eager or a {@link Lazy} factory for recursive self-reference
 *
 * @see {@link https://www.w3.org/TR/shacl/#XoneConstraintComponent SHACL § 4.6.4 sh:xone}
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
	 * **Inheritance** — each child variant narrows exactly one parent variant (injective); unpaired parents are dropped
	 * (see {@link UnionShape}).
	 */
	readonly variants: V;

};


//// Type Inference ////////////////////////////////////////////////////////////////////////////////////////////////////

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


//// Factories /////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a union of value shapes.
 *
 * Variants are mutually exclusive alternatives (`sh:xone`): the union is not validated for exclusivity ex-ante, but a
 * `state` value singles out exactly one variant (`sh:xone`) at write time while a `model` placeholder matches at least
 * one by kind (`sh:or`) at read time. Variant order is preserved
 * deterministically: it drives indexed `model` keys (`{"0": ..., "1": ...}`), positional trace-error reporting, and the
 * order of the merged result when an extending shape narrows the union (see {@link UnionShape} for the full inheritance
 * contract).
 *
 * At extends-time each child variant must *narrow* exactly one parent variant, so a parent declaring
 * `union(reference(Person), reference(Organization))` can be narrowed on either alternative independently. Because
 * matching is by narrowing rather than a precomputed key, parent variants that no child variant can single out (for
 * example two `reference` variants whose targets are the same shape, or one extending the other) cannot be narrowed
 * individually — a child narrowing such a variant is rejected as ambiguous.
 *
 * @typeParam V The variants tuple type
 *
 * @param variants The variant shapes
 *
 * @returns An immutable union with the specified variants
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
 * @see {@link https://www.w3.org/TR/shacl/#XoneConstraintComponent SHACL § 4.6.4 sh:xone}
 */
export function union<
	V extends readonly [Lazy<ValueShape>, ...Lazy<ValueShape>[]]
>(...variants: V): UnionShape<Variants<V>> {

	const resolved = variants.map(variant => eager(variant)) as Variants<V>;

	return immutable({

		kind: "union",

		model: Object.fromEntries(resolved.map((variant: ValueShape, index: number) => [`${index}`, variant.model])),

		variants: resolved

	}) as UnionShape<Variants<V>>;

}
