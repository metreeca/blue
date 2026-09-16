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
 * Boolean value validation.
 *
 * Holds a value to what a boolean shape admits and reports everything wrong with it at once, keyed by the facet at
 * fault, at the strictness the caller asks for: a stored value, a relational bound, or a retrieval placeholder.
 *
 * @module
 */

import { isBoolean, type Optional } from "@metreeca/core";
import { array, pass, type Trace, type, type Validator } from "@metreeca/core/trace";
import { type Scope, scoped } from "../value/validator.js";
import type { BooleanShape } from "./index.js";


/**
 * Validates values against a boolean shape.
 *
 * Reports each value that is not a boolean as a `{type}` violation and each boolean the enumeration leaves out under
 * its own facet, keying every element violation by its index, so that a caller may tell which value failed and why.
 *
 * @param values The values to validate
 * @param shape The shape the values are matched against
 * @param opts Validation options
 * @param opts.scope The {@link Scope | strictness} the shape is enforced at, defaulting to `"state"`. A boolean carries
 *     no lexical discriminator, so `"bound"` matches by kind alone, exactly as `"model"` does
 *
 * @returns A trace of the violations found, or `undefined` where every value matches `shape`
 */
export const validateBoolean: (values: readonly unknown[], shape: BooleanShape, opts?: {

	scope?: Scope

}) => Optional<Trace> = scoped(state, model, model); // a bound is matched by kind alone, exactly as a model is


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Every constraint: a legal element of the shape's domain.
 */
function state({

	in: allowed

}: BooleanShape): Validator<readonly unknown[]> {

	return array(
		type(isBoolean,
			domain(allowed)
		)
	);

}

/**
 * The kind alone: a boolean carries no lexical discriminator, so neither a relational bound nor a retrieval
 * placeholder is held to anything further.
 */
function model({}: BooleanShape): Validator<readonly unknown[]> {

	return array(
		type(isBoolean)
	);

}

/**
 * Matches a boolean against the value a shape enumerates, admitting both truth values where it enumerates none.
 */
function domain(allowed: undefined | boolean): Validator<boolean> {

	if ( allowed === undefined ) {

		return pass;

	} else {

		const outside = [`{domain} expected value in [${allowed}]`];

		return value => value === allowed ? undefined : outside;

	}

}
