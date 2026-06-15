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

import { equals, immutable } from "@metreeca/core/deep";
import { isReference } from "@metreeca/qest";
import { collect, every, group, TraceError } from "./index.core.js";
import type { Trace } from "./index.js";
import type { ReferenceShape } from "./reference.js";
import { match } from "./resource.core.js";
import { eager } from "./value.js";


/**
 * Merges an overriding reference shape with an inherited base shape.
 *
 * Validates `model` strict equality and rejects redefinition of non-overridable fields (`foreign`, `captive`, `shape`).
 * Non-overridable fields are inherited from the source; `kind` and `model` are structural.
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
			|| `mismatched types <${target.model}> and <${source.model}>`,

		// inherited: foreign must not be redefined by target (exact match tolerated for diamond inheritance)

		"{foreign}": target.foreign === undefined || target.foreign === source.foreign
			|| `unexpected <foreign> redefinition`,

		// inherited: captive must not be redefined by target (exact match tolerated for diamond inheritance)

		"{captive}": target.captive === undefined || target.captive === source.captive
			|| `unexpected <captive> redefinition`,

		// structural: the target shape cannot be overridden (an equivalent target is tolerated for diamond
		// inheritance; nested forward references compare by their Lazy identity, so recursive shapes terminate)

		"{shape}": equals(eager(target.shape), eager(source.shape))
			|| `unexpected <shape> redefinition`

	});

	if ( trace !== undefined ) {
		throw new TraceError("incompatible reference shape override", trace);
	}

	return immutable({

		kind: target.kind,
		model: target.model,

		...source.foreign !== undefined && { foreign: source.foreign },
		...source.captive !== undefined && { captive: source.captive },

		shape: source.shape

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a {@link ReferenceShape}.
 *
 * Filters input values by type, reporting non-reference values under the `kind` key, then enforces
 * reference constraints on matched values.
 */
export function validateReferences(values: readonly unknown[], shape: ReferenceShape): undefined | Trace {

	const matching = values.filter(isReference);
	const mistyped = values.length-matching.length;

	const target = eager(shape.shape);

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
