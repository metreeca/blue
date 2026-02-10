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

import { isArray, isNumber, isObject, isOptional, isRegExp, isString } from "@metreeca/core";
import type { Trace } from "./index.js";
import type { StringConstraints, StringShape, TextualConstraints } from "./string.js";


/**
 * Validation template for {@link TextualConstraints} fields.
 */
const TextualConstraintsTemplate = {

	in: (v: unknown) => isOptional(v, v => isArray(v, isString)),
	hasValue: (v: unknown) => isOptional(v, v => isArray(v, isString))

};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks whether a value is a {@link StringShape}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has `kind: "string"`, a required `model` string, and valid optional constraints
 *     (`minLength`, `maxLength`, `pattern`, `in`, `hasValue`); false otherwise
 */
export function isStringShape(value: unknown): value is StringShape {
	return isObject(value, {

		kind: v => v === "string",
		model: isString,

		minLength: (v: unknown) => isOptional(v, isNumber),
		maxLength: (v: unknown) => isOptional(v, isNumber),

		pattern: (v: unknown) => isOptional(v, isString),

		...TextualConstraintsTemplate

	});
}

/**
 * Checks whether a value is a valid {@link StringConstraints} object.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has valid optional constraints (`model`, `minLength`, `maxLength`, `pattern`, `in`,
 *     `hasValue`); false otherwise
 */
export function isStringConstraints(value: unknown): value is StringConstraints {
	return isObject(value, {

		model: (v: unknown) => isOptional(v, isString),

		minLength: (v: unknown) => isOptional(v, isNumber),
		maxLength: (v: unknown) => isOptional(v, isNumber),

		pattern: (v: unknown) => isOptional(v, v => isString(v) || isRegExp(v)),

		...TextualConstraintsTemplate

	});
}

/**
 * Checks whether a value is a valid {@link TextualConstraints} object.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has valid optional constraints (`in`, `hasValue`); false otherwise
 */
export function isTextualConstraints(value: unknown): value is TextualConstraints {
	return isObject(value, TextualConstraintsTemplate);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates string values against a shape.
 *
 * Enforces length constraints (minLength, maxLength), pattern matching, and value constraints (in, hasValue).
 *
 * @param values The string values to validate
 * @param shape The string shape defining validation constraints
 *
 * @returns A trace of validation errors, empty if all values are valid
 */
export function validateString(values: readonly string[], {

	minLength,
	maxLength,

	pattern,

	in: allowed,
	hasValue

}: StringShape): Trace {

	return [

		...values.flatMap(value => [

			(minLength === undefined || value.length >= minLength)
			|| `expected string length >= ${minLength}`,

			(maxLength === undefined || value.length <= maxLength)
			|| `expected string length <= ${maxLength}`,

			(pattern === undefined || new RegExp(pattern).test(value))
			|| `expected string matching /${pattern}/`,

			(allowed === undefined || allowed.includes(value))
			|| `expected values in [${allowed.join(", ")}]`

		].filter(isString)),

		(hasValue === undefined || hasValue.every(value => values.includes(value)))
		|| `expected values to include [${hasValue?.join(", ")}]`

	].filter(isString);

}
