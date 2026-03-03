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
 * Boolean shape type guards and validation.
 *
 * Provides type guards for {@link BooleanShape} and {@link BooleanConstraints}, plus the boolean value validator.
 *
 * @module
 */

import { isBoolean, isObject, isOptional } from "@metreeca/core";
import type { BooleanConstraints, BooleanShape } from "./boolean.js";

import type { Trace } from "./trace.js";


/**
 * Checks whether a value is a {@link BooleanShape}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` is a valid {@link BooleanShape}; false otherwise
 */
export function isBooleanShape(value: unknown): value is BooleanShape {
	return isObject(value, {

		kind: v => v === "boolean",
		model: isBoolean

	});
}

/**
 * Checks whether a value is a valid {@link BooleanConstraints} object.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` is a valid {@link BooleanConstraints}; false otherwise
 */
export function isBooleanConstraints(value: unknown): value is BooleanConstraints {
	return isObject(value, {

		model: (v: unknown) => isOptional(v, isBoolean)

	});
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates boolean values against a shape.
 *
 * Boolean values have no additional constraints beyond type checking, so this always returns `undefined`.
 *
 * @param values The boolean values to validate
 * @param shape The boolean shape (unused, as booleans have no constraints)
 *
 * @returns `undefined` (booleans have no value constraints)
 */
export function validateBoolean(values: readonly boolean[], {}: BooleanShape): undefined | Trace {

	return undefined;

}
