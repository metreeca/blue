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
 * String shape operators.
 *
 * @module
 */

import { isString } from "@metreeca/core";
import { immutable } from "@metreeca/core/nested";
import type { StringShape } from "./string.js";
import { collect, every, group, wrap } from "./trace.core.js";
import type { Trace } from "./trace.js";


/**
 * Validates values against a string shape.
 *
 * Filters input values by type, reporting non-string values under the `kind` key, then enforces
 * string constraints on matched values.
 */
export function validateString(values: readonly unknown[], {

	kind,

	minLength,
	maxLength,

	pattern,

	in: allowed,
	hasValue

}: StringShape): undefined | Trace {

	const matching = values.filter(isString);
	const mistyped = values.length-matching.length;

	return collect({

		"{kind}": mistyped === 0
			|| `expected <${kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		"{minLength}": every(matching, value =>
			minLength === undefined || value.length >= minLength
			|| `expected string length >= <${minLength}>`
		),

		"{maxLength}": every(matching, value =>
			maxLength === undefined || value.length <= maxLength
			|| `expected string length <= <${maxLength}>`
		),

		"{pattern}": every(matching, value =>
			pattern === undefined || new RegExp(pattern).test(value)
			|| `expected string matching </${pattern}/>`
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


/**
 * Merges an overriding string shape with an inherited base shape.
 *
 * Combines constraints from `source` into `target`, enforcing that overrides only narrow inherited definitions.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns The merged shape with combined constraints
 *
 * @throws {RangeError} On incompatible overrides
 */
export function mergeString(target: StringShape, source: StringShape): StringShape {

	// conjunctive: pattern — combined using lookaheads

	const pattern = target.pattern !== undefined && source.pattern !== undefined
		? `(?=${source.pattern})${target.pattern}`
		: target.pattern ?? source.pattern;

	// conjunctive: in — intersection

	const allowed = target.in !== undefined && source.in !== undefined
		? target.in.filter(v => source.in!.includes(v))
		: target.in ?? source.in;

	// conjunctive: hasValue — union

	const hasValue = target.hasValue !== undefined && source.hasValue !== undefined
		? [...new Set([...target.hasValue, ...source.hasValue])]
		: target.hasValue ?? source.hasValue;

	// merged constraints

	const minLength = target.minLength ?? source.minLength;
	const maxLength = target.maxLength ?? source.maxLength;

	// validate

	const trace = collect({

		// structural: model must be strictly equal

		"{model}": target.model === source.model
			|| `mismatched types <${target.model}> and <${source.model}>`,

		// narrow: minLength — child >= parent

		"{minLength}": target.minLength === undefined || source.minLength === undefined
			|| target.minLength >= source.minLength
			|| `widened limit <${target.minLength}> beyond <${source.minLength}>`,

		// narrow: maxLength — child <= parent

		"{maxLength}": target.maxLength === undefined || source.maxLength === undefined
			|| target.maxLength <= source.maxLength
			|| `widened limit <${target.maxLength}> beyond <${source.maxLength}>`,

		// conjunctive: in — empty intersection

		"{in}": target.in === undefined || source.in === undefined
			|| allowed!.length !== 0
			|| `disjoint sets [${target.in}] and [${source.in}]`,

		// post-merge constraint consistency

		...wrap(checkString({

			minLength,
			maxLength,

			in: allowed,
			hasValue

		}))

	});

	if ( trace !== undefined ) {
		throw Object.assign(new RangeError("incompatible string shape override"), { trace });
	}

	// build shape — casts are safe: non-emptiness validated above

	return immutable({

		kind: target.kind,
		model: target.model,

		pattern,
		minLength,
		maxLength,

		in: allowed as StringShape["in"],
		hasValue: hasValue as StringShape["hasValue"]

	});

}

/**
 * Checks internal consistency of string shape constraints.
 *
 * @param constraints The constraint fields to validate
 *
 * @returns A keyed trace of violations, or `undefined` if all constraints are consistent
 */
export function checkString({

	minLength,
	maxLength,

	in: allowed,
	hasValue

}: {

	readonly minLength?: number;
	readonly maxLength?: number;

	readonly in?: readonly string[];
	readonly hasValue?: readonly string[];

}): undefined | Trace {

	return collect({

		"{minLength/maxLength}": minLength === undefined || maxLength === undefined
			|| minLength <= maxLength
			|| `inconsistent bounds <${minLength}> > <${maxLength}>`,

		"{hasValue/in}": hasValue === undefined || allowed === undefined
			|| hasValue.every(v => allowed.includes(v))
			|| `required values <${hasValue?.filter(v => !allowed.includes(v))}> not in allowed set`

	});

}
