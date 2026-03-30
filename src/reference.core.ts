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
 * Reference shape operators.
 *
 * @module
 */

import { isIRI } from "@metreeca/core/resource";
import type { Reference } from "@metreeca/qest";
import { collect, every, group, TraceError } from "./index.core.js";
import type { Trace } from "./index.js";
import type { ReferenceShape } from "./reference.js";
import { match } from "./resource.core.js";
import { immutable } from "@metreeca/core/deep";
import { materialize } from "./value.core.js";


/**
 * Validates values against a {@link ReferenceShape}.
 *
 * Filters input values by type, reporting non-reference values under the `kind` key, then enforces
 * reference constraints on matched values.
 */
export function validateReferences(values: readonly unknown[], shape: ReferenceShape): undefined | Trace {

	const matching = values.filter(isReference);
	const mistyped = values.length-matching.length;

	const target = materialize(shape.shape);

	const patterns = target.pattern !== undefined ? [target.pattern] : [];
	const allowed = target.in !== undefined ? [target.in] : [];
	const required = target.hasValue !== undefined ? [target.hasValue] : [];

	return collect({

		"{kind}": mistyped === 0
			|| `expected <${shape.kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		...Object.fromEntries([

			...patterns.map((pattern, i) => [patterns.length > 1 ? `{pattern}[${i}]` : "{pattern}",
				every(matching, value => match(value, pattern) || `expected IRI matching pattern <${pattern}>`)
			]),

			...allowed.map((items, i) => [allowed.length > 1 ? `{in}[${i}]` : "{in}",
				every(matching, value => items.includes(value) || `expected values in [${items.join(", ")}]`)
			]),

			...required.map((items, i) => [required.length > 1 ? `{hasValue}[${i}]` : "{hasValue}",
				group(matching, group => items.every(v => group.includes(v)) || `expected values to include [${items.join(", ")}]`)
			])

		])

	});

}


/**
 * Merges an overriding reference shape with an inherited base shape.
 *
 * All fields are immutable — only model strict equality is checked.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns The merged shape with combined constraints
 *
 * @throws {TraceError} On incompatible overrides
 */
export function mergeReference(target: ReferenceShape, source: ReferenceShape): ReferenceShape {

	const trace = collect({

		// structural: model must be strictly equal

		"{model}": target.model === source.model
			|| `mismatched types <${target.model}> and <${source.model}>`

	});

	if ( trace !== undefined ) {
		throw new TraceError("incompatible reference shape override", trace);
	}

	return immutable({

		kind: target.kind,
		model: target.model,

		...target.foreign !== undefined && { foreign: target.foreign },

		shape: target.shape

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks if a value is a {@link Reference}.
 *
 *
 * @param value The value to check
 *
 * @returns True if the value is an absolute IRI
 */
export function isReference(value: unknown): value is Reference {
	return isIRI(value, "absolute");
}
