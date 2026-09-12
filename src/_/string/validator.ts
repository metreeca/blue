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
 * Textual value validation.
 *
 * Holds a value to what a textual shape admits and reports everything wrong with it at once, keyed by the facet at
 * fault, at the strictness the caller asks for: a stored value, a relational bound, or a retrieval placeholder.
 *
 * @module
 */

import { isString, type Optional } from "@metreeca/core";
import { all, array, domain, length, pass, test, type Trace, type, type Validator, values as contains }
	from "@metreeca/core/trace";
import type { Scope } from "../index.core.js";
import { type StringShape } from "./index.js";


/**
 * Validates values against a textual shape.
 *
 * Reports each value that is not a string as a `{type}` violation and each string that breaks a constraint under its
 * own facet, keying every element violation by its index, so that a caller may tell which value failed and why;
 * membership over the whole set (`hasValue`) is reported as a leading bare message.
 *
 * @param values The values to validate
 * @param shape The shape the values are matched against
 * @param opts Validation options
 * @param opts.scope The {@link Scope | strictness} the shape is enforced at, defaulting to `"state"`
 *
 * @returns A trace of the violations found, or `undefined` where every value matches `shape`
 */
export function validateString(values: readonly unknown[], shape: StringShape, {

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

		minLength,
		maxLength,

		pattern,

		in: allowed,
		hasValue: required

	}: StringShape) {

		return array(
			type(isString,
				all(
					length(minLength, maxLength),
					domain(allowed),
					format(pattern)
				)
			),
			contains(required)
		);

	}

	function bound({

		pattern

	}: StringShape) {

		return array(
			type(isString,
				format(pattern)
			)
		);

	}

	function model({}: StringShape) {

		return array(
			type(isString)
		);

	}

	function format(pattern: undefined | string): Validator<string> {

		if ( pattern === undefined ) {

			return pass;

		} else {

			const regex = new RegExp(pattern);
			const mismatched = [`{format} expected string matching </${pattern}/>`];

			return test(value => regex.test(value) || mismatched);

		}

	}

}
