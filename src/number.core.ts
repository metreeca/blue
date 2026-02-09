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
 * Numeric shape type guards and validation.
 *
 * Provides type guards for {@link NumberShape}, {@link NumberConstraints}, and {@link NumericConstraints}, plus the
 * numeric value validator enforcing range and enumeration constraints.
 *
 * @module
 */

import { isArray, isNumber, isObject, isOptional, isString } from "@metreeca/core";
import type { Trace } from "./index.js";
import type { NumberConstraints, NumberShape, NumericConstraints } from "./number.js";


/**
 * Validation template for {@link NumericConstraints} fields.
 */
const NumericConstraintsTemplate = {

	minExclusive: (v: unknown) => isOptional(v, isNumber),
	maxExclusive: (v: unknown) => isOptional(v, isNumber),
	minInclusive: (v: unknown) => isOptional(v, isNumber),
	maxInclusive: (v: unknown) => isOptional(v, isNumber),

	in: (v: unknown) => isOptional(v, v => isArray(v, isNumber)),
	hasValue: (v: unknown) => isOptional(v, v => isArray(v, isNumber))

};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks whether a value is a {@link NumberShape}.
 *
 * @param value The value to check
 *
 * @returns true if `value` is a valid {@link NumberShape}; false otherwise
 */
export function isNumberShape(value: unknown): value is NumberShape {
	return isObject(value, {

		kind: v => v === "number",
		model: isNumber,

		...NumericConstraintsTemplate

	});
}

/**
 * Checks whether a value is a valid {@link NumberConstraints} object.
 *
 * @param value The value to check
 *
 * @returns true if `value` is a valid {@link NumberConstraints}; false otherwise
 */
export function isNumberConstraints(value: unknown): value is NumberConstraints {
	return isObject(value, {

		model: v => isOptional(v, isNumber),

		...NumericConstraintsTemplate

	});
}

/**
 * Checks whether a value is a valid {@link NumericConstraints} object.
 *
 * @param value The value to check
 *
 * @returns true if `value` is a valid {@link NumericConstraints}; false otherwise
 */
export function isNumericConstraints(value: unknown): value is NumericConstraints {
	return isObject(value, NumericConstraintsTemplate);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates numeric values against a shape.
 *
 * Enforces range constraints (minExclusive, maxExclusive, minInclusive, maxInclusive) and value constraints (in,
 * hasValue).
 *
 * @param values The numeric values to validate
 * @param shape The number shape defining validation constraints
 *
 * @returns A trace of validation errors, empty if all values are valid
 */
export function validateNumber(values: readonly number[], {

	minExclusive,
	maxExclusive,
	minInclusive,
	maxInclusive,

	in: allowed,
	hasValue

}: NumberShape): Trace {

	return [

		...values.flatMap(value => [

			(minExclusive === undefined || value > minExclusive)
			|| `expected values > ${minExclusive}`,

			(maxExclusive === undefined || value < maxExclusive)
			|| `expected values < ${maxExclusive}`,

			(minInclusive === undefined || value >= minInclusive)
			|| `expected values >= ${minInclusive}`,

			(maxInclusive === undefined || value <= maxInclusive)
			|| `expected values <= ${maxInclusive}`,

			(allowed === undefined || allowed.includes(value))
			|| `expected values in [${allowed.join(", ")}]`

		].filter(isString)),

		(hasValue === undefined || hasValue.every(value => values.includes(value)))
		|| `expected values to include [${hasValue?.join(", ")}]`

	].filter(isString);

}
