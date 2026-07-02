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
import { immutable } from "@metreeca/core/deep";
import { collect, every, group, TraceError, wrap } from "./index.core.js";
import type { Trace } from "./index.js";
import type { StringShape } from "./string.js";


/**
 * Checks internal consistency of string shape constraints.
 *
 * @param constraints The constraint fields to validate
 *
 * @returns A keyed trace of violations, or `undefined` if all constraints are consistent
 */
export function checkString({

	model,

	minLength,
	maxLength,

	pattern,

	in: allowed,
	hasValue

}: {

	readonly model?: string;

	readonly minLength?: number;
	readonly maxLength?: number;

	readonly pattern?: string;

	readonly in?: readonly [string, ...string[]];
	readonly hasValue?: readonly string[];

}): undefined | Trace {

	return collect({

		"{minLength/maxLength}": minLength === undefined || maxLength === undefined
			|| minLength <= maxLength
			|| `inconsistent bounds <${minLength}> > <${maxLength}>`,

		"{hasValue/in}": hasValue === undefined || allowed === undefined
			|| hasValue.every(v => allowed.includes(v))
			|| `required values <${hasValue?.filter(v => !allowed.includes(v))}> not in allowed set`,

		// model legality: probe the prototype with the regular validator, dropping the set-level hasValue

		"{model}": model === undefined || validateString([model], {
			kind: "string", model, minLength, maxLength, pattern, in: allowed
		})

	});

}

/**
 * Reports whether an overriding string shape narrows an inherited base shape.
 *
 * Tests the override relation without building the merged shape: returns `undefined` when `target` only tightens
 * `source` (matching `datatype` and `pattern`, lengths not widened, `in` intersection non-empty, merged
 * constraints consistent), or a keyed {@link Trace} describing the obstacles otherwise.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns A keyed trace of narrowing obstacles, or `undefined` when `target` narrows `source`
 */
export function narrowsString(target: StringShape, source: StringShape): undefined | Trace {

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

	return collect({

		// structural: datatype must be strictly equal when both defined

		"{datatype}": target.datatype === undefined || source.datatype === undefined
			|| target.datatype === source.datatype
			|| `mismatched datatypes <${target.datatype}> and <${source.datatype}>`,

		// structural: pattern must be strictly equal when both defined

		"{pattern}": target.pattern === undefined || source.pattern === undefined
			|| target.pattern === source.pattern
			|| `mismatched patterns <${target.pattern}> and <${source.pattern}>`,

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

			// ;(cast) the merge intersection is a plain array; its non-emptiness is reported by {in} above

			in: allowed as StringShape["in"],
			hasValue

		}))

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
 * @throws {TraceError} On incompatible overrides
 */
export function mergeString(target: StringShape, source: StringShape): StringShape {

	const trace = narrowsString(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible string shape override", trace);
	}

	// structural: pattern — equal when both defined (enforced by narrowsString)

	const pattern = target.pattern ?? source.pattern;

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

	// build shape — casts are safe: non-emptiness validated above

	return immutable({

		kind: target.kind,
		model: target.model,
		datatype: target.datatype ?? source.datatype,

		pattern,
		minLength,
		maxLength,

		in: allowed as StringShape["in"],
		hasValue: hasValue as StringShape["hasValue"]

	});

}

/**
 * Derives a legal prototype model for a string shape, throwing when none can be drawn.
 *
 * Draws the shortest `in` member, else the shortest `hasValue` member, else the supplied `model`, else a `*`-filled
 * string of `minLength` characters (a string carries no magnitude to interpolate), falling back to the empty string.
 * The drawn value is validated and a {@link TraceError} is thrown when it is not a legal member of the shape's value
 * space (for example when a `pattern` rejects the synthesised string).
 *
 * @param constraints The shape constraints, including the optional `model`, the resolved value must satisfy
 *
 * @returns A legal prototype model
 *
 * @throws {TraceError} When the resolved model is not legal
 */
export function deriveString({

	model,

	minLength,
	maxLength,

	pattern,

	in: allowed,
	hasValue

}: {

	readonly model?: string;

	readonly minLength?: number;
	readonly maxLength?: number;

	readonly pattern?: string;

	readonly in?: readonly [string, ...string[]];
	readonly hasValue?: readonly [string, ...string[]];

}): string {

	const value = allowed !== undefined ? minimal(allowed)
		: hasValue !== undefined ? minimal(hasValue)
			: model !== undefined ? model
				: minLength !== undefined ? "*".repeat(minLength)
					: "";

	function minimal(values: readonly string[]): string {
		return values.reduce((a, b) => b.length < a.length ? b : a);
	}

	const trace = validateString([value], {

		kind: "string",
		model: value,

		minLength,
		maxLength,
		pattern,

		in: allowed

	});

	if ( trace !== undefined ) {
		throw new TraceError("inconsistent string shape constraints", trace);
	}

	return value;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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

}: StringShape, {

	model = false

}: {

	model?: boolean

} = {}): undefined | Trace {

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

		"{hasValue}": model || group(matching, group =>
			hasValue === undefined || hasValue.every(v => group.includes(v))
			|| `expected values to include [${hasValue.join(", ")}]`
		)

	});

}
