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
 * Value shape operators.
 *
 * @module
 */

import { immutable } from "@metreeca/core/deep";
import { mergeBoolean, validateBoolean } from "./boolean.core.js";
import type { BooleanShape } from "./boolean.js";
import { collect, TraceError, wrap } from "./index.core.js";
import type { Trace } from "./index.js";
import { mergeNumber, validateNumber } from "./number.core.js";
import type { NumberShape } from "./number.js";
import { mergeReference, validateReferences } from "./reference.core.js";
import type { ReferenceShape } from "./reference.js";
import { mergeResource, validateResource } from "./resource.core.js";
import { type ResourceShape } from "./resource.js";
import { mergeString, validateString } from "./string.core.js";
import { type StringShape } from "./string.js";
import { mergeText, validateText } from "./text.core.js";
import type { TextShape } from "./text.js";
import { eager, type SetShape, type Shape, type UnionShape, type ValueShape, type ValuesShape } from "./value.js";


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks internal consistency of {@link SetShape} constraints.
 *
 * @param constraints The constraint fields to check
 *
 * @returns A keyed trace of violations, or `undefined` if all constraints are consistent
 */
export function checkValues({

	minCount,
	maxCount

}: {

	readonly minCount?: number;
	readonly maxCount?: number;

}): undefined | Trace {

	return collect({

		"{minCount/maxCount}": minCount === undefined || maxCount === undefined
			|| minCount <= maxCount
			|| `inconsistent bounds <${minCount}> > <${maxCount}>`

	});

}


/**
 * Merges an overriding value shape with an inherited base shape.
 *
 * Dispatches to the appropriate shape-specific merge function based on the `kind` discriminator.
 * Both shapes must have the same `kind`; a mismatch throws a `RangeError`.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns The merged shape
 *
 * @throws {TraceError} On kind mismatch or incompatible overrides
 */
export function mergeValue<T extends ValuesShape>(target: T, source: T): T {

	switch ( target.kind ) {

		case "boolean":

			return mergeBoolean(target, source as BooleanShape) as T;

		case "number":

			return mergeNumber(target, source as NumberShape) as T;

		case "string":

			return mergeString(target, source as StringShape) as T;

		case "text":

			return mergeText(target, source as TextShape) as T;

		case "reference":

			return mergeReference(target, source as ReferenceShape) as T;

		case "resource":

			return mergeResource(target, source as ResourceShape) as T;

	}

}

/**
 * Merges an overriding {@link SetShape} with an inherited base.
 *
 * Validates that the override narrows cardinality constraints, then delegates to the appropriate value shape or union
 * merge function. When the parent shape is a {@link UnionShape | union} and the child shape is not, dispatches to
 * single-variant narrowing: the child must match exactly one parent variant by *discriminator* (`kind` for `boolean` /
 * `text`; `(kind, datatype)` for `string` / `number`; `(kind, class)` for `reference` / `resource`), and the result's
 * `shape` is the merged non-union value shape.
 *
 * @param target The overriding child {@link SetShape}
 * @param source The inherited parent {@link SetShape}
 *
 * @returns The merged {@link SetShape}
 *
 * @throws {TraceError} On widened constraints, kind mismatch, or incompatible overrides
 */
export function mergeValues(target: SetShape, source: SetShape): SetShape {

	// merged constraints

	const minCount = target.minCount ?? source.minCount;
	const maxCount = target.maxCount ?? source.maxCount;

	// validate

	const trace = collect({

		// narrow: minCount — child >= parent

		"{minCount}": target.minCount === undefined || source.minCount === undefined
			|| target.minCount >= source.minCount
			|| `widened limit <${target.minCount}> beyond <${source.minCount}>`,

		// narrow: maxCount — child <= parent

		"{maxCount}": target.maxCount === undefined || source.maxCount === undefined
			|| target.maxCount <= source.maxCount
			|| `widened limit <${target.maxCount}> beyond <${source.maxCount}>`,

		// structural: shape kind must match — exception: child non-union may narrow a parent union
		//             (single-variant narrowing dispatched via narrow below)

		"{shape}": source.shape.kind === "union"
			|| target.shape.kind === source.shape.kind
			|| `mismatched kinds <${target.shape.kind}> vs <${source.shape.kind}>`,

		// post-merge constraint consistency

		...wrap(checkValues({ minCount, maxCount }))

	});

	if ( trace !== undefined ) {
		throw new TraceError("incompatible value set override", trace);
	}

	// build value set shape

	const isScalar = maxCount === 1;

	const shape: Shape = source.shape.kind === "union"
		? target.shape.kind === "union"
			? mergeUnion(target.shape, source.shape)
			: narrow(target.shape, source.shape)
		: mergeValue(target.shape as ValuesShape, source.shape);

	const model = isScalar ? shape.model : [shape.model];

	return immutable({

		kind: target.kind,

		minCount,
		maxCount,

		shape,
		model

	}) as SetShape;


	/**
	 * Narrows a parent {@link UnionShape} to a single non-union value shape.
	 *
	 * Selects the unique parent variant whose discriminator matches the child shape and merges them via
	 * {@link mergeValue}. Rejects when the child's discriminator is absent from, or non-unique within, the parent.
	 *
	 * @param target The overriding child value shape (non-union)
	 * @param source The inherited parent {@link UnionShape}
	 *
	 * @returns The merged value shape
	 *
	 * @throws {TraceError} On absent or non-unique discriminator
	 */
	function narrow(target: ValuesShape, source: UnionShape): ValuesShape {

		const key = discriminator(target);
		const matches = source.variants.filter(variant => discriminator(variant) === key);

		if ( matches.length === 0 ) {
			throw new TraceError("incompatible value set override", {
				"{shape}": `discriminator <${key}> absent from parent union`
			});
		}

		if ( matches.length > 1 ) {
			throw new TraceError("incompatible value set override", {
				"{shape}": `discriminator <${key}> non-unique within parent union`
			});
		}

		return mergeValue(target, matches[0] as typeof target);

	}

}

/**
 * Merges an overriding union with an inherited base union.
 *
 * The child union may drop branches and tighten the branches it keeps, but never add new ones. Concretely, every child
 * branch must match a parent branch, which it overrides via {@link mergeValue}; parent branches with no child match are
 * dropped from the result.
 *
 * Implementation note: branches are matched by *discriminator* (`kind` for `boolean` / `text`; `(kind, datatype)` for
 * `string` / `number`; `(kind, class)` for `reference` / `resource`). Several branches may still share a discriminator
 * (for example two same-datatype `string` variants differing only in constraints); these have no identity other than
 * their position, so the child union cannot drop just some of them without making the remaining matches ambiguous.
 * Matching is therefore positional within each group: the child union must keep either all parent branches of a group
 * in their original order, or none. The merged `model` re-indexes contiguously from `0`.
 *
 * @param target The overriding child union
 * @param source The inherited parent union
 *
 * @returns The merged union
 *
 * @throws {TraceError} On partial-group retention, out-of-order variants, or incompatible pairwise overrides
 */
export function mergeUnion(target: UnionShape, source: UnionShape): UnionShape {

	const sourceGroups = group(source.variants);
	const targetGroups = group(target.variants);

	// each child group must match a parent group, with equal arity (full retention)

	for (const [key, targetGroup] of targetGroups) {

		const sourceGroup = sourceGroups.get(key);

		if ( sourceGroup === undefined ) {
			throw new TraceError("incompatible union shape override", {
				"{variants}": `discriminator <${key}> not present in parent union`
			});
		}

		if ( targetGroup.length !== sourceGroup.length ) {
			throw new TraceError("incompatible union shape override", {
				"{variants}": `partial retention <${targetGroup.length}> of <${sourceGroup.length}> for group <${key}>`
			});
		}

	}

	// child group order must follow parent group order (subsequence)

	const sourceKeys = [...sourceGroups.keys()];
	let cursor = 0;

	for (const key of targetGroups.keys()) {

		while ( cursor < sourceKeys.length && sourceKeys[cursor] !== key ) { cursor++; }

		if ( cursor >= sourceKeys.length ) {
			throw new TraceError("incompatible union shape override", {
				"{variants}": `out-of-order discriminator <${key}>`
			});
		}

		cursor++;

	}

	// build merged variants in parent group order; dropped groups are absent from the result

	const variants = [...sourceGroups].flatMap(([key, sourceGroup]) => {

		const targetGroup = targetGroups.get(key);

		return targetGroup === undefined ? []
			: sourceGroup.map((sourceVariant, index) => mergeValue(targetGroup[index], sourceVariant));

	});

	return immutable({

		kind: target.kind,

		model: Object.fromEntries(variants.map((v, i) => [`${i}`, v.model])),

		variants

	});


	/**
	 * Groups variants by discriminator, preserving first-occurrence order in the resulting map.
	 */
	function group(variants: readonly ValueShape[]): Map<string, ValueShape[]> {

		return variants.reduce((groups, variant) => {

			const key = discriminator(variant);
			const existing = groups.get(key);

			if ( existing === undefined ) {
				groups.set(key, [variant]);
			} else {
				existing.push(variant);
			}

			return groups;

		}, new Map<string, ValueShape[]>());

	}

}


/**
 * Computes the *discriminator* key for a union variant.
 *
 * Returns `kind` for `boolean` and `text` variants. For `string` and `number` variants, returns `kind` paired with the
 * prototype `model` value, which proxies the datatype, so that unions of differently-typed strings or numbers are
 * treated as distinct discriminator groups. For `reference` and `resource` variants, returns `kind` paired with the
 * target {@link ResourceShape.class | class} IRI, so that unions of differently-classed references or resources are
 * treated as distinct discriminator groups.
 *
 * @param variant The union variant
 *
 * @returns The discriminator key
 */
function discriminator(variant: ValuesShape): string {

	return variant.kind === "reference" ? `reference:${eager(variant.shape).class ?? ""}`
		: variant.kind === "resource" ? `resource:${variant.class ?? ""}`
			: variant.kind === "string" || variant.kind === "number" ? `${variant.kind}:${variant.model}`
				: variant.kind;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a shape, dispatching to the appropriate type-specific validator.
 *
 * @param values The values to validate
 * @param shape The shape defining validation constraints
 *
 * @returns A keyed trace of validation errors, or `undefined` if all values are valid
 */
export function validateValue(values: readonly unknown[], shape: ValuesShape): undefined | Trace {

	switch ( shape.kind ) {

		case "boolean":

			return validateBoolean(values, shape);

		case "number":

			return validateNumber(values, shape);

		case "string":

			return validateString(values, shape);

		case "text":

			return validateText(values, shape);

		case "reference":

			return validateReferences(values, shape);

		case "resource":

			return validateResource(values, shape);

	}

}

/**
 * Validates values against a {@link UnionShape} disjunctively.
 *
 * Each value is matched against the union variants in order. A value satisfies the union if it
 * satisfies at least one variant; every variant, including a reference variant, is checked through
 * {@link validateValue}, so a reference variant admits a bare IRI only (state-side captive
 * expansion is applied upstream by the resource validator). On failure, the trace aggregates the
 * per-variant traces under positional keys (`[0]`, `[1]`, …).
 *
 * @param values The values to validate
 * @param union The union shape defining the variant alternatives
 *
 * @returns A keyed trace of validation errors, or `undefined` if every value matches a variant
 */
export function validateUnion(values: readonly unknown[], union: UnionShape): undefined | Trace {

	return collect(Object.fromEntries(values.map((value, index) => {

		const traces = union.variants.map(variant => validateValue([value], variant));

		const trace = traces.some(trace => trace === undefined) ? undefined : collect(Object.fromEntries(
			traces.map((trace, position) => [`[${position}]`, trace])
		)) ?? "no union variant matched";

		return [`[${index}]`, trace];

	})));

}
