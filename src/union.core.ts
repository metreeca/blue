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

import { type Lazy } from "@metreeca/core";
import { map } from "@metreeca/core/combo";
import { immutable } from "@metreeca/core/deep";
import { collect, TraceError } from "./index.core.js";
import type { Trace } from "./index.js";
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
 * against the variants by structure rather than by key (see {@link validateUnionMatch}).
 *
 * @param shape The union shape whose variants supply the per-branch models
 *
 * @returns The derived union model, an immutable map from variant index to derived variant value
 *
 * @throws {TraceError} When a variant's model cannot be legally derived
 */
export function deriveUnion(shape: UnionShape) {

	return immutable(Object.fromEntries(shape.variants.map((variant, index) =>
		[`${index}`, deriveValue(eager(variant))]
	)));

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Reduces the matches that admitted a value to its `sh:xone` disjointness verdict.
 *
 * Callers filter the alternatives by their own admission rule and pass the survivors here for the exactly-one
 * check `sh:xone` requires; only the count is consulted, so any admitted-match collection is accepted.
 *
 * @param matches The alternatives that admitted the value (variants, or the keys pairing them)
 *
 * @returns `undefined` when exactly one match survived; `"no union variant matched"` when none did;
 *     `"multiple union variants matched"` when more than one did
 */
export function validateUnionMatch(matches: readonly unknown[]): undefined | Trace {

	return matches.length === 0 ? "no union variant matched"
		: matches.length > 1 ? "multiple union variants matched"
			: undefined;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves a union range to its variants.
 *
 * Flattens a union range to its variants in declaration order; takes any other range to the singleton `[shape]`.
 *
 * @param shape The range shape to enumerate
 *
 * @returns The variants in declaration order, or the singleton `[shape]` for a non-union range
 */
export function getShapeVariants(shape: Lazy<Shape>): readonly Shape[] {
	return map(eager(shape), shape =>
		shape.kind === "union" ? shape.variants : [shape]
	);
}

/**
 * Selects the sole variant a value matched, returning the branch to route on.
 *
 * Callers filter the variant alternatives by their own admission rule and pass the survivors here to recover the
 * single matched branch: the identity a caller routes on, in place of the bare match verdict.
 *
 * @param matches The variants that admitted the value
 *
 * @returns The sole matched variant when exactly one survived; otherwise the flat {@link Trace} naming the failure
 */
export function getUnionMatch(matches: ValuesShape[]): ValuesShape | Trace {
	return validateUnionMatch(matches) ?? matches[0];
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
function pair(target: UnionShape, source: UnionShape): Trace | Map<number, number> {

	// base indices each child variant narrows

	const matches = target.variants.map(variant =>
		source.variants.flatMap((base, index) => narrowsValue(variant, base) === undefined ? [index] : [])
	);

	// each child variant must narrow exactly one base variant

	const exactly = collect(Object.fromEntries(matches.map((bases, index) => [`[${index}]`,
		bases.length === 0 ? `variant narrows no base alternative`
			: bases.length > 1 ? `variant narrows several base alternatives`
				: true
	])));

	if ( exactly !== undefined ) {
		return exactly;
	}

	// no two child variants may narrow the same base variant

	const assignments = matches.map(bases => bases[0]);

	const injective = collect(Object.fromEntries(assignments.map((base, index) => [`[${index}]`,
		assignments.findIndex(other => other === base) === index
		|| `variant narrows a base alternative already taken`
	])));

	return injective ?? new Map(assignments.map((base, index) => [base, index]));

}
