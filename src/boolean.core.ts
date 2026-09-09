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
import { immutable } from "@metreeca/core/structures";
import { array, test, type Trace, TraceError, type } from "@metreeca/core/trace";
import type { BooleanShape } from "./boolean.js";
import type { Scope } from "./index.core.js";


/**
 * Reports whether an overriding boolean shape narrows an inherited base shape.
 *
 * Tests the override relation without building the merged shape: a boolean carries no constraints, so `target`
 * narrows `source` exactly when their `model` matches.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns A trace reporting the narrowing obstacle, or `undefined` when `target` narrows `source`
 */
export function narrowsBoolean(target: BooleanShape, source: BooleanShape): undefined | Trace {

	return test<BooleanShape>(({ model }) => {

		return model === source.model || [
			`{model} mismatched types <${model}> and <${source.model}>`
		];

	})(target);

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

	const trace = narrowsBoolean(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible boolean shape override", trace);
	}

	return immutable({

		kind: target.kind,
		model: target.model

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a boolean shape.
 *
 * Reports each non-boolean value as a `{kind}` violation keyed by its element index.
 */
export function validateBoolean(values: readonly unknown[], _shape: BooleanShape, {}: {

	scope?: Scope

} = {}): undefined | Trace {

	return array(type(isBoolean))(values);

}
