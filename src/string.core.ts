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
 * String shape type guards and validation.
 *
 * Provides type guards for {@link StringShape}, {@link StringConstraints}, and {@link TextualConstraints}, plus the
 * string value validator enforcing length, pattern, and enumeration constraints.
 *
 * @module
 */

import { isString } from "@metreeca/core";
import type { StringConstraints, StringShape, TextualConstraints } from "./string.js";
import { every, group, trace } from "./trace.core.js";
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

	return trace({

		"{kind}": mistyped === 0
			|| `expected ${kind} values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		"{minLength}": every(matching, value =>
			minLength === undefined || value.length >= minLength
			|| `expected string length >= ${minLength}`
		),

		"{maxLength}": every(matching, value =>
			maxLength === undefined || value.length <= maxLength
			|| `expected string length <= ${maxLength}`
		),

		"{pattern}": every(matching, value =>
			pattern === undefined || new RegExp(pattern).test(value)
			|| `expected string matching /${pattern}/`
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
