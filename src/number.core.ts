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
import type { NumberShape } from "./number.js";


/**
 * Checks internal consistency of number shape constraints.
 *
 * @param constraints The constraint fields to validate
 *
 * @returns A keyed trace of violations, or `undefined` if all constraints are consistent
 */
export function checkNumber({

	minExclusive,
	maxExclusive,
	minInclusive,
	maxInclusive,

	in: allowed,
	hasValue

}: {

	readonly minExclusive?: number;
	readonly maxExclusive?: number;
	readonly minInclusive?: number;
	readonly maxInclusive?: number;

	readonly in?: readonly number[];
	readonly hasValue?: readonly number[];

}): undefined | Trace {

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
			|| `required values <${hasValue?.filter(v => !allowed.includes(v))}> not in allowed set`

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

	// validate

	const trace = collect({

		// structural: model must be strictly equal

		"{model}": target.model === source.model
			|| `mismatched types <${target.model}> and <${source.model}>`,

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

			minExclusive,
			maxExclusive,
			minInclusive,
			maxInclusive,

			in: allowed,
			hasValue

		}))

	});

	if ( trace !== undefined ) {
		throw new TraceError("incompatible number shape override", trace);
	}

	// build shape — casts are safe: non-emptiness validated above

	return immutable({

		kind: target.kind,
		model: target.model,

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
 * Filters input values by type, reporting non-numeric values under the `kind` key, then enforces
 * numeric constraints on matching values.
 */
export function validateNumber(values: readonly unknown[], {

	kind,

	minExclusive,
	maxExclusive,
	minInclusive,
	maxInclusive,

	in: allowed,
	hasValue

}: NumberShape): undefined | Trace {

	const matching = values.filter(isNumber);
	const mistyped = values.length-matching.length;

	return collect({

		"{kind}": mistyped === 0
			|| `expected <${kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		"{minExclusive}": every(matching, value =>
			minExclusive === undefined || value > minExclusive
			|| `expected values > <${minExclusive}>`
		),

		"{maxExclusive}": every(matching, value =>
			maxExclusive === undefined || value < maxExclusive
			|| `expected values < <${maxExclusive}>`
		),

		"{minInclusive}": every(matching, value =>
			minInclusive === undefined || value >= minInclusive
			|| `expected values >= <${minInclusive}>`
		),

		"{maxInclusive}": every(matching, value =>
			maxInclusive === undefined || value <= maxInclusive
			|| `expected values <= <${maxInclusive}>`
		),

		"{in}": every(matching, value =>
			allowed === undefined || allowed.includes(value)
			|| `expected values in [${allowed.join(", ")}]`
		),

		"{hasValue}": group(matching, group =>
			hasValue === undefined || hasValue.every(v => group.includes(v))
			|| `expected values to include [${hasValue.join(", ")}]`
		)

	});

}
