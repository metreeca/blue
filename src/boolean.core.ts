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
 * Boolean shape operators.
 *
 * @module
 */

import { isBoolean } from "@metreeca/core";
import { immutable } from "@metreeca/core/deep";
import type { BooleanShape } from "./boolean.js";
import { collect, TraceError } from "./core/trace.js";
import type { Trace } from "./index.js";


/**
 * Validates values against a boolean shape.
 *
 * Filters input values by type, reporting non-boolean values under the `kind` key.
 */
export function validateBoolean(values: readonly unknown[], { kind }: BooleanShape): undefined | Trace {

	const matching = values.filter(isBoolean);
	const mistyped = values.length-matching.length;

	return collect({

		"{kind}": mistyped === 0
			|| `expected <${kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`

	});

}


/**
 * Merges an overriding boolean shape with an inherited base shape.
 *
 * Validates that `kind` and `model` match between target and source.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns The merged shape
 *
 * @throws {TraceError} On incompatible overrides
 */
export function mergeBoolean(target: BooleanShape, source: BooleanShape): BooleanShape {

	const trace = collect({

		// structural: model must be strictly equal

		"{model}": target.model === source.model
			|| `mismatched types <${target.model}> and <${source.model}>`

	});

	if ( trace !== undefined ) {
		throw new TraceError("incompatible boolean shape override", trace);
	}

	return immutable({

		kind: target.kind,
		model: target.model

	});

}
