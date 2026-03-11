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
 * Value shape operators.
 *
 * @module
 */

import { mergeBoolean, validateBoolean } from "./boolean.core.js";
import type { BooleanShape } from "./boolean.js";
import type { Trace, ValueShape } from "./index.js";
import { mergeLocal, mergeLocals, validateLocal, validateLocals } from "./local.core.js";
import type { LocalShape, LocalsShape } from "./local.js";
import { mergeNumber, validateNumber } from "./number.core.js";
import type { NumberShape } from "./number.js";
import { mergeReference, mergeResource, validateReference, validateResource } from "./resource.core.js";
import type { ReferenceShape, ResourceShape } from "./resource.js";
import { mergeString, validateString } from "./string.core.js";
import { type StringShape } from "./string.js";


/**
 * Validates values against a shape, dispatching to the appropriate type-specific validator.
 *
 * @param values The values to validate
 * @param shape The shape defining validation constraints
 *
 * @returns A keyed trace of validation errors, or `undefined` if all values are valid
 */
export function validateValue(values: readonly unknown[], shape: ValueShape): undefined | Trace {

	switch ( shape.kind ) {

		case "boolean":

			return validateBoolean(values, shape);

		case "number":

			return validateNumber(values, shape);

		case "string":

			return validateString(values, shape);

		case "local":

			return validateLocal(values, shape);

		case "locals":

			return validateLocals(values, shape);

		case "reference":

			return validateReference(values, shape);

		case "resource":

			return validateResource(values, shape);

	}

}

/**
 * Merges an overriding value shape with an inherited base shape.
 *
 * Dispatches to the appropriate shape-specific merge function based on the `kind` discriminator.
 * Both shapes must have the same `kind`; a mismatch throws a `RangeError`.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns The merged shape
 *
 * @throws {TraceError} On kind mismatch or incompatible overrides
 */
export function mergeValue<T extends ValueShape>(target: T, source: T): T {

	switch ( target.kind ) {

		case "boolean":

			return mergeBoolean(target, source as BooleanShape) as T;

		case "number":

			return mergeNumber(target, source as NumberShape) as T;

		case "string":

			return mergeString(target, source as StringShape) as T;

		case "local":

			return mergeLocal(target, source as LocalShape) as T;

		case "locals":

			return mergeLocals(target, source as LocalsShape) as T;

		case "reference":

			return mergeReference(target, source as ReferenceShape) as T;

		case "resource":

			return mergeResource(target, source as ResourceShape) as T;

	}

}
