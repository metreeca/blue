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
 * Reference value validation.
 *
 * Holds a value to what a reference shape admits and reports everything wrong with it at once: an IRI naming a
 * resource of the target shape, held to the target's own identifier constraints at the strictness the caller asks for.
 *
 * @module
 */

import { type Optional } from "@metreeca/core";
import { isIRI } from "@metreeca/core/resource";
import { all, array, domain, test, type Trace, type, values as contains } from "@metreeca/core/trace";
import { isReference } from "@metreeca/qest/resource";
import { eager } from "../value/accessors.js";
import type { Scope } from "../value/validator.js";
import type { ReferenceShape } from "./index.js";
import type { ResourceShape } from "../resource/index.js";
import { match } from "../value/validator.js";


/**
 * Validates values against a reference shape.
 *
 * Reports each value that is not an IRI naming a resource as a `{type}` violation and each IRI the target refuses
 * under its own facet, keying every element violation by its index, so that a caller may tell which link failed and
 * why; membership over the whole set (`hasValue`) is reported as a leading bare message. A reference states no
 * constraint of its own, so the ones enforced are the ones the target puts on its own identifiers.
 *
 * @param values The values to validate
 * @param shape The shape the values are matched against
 * @param opts Validation options
 * @param opts.scope The {@link Scope | strictness} the shape is enforced at, defaulting to `"state"`. A `"bound"` keeps
 *     the target's IRI `pattern`, the syntactic discriminator, and skips its value-domain constraints; a `"model"`
 *     skips every target constraint and admits any IRI reference, relative and empty forms included, as a placeholder
 *     names nothing yet
 *
 * @returns A trace of the violations found, or `undefined` where every value matches `shape`
 */
export function validateReference(values: readonly unknown[], shape: ReferenceShape, {

	scope = "state"

}: {

	scope?: Scope

} = {}): Optional<Trace> {

	const target = eager(shape.target);

	switch ( scope ) {

		case "state":

			return state(target)(values);

		case "bound":

			return bound(target)(values);

		case "model":

			return model(target)(values);

	}


	function state({ pattern, in: allowed, hasValue: required }: ResourceShape) {

		return array(
			type(isReference,
				all(
					matches(pattern),
					domain(allowed)
				)
			),
			contains(required)
		);

	}

	function bound({ pattern }: ResourceShape) {

		return array(
			type(isReference,
				all(
					matches(pattern)
				)
			)
		);

	}

	function model({}: ResourceShape) {

		return array(
			type(isIRI)
		);

	}

	function matches(pattern: undefined | string) {

		return pattern !== undefined && test<string>(value =>
			match(value, pattern) || [`{format} expected IRI matching pattern <${pattern}>`]
		);

	}

}
