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

import { isArray, isNumber, isObject, isOptional, isString } from "@metreeca/core";
import { isTagRange, matchTag } from "@metreeca/core/language";
import { isLocale, isLocales } from "@metreeca/qest/model";
import type { Local, Locals } from "@metreeca/qest/state";
import type { LocalConstraints, LocalizedConstraints, LocalsConstraints, LocalShape, LocalsShape } from "./local.js";
import { every, trace } from "./trace.core.js";
import type { Trace } from "./trace.js";


/**
 * Validation template for {@link LocalizedConstraints} fields.
 */
const LocalizedConstraintsTemplate = {

	minLength: (v: unknown) => isOptional(v, isNumber),
	maxLength: (v: unknown) => isOptional(v, isNumber),

	languageIn: (v: unknown) => isOptional(v, v => isArray(v, isTagRange))

};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks whether a value is a {@link LocalShape}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has `kind: "local"`, a `model` mapping language tag ranges to strings, and valid optional
 *     constraints (`minLength`, `maxLength`, `languageIn`); false otherwise
 */
export function isLocalShape(value: unknown): value is LocalShape {
	return isObject(value, {

		kind: v => v === "local",
		model: isLocale,

		...LocalizedConstraintsTemplate

	});
}

/**
 * Checks whether a value is a {@link LocalsShape}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has `kind: "locals"`, a `model` mapping language tag ranges to string arrays, and valid
 *     optional constraints (`minLength`, `maxLength`, `languageIn`); false otherwise
 */
export function isLocalsShape(value: unknown): value is LocalsShape {
	return isObject(value, {

		kind: v => v === "locals",
		model: isLocales,

		...LocalizedConstraintsTemplate

	});
}

/**
 * Checks whether a value is a valid {@link LocalConstraints} object.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has valid optional constraints (`model`, `minLength`, `maxLength`, `languageIn`); false
 *     otherwise
 */
export function isLocalConstraints(value: unknown): value is LocalConstraints {
	return isObject(value, {

		model: (v: unknown) => isOptional(v, isLocale),

		...LocalizedConstraintsTemplate

	});
}

/**
 * Checks whether a value is a valid {@link LocalsConstraints} object.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has valid optional constraints (`model`, `minLength`, `maxLength`, `languageIn`); false
 *     otherwise
 */
export function isLocalsConstraints(value: unknown): value is LocalsConstraints {
	return isObject(value, {

		model: (v: unknown) => isOptional(v, isLocales),

		...LocalizedConstraintsTemplate

	});
}

/**
 * Checks whether a value is a valid {@link LocalizedConstraints} object.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has valid optional constraints (`minLength`, `maxLength`, `languageIn`); false otherwise
 */
export function isLocalizedConstraints(value: unknown): value is LocalizedConstraints {
	return isObject(value, LocalizedConstraintsTemplate);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates single-valued language-tagged maps against a shape.
 *
 * Enforces length constraints (`minLength`, `maxLength`) on string values and language tag constraints (`languageIn`)
 * on tags. Plain string values are normalised to `{ und: value }` before validation. Returns a keyed trace where outer
 * keys are language tags and inner keys are constraint names, or `undefined` if all values pass validation.
 *
 * @param values The local values to validate
 * @param shape The local shape defining validation constraints
 *
 * @returns A keyed trace of constraint violations per language tag, or `undefined` if all values are valid
 */
export function validateLocal(values: readonly Local[], {

	minLength,
	maxLength,

	languageIn

}: LocalShape): undefined | Trace {

	return trace(Object.fromEntries(values
		.map(value => isString(value) ? { und: value } : value)
		.flatMap(value => Object.entries(value)).map(([tag, text]) => [tag, trace({

			minLength: minLength === undefined || text.length >= minLength
				|| `expected string length >= ${minLength}`,

			maxLength: maxLength === undefined || text.length <= maxLength
				|| `expected string length <= ${maxLength}`,

			languageIn: languageIn === undefined || languageIn.some(range => matchTag(tag, range))
				|| `tag not in allowed languages [${languageIn.join(", ")}]`

		})])
	));

}

/**
 * Validates multi-valued language-tagged maps against a shape.
 *
 * Enforces length constraints (`minLength`, `maxLength`) on string values and language tag constraints (`languageIn`)
 * on tags. Plain string array values are normalised to `{ und: values }` before validation. Returns a keyed trace
 * where outer keys are language tags and inner keys are constraint names, or `undefined` if all values pass validation.
 *
 * @param values The locals values to validate
 * @param shape The locals shape defining validation constraints
 *
 * @returns A keyed trace of constraint violations per language tag, or `undefined` if all values are valid
 */
export function validateLocals(values: readonly Locals[], {

	minLength,
	maxLength,

	languageIn

}: LocalsShape): undefined | Trace {

	return trace(Object.fromEntries(values
		.map(value => isArray(value) ? { und: value } : value)
		.flatMap(value => Object.entries(value)).map(([tag, texts]: [string, readonly string[]]) => [tag, trace({

			minLength: every(texts, text =>
				minLength === undefined || text.length >= minLength
				|| `expected string length >= ${minLength}`
			),

			maxLength: every(texts, text =>
				maxLength === undefined || text.length <= maxLength
				|| `expected string length <= ${maxLength}`
			),

			languageIn: languageIn === undefined || languageIn.some(range => matchTag(tag, range))
				|| `tag not in allowed languages [${languageIn.join(", ")}]`

		})])
	));

}
