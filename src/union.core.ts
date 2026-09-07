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
 * Union shape operators.
 *
 * @module
 */

import { isArray, isObject, type Lazy, map } from "@metreeca/core";
import { immutable } from "@metreeca/core/structures";
import { array, type Trace, TraceError } from "@metreeca/core/trace";
import { getShapeTarget } from "./reference.js";
import type { UnionShape } from "./union.js";
import { deriveValue, eager, mergeValue, narrowsValue, validateValue } from "./value.core.js";
import type { Shape, ValuesShape } from "./value.js";


/**
 * Reports whether an overriding union narrows an inherited base union.
 *
 * Tests the override relation without building the merged union: returns `undefined` when every child variant narrows
 * exactly one base variant and the pairing is injective, or a keyed {@link Trace} of obstacles otherwise. Companion to
 * {@link mergeUnion}, which builds the merged union after the same check.
 *
 * @param target The overriding child union
 * @param source The inherited parent union
 *
 * @returns A keyed trace of narrowing obstacles, or `undefined` when `target` narrows `source`
 */
export function narrowsUnion(target: UnionShape, source: UnionShape): undefined | Trace {

	const paired = pair(target, source);

	return paired instanceof Map ? undefined : paired;

}

/**
 * Merges an overriding union with an inherited base union.
 *
 * The child union may drop branches and tighten the branches it keeps, but never add new ones. Each child variant must
 * narrow exactly one base variant (by {@link narrowsValue}), which it overrides via {@link mergeValue}; the pairing is
 * injective, so distinct child variants override distinct base variants. Base variants left unpaired are dropped, the
 * surviving variants keep base order, and the merged `model` re-indexes contiguously from `0`.
 *
 * @param target The overriding child union
 * @param source The inherited parent union
 *
 * @returns The merged union
 *
 * @throws {TraceError} When a child variant narrows no or several base variants, two child variants narrow the same
 *     base variant, or a paired override is incompatible
 */
export function mergeUnion(target: UnionShape, source: UnionShape): UnionShape {

	const paired = pair(target, source);

	if ( !(paired instanceof Map) ) {
		throw new TraceError("incompatible union shape override", paired);
	}

	// build merged variants in base order; unpaired base variants are dropped

	const variants = source.variants.flatMap((base, index) => {

		const child = paired.get(index);

		return child === undefined ? [] : [mergeValue(target.variants[child], base)];

	});

	return immutable({

		kind: target.kind,

		model: Object.fromEntries(variants.map((variant, index) => [`${index}`, variant.model])),

		variants

	});

}

/**
 * Derives the retrieval model for a union shape.
 *
 * Projects each variant to its derived value through {@link value!deriveValue | deriveValue}, keyed by the variant's
 * positional index. Variant keys carry no meaning beyond naming the branch: discrimination matches a supplied value
 * against the variants by structure rather than by key (see {@link validateUnion}).
 *
 * @param shape The union shape whose variants supply the per-branch models
 *
 * @returns The derived union model, an immutable map from variant index to derived variant value
 */
export function deriveUnion(shape: UnionShape) {

	return immutable(Object.fromEntries(shape.variants.map((variant, index) =>
		[`${index}`, deriveValue(eager(variant))]
	)));

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates one value, or a set of values, against the variants of a union.
 *
 * Matches each value against the `variants` by the caller's `match` rule and checks how many admit it: a **state**
 * value must be admitted by exactly one variant (`sh:xone`), while a **model** placeholder need only be admitted by at
 * least one (`sh:or`). A bare value is checked directly; an array of values yields a per-element trace keyed by each
 * value's `[index]`, so a set composes with its enclosing trace like any other per-element report.
 *
 * @param values A single value, or an array of values, to match against the union
 * @param variants The union variants to match against
 * @param opts Match options
 * @param opts.model Whether the values are retrieval placeholders, applying the `sh:or` at-least-one rule; defaults
 *     to `false`, applying the `sh:xone` exactly-one rule for data values
 * @param opts.match Admission predicate reporting whether a value is admitted by a variant under the given `model`
 *
 * @returns For a bare value, `undefined` when it matches admissibly, else `"no union variant matched"` when none
 *     admit it or `"multiple union variants matched"` when several do; for an array, a `[index]`-keyed {@link Trace},
 *     or `undefined` when every value matches admissibly
 */
export function validateUnion(values: unknown | readonly unknown[], variants: readonly ValuesShape[], {

	model = false,
	match

}: {

	model?: boolean
	match: (value: unknown, variant: ValuesShape, model: boolean) => boolean

}): undefined | Trace {

	return isArray(values)
		? array((value: unknown) => validate(value))(values)
		: validate(values);


	function validate(value: unknown): undefined | Trace {

		const matches = variants.filter(variant => match(value, variant, model));

		return matches.length === 0 ? ["no union variant matched"]
			: !model && matches.length > 1 ? ["multiple union variants matched"]
				: undefined;

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves a union range to its concrete value-shape variants.
 *
 * Flattens a union range to its {@link value!ValuesShape | value-shape} variants in declaration order; takes any other
 * range to the singleton `[shape]`. Every returned variant is a concrete value shape, never a nested union, so callers
 * route each branch without flattening again.
 *
 * @param shape The range shape to enumerate
 *
 * @returns The value-shape variants in declaration order, or the singleton `[shape]` for a non-union range
 */
export function getShapeVariants(shape: Lazy<Shape>): readonly ValuesShape[] {
	return map(eager(shape), shape =>
		shape.kind === "union" ? shape.variants : [shape]
	);
}


/**
 * Picks the single variant compatible with a state value.
 *
 * Routes a state value to the one variant that admits it against **all** constraints, so a caller ingesting a value
 * against a polymorphic union can settle it on a definite branch for persistence. Because persistence must commit to a
 * single branch, a value admitted by several variants is ambiguous and a value admitted by none is unsatisfiable; both
 * are reported as no match rather than resolved by guessing. A state value is a resource instance on ingress, or a
 * set-matching **option** within a selection.
 *
 * A relational **bound** is not a state value: it need not be a legal element value (a `>= 8` bound over a `[1, 5]`
 * domain is a legal query, not an error), so it routes by a relaxed rule keyed on syntactic traits alone under the
 * union design's literal-disjointness rule, not through this entry point.
 *
 * @typeParam V The variant shape type, preserved from the input array to the returned variant
 *
 * @param state The state value to route
 * @param variants The union variants to choose among
 *
 * @returns The sole variant the value fits, or `undefined` when it fits none (unsatisfiable) or several (ambiguous)
 *
 * @see [Unions — Design § State](./union.md#state-exactly-one-branch-by-value-)
 * @see [Unions — Design § Selection operands](./union.md#selection-operands-and-text-search)
 * @see {@link https://www.w3.org/TR/shacl/#XoneConstraintComponent SHACL § 4.7.4 sh:xone}
 */
export function getStateVariant<V extends ValuesShape>(
	state: unknown,
	variants: readonly V[]
): undefined | V {

	const matches = variants.filter(variant => validateValue(
		[state], variant, { scope: "state" }
	) === undefined);

	return matches.length === 1 ? matches[0] : undefined;

}

/**
 * Picks the single variant compatible with a relational bound.
 *
 * Routes a comparison **bound** (a `<`, `>`, `<=`, `>=` selection operand) to the one variant it filters against, so a
 * caller can type the bound by the resolved branch. Unlike a state value, a bound need not be a legal element value: a
 * comparison filters by order, so a `>= 8` bound over a `[1, 5]` domain is a legal query returning nothing, not an
 * error. Matching therefore relaxes the value-domain **magnitude** facets (`min*`/`max*`, `integral`, string length,
 * `languageIn`, `in`, `hasValue`) and keys only on the **syntactic** traits that pin a branch: the value's `kind` and,
 * where literal branches share a kind, their lexical `pattern`.
 *
 * The match stays **exactly one**: a processor needs a single branch to convert the bound against, so a bound admitted
 * by several variants is ambiguous and one admitted by none unsatisfiable, both reported as no match. This relies on
 * the union being **literally disjoint** (`kind` and `pattern` separate the literal branches with no value-domain
 * facet); a union that is not is rejected at runtime by the ambiguous-match rule rather than at construction.
 *
 * @typeParam V The variant shape type, preserved from the input array to the returned variant
 *
 * @param bound The relational bound to route
 * @param variants The union variants to choose among
 *
 * @returns The sole variant the bound fits, or `undefined` when it fits none (unsatisfiable) or several (ambiguous)
 *
 * @see [Unions — Design § Selection operands](./union.md#selection-operands-and-text-search)
 * @see {@link https://www.w3.org/TR/shacl/#XoneConstraintComponent SHACL § 4.7.4 sh:xone}
 */
export function getBoundVariant<V extends ValuesShape>(
	bound: unknown,
	variants: readonly V[]
): undefined | V {

	const matches = variants.filter(variant => validateValue(
		[bound], variant, { scope: "bound" }
	) === undefined);

	return matches.length === 1 ? matches[0] : undefined;

}

/**
 * Picks every variant compatible with a retrieval model.
 *
 * Routes a retrieval model to all variants it can draw from, so callers retrieving against a polymorphic
 * union need not know which branch was persisted. A model is matched by kind alone, its value immaterial, so
 * it may span several variants and retrieve each; only a model matching no variant is unsatisfiable and
 * reported as no match. An IRI model addresses the reference variants; a structure-expanded resource
 * template addresses the variants whose target resource it shapes.
 *
 * @typeParam V The variant shape type, preserved from the input array to the returned variants
 *
 * @param model The retrieval model to route
 * @param variants The union variants to choose among
 *
 * @returns Every variant the model fits, or `undefined` when it fits none (unsatisfiable)
 *
 * @see [Unions — Design § Model](./union.md#model-at-least-one-branch-by-kind-)
 * @see {@link https://www.w3.org/TR/shacl/#OrConstraintComponent SHACL § 4.7.3 sh:or}
 */
export function getModelVariants<V extends ValuesShape>(
	model: unknown,
	variants: readonly V[]
): | undefined | readonly V[] {

	const matches = variants.filter(variant => validateValue(
		[model], isObject(model) ? getShapeTarget(variant) ?? variant : variant, { scope: "model" }
	) === undefined);

	return matches.length > 0 ? matches : undefined;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Pairs each child variant with the base variant it narrows.
 *
 * Matches by trial narrowing: a child variant pairs with a base variant when {@link narrowsValue} reports no obstacle.
 * Validates that every child variant narrows exactly one base variant (rejecting variants that narrow none or several)
 * and that no two child variants narrow the same base variant (rejecting splits), so the pairing is a partial
 * injection from base to child. Base variants left unpaired are dropped by the caller.
 *
 * @param target The overriding child union
 * @param source The inherited parent union
 *
 * @returns A base-index to child-index map when the pairing is valid, or a keyed {@link Trace} of obstacles otherwise
 */
function pair(target: UnionShape, source: UnionShape): NonNullable<undefined | Trace> | Map<number, number> {

	// base indices each child variant narrows

	const matches = target.variants.map(variant =>
		source.variants.flatMap((base, index) => narrowsValue(variant, base) === undefined ? [index] : [])
	);

	// each child variant must narrow exactly one base variant

	const exactly = array((bases: readonly number[]) =>
		bases.length === 0 ? ["variant narrows no base alternative"]
			: bases.length > 1 ? ["variant narrows several base alternatives"]
				: undefined
	)(matches);

	if ( exactly !== undefined ) {
		return exactly;
	}

	// no two child variants may narrow the same base variant

	const assignments = matches.map(bases => bases[0]);

	const injective = array((taken: boolean) =>
		taken ? ["variant narrows a base alternative already taken"] : undefined
	)(assignments.map((base, index) => assignments.findIndex(other => other === base) !== index));

	return injective ?? new Map(assignments.map((base, index) => [base, index]));

}
