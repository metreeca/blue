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
 * Language-tagged shape type guards and validation.
 *
 * Provides type guards for {@link LocalShape}, {@link LocalsShape}, and related constraint types, plus validators
 * enforcing length and language tag constraints on language-tagged string maps.
 *
 * @module
 */

import { isArray, isObject, isString } from "@metreeca/core";
import { isTag, matchTag } from "@metreeca/core/language";
import type { LocalShape, LocalsShape } from "./local.js";
import { every, trace } from "./trace.core.js";
import type { Trace } from "./trace.js";


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

	return trace({

		"{kind}": mistyped === 0
			|| `expected ${kind} values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

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

					return [key, trace({

						"{minLength}": minLength === undefined || value.length >= minLength
							|| `expected string length >= ${minLength}`,

						"{maxLength}": maxLength === undefined || value.length <= maxLength
							|| `expected string length <= ${maxLength}`,

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

	return trace({

		"{kind}": mistyped === 0
			|| `expected ${kind} values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

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

					return [key, trace({

						"{minLength}": every(value, text =>
							minLength === undefined || text.length >= minLength
							|| `expected string length >= ${minLength}`
						),

						"{maxLength}": every(value, text =>
							maxLength === undefined || text.length <= maxLength
							|| `expected string length <= ${maxLength}`
						),

						"{languageIn}": languageIn === undefined || languageIn.some(range => matchTag(key, range))
							|| `tag not in allowed languages [${languageIn.join(", ")}]`

					})];

				}

			}))

	});

}
