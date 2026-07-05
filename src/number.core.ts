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
 * Number shape operators.
 *
 * @module
 */

import { isNumber } from "@metreeca/core";
import { immutable } from "@metreeca/core/deep";
import { collect, every, group, TraceError, wrap } from "./index.core.js";
import type { Trace } from "./index.js";
import type { NumberConstraints, NumberShape } from "./number.js";


/**
 * Checks internal consistency of number shape constraints.
 *
 * @param constraints The constraint fields to validate
 *
 * @returns A keyed trace of violations, or `undefined` if all constraints are consistent
 */
export function checkNumber({

	integral,

	minExclusive,
	maxExclusive,
	minInclusive,
	maxInclusive,

	in: allowed,
	hasValue

}: {

	readonly model?: number;

	readonly integral?: boolean;

	readonly minExclusive?: number;
	readonly maxExclusive?: number;
	readonly minInclusive?: number;
	readonly maxInclusive?: number;

	readonly in?: readonly [number, ...number[]];
	readonly hasValue?: readonly number[];

}): undefined | Trace {

	// least and greatest legal integers implied by the bounds, used for the empty-integral-range check

	const lower = minInclusive !== undefined ? Math.ceil(minInclusive)
		: minExclusive !== undefined ? Math.floor(minExclusive)+1
			: undefined;

	const upper = maxInclusive !== undefined ? Math.floor(maxInclusive)
		: maxExclusive !== undefined ? Math.ceil(maxExclusive)-1
			: undefined;

	return collect({

		"{minExclusive/maxExclusive}": minExclusive === undefined || maxExclusive === undefined
			|| minExclusive < maxExclusive
			|| `inconsistent bounds <${minExclusive}> >= <${maxExclusive}>`,

		"{minInclusive/maxInclusive}": minInclusive === undefined || maxInclusive === undefined
			|| minInclusive <= maxInclusive
			|| `inconsistent bounds <${minInclusive}> > <${maxInclusive}>`,

		"{minExclusive/maxInclusive}": minExclusive === undefined || maxInclusive === undefined
			|| minExclusive < maxInclusive
			|| `inconsistent bounds <${minExclusive}> >= <${maxInclusive}>`,

		"{minInclusive/maxExclusive}": minInclusive === undefined || maxExclusive === undefined
			|| minInclusive < maxExclusive
			|| `inconsistent bounds <${minInclusive}> >= <${maxExclusive}>`,

		"{hasValue/in}": hasValue === undefined || allowed === undefined
			|| hasValue.every(v => allowed.includes(v))
			|| `required values <${hasValue?.filter(v => !allowed.includes(v))}> not in allowed set`,

		"{integral/minExclusive}": !integral || minExclusive === undefined || Number.isInteger(minExclusive)
			|| `fractional bound <${minExclusive}> on integral shape`,

		"{integral/maxExclusive}": !integral || maxExclusive === undefined || Number.isInteger(maxExclusive)
			|| `fractional bound <${maxExclusive}> on integral shape`,

		"{integral/minInclusive}": !integral || minInclusive === undefined || Number.isInteger(minInclusive)
			|| `fractional bound <${minInclusive}> on integral shape`,

		"{integral/maxInclusive}": !integral || maxInclusive === undefined || Number.isInteger(maxInclusive)
			|| `fractional bound <${maxInclusive}> on integral shape`,

		"{integral/in}": !integral || allowed === undefined || allowed.every(v => Number.isInteger(v))
			|| `fractional values [${allowed.filter(v => !Number.isInteger(v))}] on integral shape`,

		"{integral/hasValue}": !integral || hasValue === undefined || hasValue.every(v => Number.isInteger(v))
			|| `fractional values [${hasValue.filter(v => !Number.isInteger(v))}] on integral shape`,

		"{integral/range}": !integral || lower === undefined || upper === undefined || lower <= upper
			|| `no integer within bounds <[${lower}, ${upper}]>`

	});

}


/**
 * Reports whether an overriding number shape narrows an inherited base shape.
 *
 * Tests the override relation without building the merged shape: returns `undefined` when `target` only tightens
 * `source` (matching `datatype`, not dropping `integral`, bounds not widened, `in` intersection non-empty,
 * merged constraints consistent), or a keyed {@link Trace} describing the obstacles otherwise.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns A keyed trace of narrowing obstacles, or `undefined` when `target` narrows `source`
 */
export function narrowsNumber(target: NumberShape, source: NumberShape): undefined | Trace {

	// conjunctive: in — intersection

	const allowed = target.in !== undefined && source.in !== undefined
		? target.in.filter(v => source.in!.includes(v))
		: target.in ?? source.in;

	// conjunctive: hasValue — union

	const hasValue = target.hasValue !== undefined && source.hasValue !== undefined
		? [...new Set([...target.hasValue, ...source.hasValue])]
		: target.hasValue ?? source.hasValue;

	// merged constraints

	const minExclusive = target.minExclusive ?? source.minExclusive;
	const maxExclusive = target.maxExclusive ?? source.maxExclusive;
	const minInclusive = target.minInclusive ?? source.minInclusive;
	const maxInclusive = target.maxInclusive ?? source.maxInclusive;

	return collect({

		// structural: datatype must be strictly equal when both defined

		"{datatype}": target.datatype === undefined || source.datatype === undefined
			|| target.datatype === source.datatype
			|| `mismatched datatypes <${target.datatype}> and <${source.datatype}>`,

		// structural: integral — child may add but not drop the constraint

		"{integral}": source.integral !== true || target.integral !== false
			|| `dropped integral constraint`,

		// narrow: minExclusive — child >= parent

		"{minExclusive}": target.minExclusive === undefined || source.minExclusive === undefined
			|| target.minExclusive >= source.minExclusive
			|| `widened limit <${target.minExclusive}> beyond <${source.minExclusive}>`,

		// narrow: maxExclusive — child <= parent

		"{maxExclusive}": target.maxExclusive === undefined || source.maxExclusive === undefined
			|| target.maxExclusive <= source.maxExclusive
			|| `widened limit <${target.maxExclusive}> beyond <${source.maxExclusive}>`,

		// narrow: minInclusive — child >= parent

		"{minInclusive}": target.minInclusive === undefined || source.minInclusive === undefined
			|| target.minInclusive >= source.minInclusive
			|| `widened limit <${target.minInclusive}> beyond <${source.minInclusive}>`,

		// narrow: maxInclusive — child <= parent

		"{maxInclusive}": target.maxInclusive === undefined || source.maxInclusive === undefined
			|| target.maxInclusive <= source.maxInclusive
			|| `widened limit <${target.maxInclusive}> beyond <${source.maxInclusive}>`,

		// conjunctive: in — empty intersection

		"{in}": target.in === undefined || source.in === undefined
			|| allowed!.length !== 0
			|| `disjoint sets [${target.in}] and [${source.in}]`,

		// post-merge constraint consistency

		...wrap(checkNumber({

			integral: target.integral ?? source.integral,

			minExclusive,
			maxExclusive,
			minInclusive,
			maxInclusive,

			// ;(cast) the merge intersection is a plain array; its non-emptiness is reported by {in} above

			in: allowed as NumberShape["in"],
			hasValue

		}))

	});

}

/**
 * Merges an overriding number shape with an inherited base shape.
 *
 * Combines constraints from `source` into `target`, enforcing that overrides only narrow inherited definitions.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns The merged shape with combined constraints
 *
 * @throws {TraceError} On incompatible overrides
 */
export function mergeNumber(target: NumberShape, source: NumberShape): NumberShape {

	const trace = narrowsNumber(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible number shape override", trace);
	}

	// conjunctive: in — intersection

	const allowed = target.in !== undefined && source.in !== undefined
		? target.in.filter(v => source.in!.includes(v))
		: target.in ?? source.in;

	// conjunctive: hasValue — union

	const hasValue = target.hasValue !== undefined && source.hasValue !== undefined
		? [...new Set([...target.hasValue, ...source.hasValue])]
		: target.hasValue ?? source.hasValue;

	// merged constraints

	const minExclusive = target.minExclusive ?? source.minExclusive;
	const maxExclusive = target.maxExclusive ?? source.maxExclusive;
	const minInclusive = target.minInclusive ?? source.minInclusive;
	const maxInclusive = target.maxInclusive ?? source.maxInclusive;

	// build shape — casts are safe: non-emptiness validated above

	return immutable({

		kind: target.kind,
		model: target.model,
		datatype: target.datatype ?? source.datatype,

		integral: target.integral ?? source.integral,

		minExclusive,
		maxExclusive,
		minInclusive,
		maxInclusive,

		in: allowed as NumberShape["in"],
		hasValue: hasValue as NumberShape["hasValue"]

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a number shape.
 *
 * Filters input values by type, reporting non-numeric values under the `kind` key, then enforces the numeric
 * value-domain constraints on the matching values.
 *
 * @param values The values to validate
 * @param shape The number shape defining validation constraints
 * @param opts Validation options
 * @param opts.model Whether to validate `values` as retrieval placeholders rather than instances: the value-domain
 *     constraints are skipped so the value need not be legal, matched by kind alone; defaults to `false`
 *
 * @returns A keyed trace of validation errors, or `undefined` if all values are valid
 */
export function validateNumber(values: readonly unknown[], {

	kind,

	minExclusive,
	maxExclusive,
	minInclusive,
	maxInclusive,

	integral,

	in: allowed,
	hasValue

}: NumberShape, {

	model = false

}: {

	model?: boolean

} = {}): undefined | Trace {

	const matching = values.filter(isNumber);
	const mistyped = values.length-matching.length;

	// a placeholder (model) is matched by kind alone: value-domain constraints are skipped, only {kind} applies

	return collect({

		"{kind}": mistyped === 0
			|| `expected <${kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		"{integral}": model || every(matching, value =>
			!integral || Number.isInteger(value)
			|| `expected integral values`
		),

		"{minExclusive}": model || every(matching, value =>
			minExclusive === undefined || value > minExclusive
			|| `expected values > <${minExclusive}>`
		),

		"{maxExclusive}": model || every(matching, value =>
			maxExclusive === undefined || value < maxExclusive
			|| `expected values < <${maxExclusive}>`
		),

		"{minInclusive}": model || every(matching, value =>
			minInclusive === undefined || value >= minInclusive
			|| `expected values >= <${minInclusive}>`
		),

		"{maxInclusive}": model || every(matching, value =>
			maxInclusive === undefined || value <= maxInclusive
			|| `expected values <= <${maxInclusive}>`
		),

		"{in}": model || every(matching, value =>
			allowed === undefined || allowed.includes(value)
			|| `expected values in [${allowed.join(", ")}]`
		),

		"{hasValue}": model || group(matching, group =>
			hasValue === undefined || hasValue.every(v => group.includes(v))
			|| `expected values to include [${hasValue.join(", ")}]`
		)

	});

}
