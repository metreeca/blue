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
import { isTag, matchTag } from "@metreeca/core/language";
import { immutable } from "@metreeca/core/nested";
import { collect, every, TraceError, wrap } from "./core/trace.js";
import type { Trace } from "./index.js";
import type { LocalShape, LocalsShape } from "./local.js";


/**
 * Validates values against a local shape.
 *
 * Performs inline structural validation on each value, reporting non-string object entries
 * with invalid tags or non-string values under per-entry trace keys, then enforces
 * local constraints on structurally valid entries.
 */
export function validateLocal(values: readonly unknown[], {

	kind,

	minLength,
	maxLength,

	languageIn

}: LocalShape): undefined | Trace {

	const matching = values.filter(value => isString(value) || isObject(value));
	const mistyped = values.length-matching.length;

	return collect({

		"{kind}": mistyped === 0
			|| `expected <${kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		...Object.fromEntries(matching

			.flatMap(value =>
				isString(value) ? [["und", value] as [string, unknown]] : Object.entries(value)
			)

			.map(([key, value]) => {

				if ( !isTag(key) ) {

					return [key, "invalid tag"];

				} else if ( !isString(value) ) {

					return [key, `expected string value`];

				} else {

					return [key, collect({

						"{minLength}": minLength === undefined || value.length >= minLength
							|| `expected string length >= <${minLength}>`,

						"{maxLength}": maxLength === undefined || value.length <= maxLength
							|| `expected string length <= <${maxLength}>`,

						"{languageIn}": languageIn === undefined || languageIn.some(range => matchTag(key, range))
							|| `tag not in allowed languages [${languageIn.join(", ")}]`

					})];

				}

			}))

	});

}

/**
 * Validates values against a locals shape.
 *
 * Performs inline structural validation on each value, reporting non-array object entries
 * with invalid tags or non-string-array values under per-entry trace keys, then enforces
 * locals constraints on structurally valid entries.
 */
export function validateLocals(values: readonly unknown[], {

	kind,

	minLength,
	maxLength,

	languageIn

}: LocalsShape): undefined | Trace {

	const matching = values.filter(value => isArray(value) || isObject(value));
	const mistyped = values.length-matching.length;

	return collect({

		"{kind}": mistyped === 0
			|| `expected <${kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		...Object.fromEntries(matching

			.flatMap(value =>
				isArray(value) ? [["und", value] as [string, unknown]] : Object.entries(value)
			)

			.map(([key, value]) => {

				if ( !isTag(key) ) {

					return [key, "invalid tag"];

				} else if ( !isArray<string>(value, isString) ) {

					return [key, `expected string array value`];

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
							|| `tag not in allowed languages [${languageIn.join(", ")}]`

					})];

				}

			}))

	});

}


/**
 * Merges an overriding local shape with an inherited base shape.
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
export function mergeLocal(target: LocalShape, source: LocalShape): LocalShape {

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

		...wrap(checkLocalized({ minLength, maxLength }))

	});

	if ( trace !== undefined ) {
		throw new TraceError("incompatible local shape override", trace);
	}

	// build shape — child model overrides parent

	return immutable({

		kind: target.kind,
		model: target.model,

		minLength,
		maxLength,

		languageIn: languageIn as LocalShape["languageIn"] // casts are safe: non-emptiness validated above

	});

}

/**
 * Merges an overriding locals shape with an inherited base shape.
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
export function mergeLocals(target: LocalsShape, source: LocalsShape): LocalsShape {

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

		...wrap(checkLocalized({ minLength, maxLength }))

	});

	if ( trace !== undefined ) {
		throw new TraceError("incompatible locals shape override", trace);
	}

	// build shape — child model overrides parent

	return immutable({

		kind: target.kind,
		model: target.model,

		minLength,
		maxLength,

		languageIn: languageIn as LocalsShape["languageIn"] // casts are safe: non-emptiness validated above

	});

}


/**
 * Checks internal consistency of localized shape constraints.
 *
 * @param constraints The constraint fields to check
 *
 * @returns A keyed trace of violations, or `undefined` if all constraints are consistent
 */
export function checkLocalized({

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
