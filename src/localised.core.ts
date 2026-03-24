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
 * Language-tagged shape operators.
 *
 * @module
 */

import { isArray, isObject, isString } from "@metreeca/core";
import { immutable } from "@metreeca/core/deep";
import { isTag, isTagRange, matchTag, TagRange } from "@metreeca/core/language";
import { collect, every, TraceError, wrap } from "./core/trace.js";
import type { Trace } from "./index.js";
import type { LocalisedShape } from "./localised.js";


/**
 * Checks internal consistency of localised shape constraints.
 *
 * @param constraints The constraint fields to check
 *
 * @returns A keyed trace of violations, or `undefined` if all constraints are consistent
 */
export function checkLocalised({

	minLength,
	maxLength

}: {

	readonly minLength?: number;
	readonly maxLength?: number;

}): undefined | Trace {

	return collect({

		"{minLength/maxLength}": minLength === undefined || maxLength === undefined
			|| minLength <= maxLength
			|| `inconsistent bounds <${minLength}> > <${maxLength}>`

	});

}


/**
 * Validates localised state values against a {@link LocalisedShape}.
 *
 * Attempts both scalar and array validation, succeeding if either form is valid. Reports entries with
 * invalid tags or non-string values under per-entry trace keys, then enforces shape constraints on
 * structurally valid entries.
 *
 * @param values The values to validate
 * @param shape The localised shape to validate against
 *
 * @returns A trace of violations, or `undefined` if the values are valid
 */
export function validateLocalised(values: readonly unknown[], shape: LocalisedShape): undefined | Trace {

	return validateScalarLocalised(values, shape) !== undefined && validateArrayLocalised(values, shape) !== undefined
		? collect({ "{kind}": "expected either a scalar or an array <localised> value" })
		: undefined;

}

/**
 * Validates scalar localised state values against a {@link LocalisedShape}.
 *
 * Expects at most one value. Each tag holds a single string. Plain string shorthands are normalised
 * to the `und` tag.
 *
 * @param values The values to validate
 * @param shape The localised shape to validate against
 *
 * @returns A trace of violations, or `undefined` if the values are valid
 */
export function validateScalarLocalised(values: readonly unknown[], {

	minLength,
	maxLength,

	languageIn

}: LocalisedShape): undefined | Trace {

	if ( values.length === 0 ) {

		return undefined;

	} else if ( values.length > 1 ) {

		return collect({ "{kind}": "expected at most one <localised> value" });

	} else if ( !values.every(v => isString(v) || isObject(v)) ) {

		return collect({ "{kind}": "expected <localised> value" });

	} else {

		const value = values[0];

		return collect({

			...Object.fromEntries((isString(value) ? [["und", value]] : Object.entries(value)).map(([key, value]) => {

				if ( !isTag(key) ) {

					return [key, "invalid tag"];

				} else if ( !isString(value) ) {

					return [key, "expected string value"];

				} else {

					return [key, collect({

						"{minLength}": minLength === undefined || value.length >= minLength
							|| `expected string length >= <${minLength}>`,

						"{maxLength}": maxLength === undefined || value.length <= maxLength
							|| `expected string length <= <${maxLength}>`,

						"{languageIn}": languageIn === undefined || languageIn.some(range => matchTag(key, range))
							|| `unsupported tag for allowed languages [${languageIn.join(", ")}]`

					})];

				}

			}))

		});

	}

}

/**
 * Validates array localised state values against a {@link LocalisedShape}.
 *
 * Expects at most one value. Each tag holds a string array. Plain array shorthands are normalised
 * to the `und` tag.
 *
 * @param values The values to validate
 * @param shape The localised shape to validate against
 *
 * @returns A trace of violations, or `undefined` if the values are valid
 */
export function validateArrayLocalised(values: readonly unknown[], {

	minLength,
	maxLength,

	languageIn

}: LocalisedShape): undefined | Trace {

	if ( values.length === 0 ) {

		return undefined;

	} else if ( values.length > 1 ) {

		return collect({ "{kind}": "expected at most one <localised> value" });

	} else if ( !values.every(v => isString(v) || isArray(v) || isObject(v)) ) {

		return collect({ "{kind}": "expected <localised> value" });

	} else {

		const value = values[0];

		return collect({

			...Object.fromEntries((isString(value) ? [["und", [value]]] : isArray(value) ? [["und", value]] : Object.entries(value)).map(([key, value]) => {

				if ( !isTag(key) ) {

					return [key, "invalid tag"];

				} else if ( !isArray<string>(value, isString) ) {

					return [key, "expected string array value"];

				} else {

					return [key, collect({

						"{minLength}": every(value, text =>
							minLength === undefined || text.length >= minLength
							|| `expected string length >= <${minLength}>`
						),

						"{maxLength}": every(value, text =>
							maxLength === undefined || text.length <= maxLength
							|| `expected string length <= <${maxLength}>`
						),

						"{languageIn}": languageIn === undefined || languageIn.some(range => matchTag(key, range))
							|| `unsupported tag for allowed languages [${languageIn.join(", ")}]`

					})];

				}

			}))

		});

	}

}


/**
 * Validates a scalar locale template value.
 *
 * Accepts a plain string shorthand or an object with {@link TagRange} keys mapping to string values.
 *
 * @param value The template value to validate
 *
 * @returns A trace of violations, or `undefined` if the value is valid
 */
export function validateScalarLocale(value: unknown): undefined | Trace {

	if ( isString(value) ) {

		return undefined;

	} else if ( isObject(value) ) {

		return collect(Object.fromEntries(Object.entries(value).map(([k, v]) => [k,
			!isTagRange(k) ? "invalid tag range"
				: isString(v) ? undefined
					: "expected string value"
		])));

	} else {

		return "expected <localised> value";

	}

}

/**
 * Validates an array locale template value.
 *
 * Accepts a plain string shorthand, a singleton string array shorthand, or an object with {@link TagRange} keys
 * mapping to string or singleton string array values.
 *
 * @param value The template value to validate
 *
 * @returns A trace of violations, or `undefined` if the value is valid
 */
export function validateArrayLocale(value: unknown): undefined | Trace {

	if ( isString(value) ) {

		return undefined;

	} else if ( isArray(value, [isString]) ) {

		return undefined;

	} else if ( isObject(value) ) {

		return collect(Object.fromEntries(Object.entries(value).map(([k, v]) => [k,
			!isTagRange(k) ? "invalid tag range"
				: isString(v) ? undefined
					: isArray(v, [isString]) ? undefined
						: "expected string or singleton string tuple"
		])));

	} else {

		return "expected <localised> value";

	}

}


/**
 * Merges an overriding localised shape with an inherited base shape.
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
export function mergeLocalised(target: LocalisedShape, source: LocalisedShape): LocalisedShape {

	// conjunctive: languageIn — intersection

	const languageIn = target.languageIn !== undefined && source.languageIn !== undefined
		? target.languageIn.filter(v => source.languageIn!.includes(v))
		: target.languageIn ?? source.languageIn;

	// merged constraints

	const minLength = target.minLength ?? source.minLength;
	const maxLength = target.maxLength ?? source.maxLength;

	// validate

	const trace = collect({

		// narrow: minLength — child >= parent

		"{minLength}": target.minLength === undefined || source.minLength === undefined
			|| target.minLength >= source.minLength
			|| `widened limit <${target.minLength}> beyond <${source.minLength}>`,

		// narrow: maxLength — child <= parent

		"{maxLength}": target.maxLength === undefined || source.maxLength === undefined
			|| target.maxLength <= source.maxLength
			|| `widened limit <${target.maxLength}> beyond <${source.maxLength}>`,

		// conjunctive: languageIn — empty intersection

		"{languageIn}": target.languageIn === undefined || source.languageIn === undefined
			|| languageIn!.length !== 0
			|| `disjoint sets [${target.languageIn}] and [${source.languageIn}]`,

		// post-merge constraint consistency

		...wrap(checkLocalised({ minLength, maxLength }))

	});

	if ( trace !== undefined ) {
		throw new TraceError("incompatible localised shape override", trace);
	}

	// build shape — child model overrides parent

	return immutable({

		kind: target.kind,
		model: target.model,

		minLength,
		maxLength,

		languageIn: languageIn as LocalisedShape["languageIn"] // casts are safe: non-emptiness validated above

	});

}
