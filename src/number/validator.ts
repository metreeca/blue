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
 * Number value validation.
 *
 * Holds a value to what a number shape admits and reports everything wrong with it at once, keyed by the facet at
 * fault, at the strictness the caller asks for: a stored value, a relational bound, or a retrieval placeholder.
 *
 * @module
 */

import { isNumber, type Optional } from "@metreeca/core";
import { all, array, domain, gt, gte, integer, lt, lte, type Trace, type, values as contains } from "@metreeca/core/trace";
import type { Scope } from "../value/validator.js";
import { type NumberShape } from "./index.js";


/**
 * Validates values against a number shape.
 *
 * Reports each value that is not a number as a `{type}` violation and each number that breaks a constraint under its
 * own facet, keying every element violation by its index, so that a caller may tell which value failed and why;
 * membership over the whole set (`hasValue`) is reported as a leading bare message.
 *
 * @param values The values to validate
 * @param shape The shape the values are matched against
 * @param opts Validation options
 * @param opts.scope The {@link Scope | strictness} the shape is enforced at, defaulting to `"state"`. A number carries
 *     no lexical discriminator, so `"bound"` matches by kind alone, exactly as `"model"` does
 *
 * @returns A trace of the violations found, or `undefined` where every value matches `shape`
 */
export function validateNumber(values: readonly unknown[], shape: NumberShape, {

	scope = "state"

}: {

	scope?: Scope

} = {}): Optional<Trace> {

	switch ( scope ) {

		case "state":

			return state(shape)(values);

		case "bound":

			return bound(shape)(values);

		case "model":

			return model(shape)(values);

	}


	function state({

		minExclusive,
		maxExclusive,
		minInclusive,
		maxInclusive,

		integral,

		in: allowed,
		hasValue: required

	}: NumberShape) {

		return array(
			type(isNumber,
				all(
					integral && integer(),
					gt(minExclusive),
					lt(maxExclusive),
					gte(minInclusive),
					lte(maxInclusive),
					domain(allowed)
				)
			),
			contains(required)
		);

	}

	function bound({}: NumberShape) {

		return array(
			type(isNumber)
		);

	}

	function model({}: NumberShape) {

		return array(
			type(isNumber)
		);

	}

}
