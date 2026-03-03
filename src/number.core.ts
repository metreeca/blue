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

import { isArray, isNumber, isObject, isOptional } from "@metreeca/core";
import type { NumberConstraints, NumberShape, NumericConstraints } from "./number.js";
import { every, group, trace } from "./trace.core.js";
import type { Trace } from "./trace.js";


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
 * @group Guards
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
 * @group Guards
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
 * @group Guards
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
 * Enforces range constraints (`minExclusive`, `maxExclusive`, `minInclusive`, `maxInclusive`) and value constraints
 * (`in`, `hasValue`). Returns a keyed trace where each key is the SHACL-derived constraint name and the value is the
 * violation message, or `undefined` if all values pass validation.
 *
 * @param values The numeric values to validate
 * @param shape The number shape defining validation constraints
 *
 * @returns A keyed trace of constraint violations, or `undefined` if all values are valid
 */
export function validateNumber(values: readonly number[], {

	minExclusive,
	maxExclusive,
	minInclusive,
	maxInclusive,

	in: allowed,
	hasValue

}: NumberShape): undefined | Trace {

	return trace({

		minExclusive: every(values, value =>
			minExclusive === undefined || value > minExclusive
			|| `expected values > ${minExclusive}`
		),

		maxExclusive: every(values, value =>
			maxExclusive === undefined || value < maxExclusive
			|| `expected values < ${maxExclusive}`
		),

		minInclusive: every(values, value =>
			minInclusive === undefined || value >= minInclusive
			|| `expected values >= ${minInclusive}`
		),

		maxInclusive: every(values, value =>
			maxInclusive === undefined || value <= maxInclusive
			|| `expected values <= ${maxInclusive}`
		),

		in: every(values, value =>
			allowed === undefined || allowed.includes(value)
			|| `expected values in [${allowed.join(", ")}]`
		),

		hasValue: group(values, group =>
			hasValue === undefined || hasValue.every(v => group.includes(v))
			|| `expected values to include [${hasValue.join(", ")}]`
		)

	});

}
