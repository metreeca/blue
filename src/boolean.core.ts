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
 * Boolean shape type guards and validation.
 *
 * Provides type guards for {@link BooleanShape} and {@link BooleanConstraints}, plus the boolean value validator.
 *
 * @module
 */

import { isBoolean } from "@metreeca/core";
import type { BooleanConstraints, BooleanShape } from "./boolean.js";
import { trace } from "./trace.core.js";
import type { Trace } from "./trace.js";


/**
 * Validates values against a boolean shape.
 *
 * Filters input values by type, reporting non-boolean values under the `kind` key.
 */
export function validateBoolean(values: readonly unknown[], { kind }: BooleanShape): undefined | Trace {

	const matching = values.filter(isBoolean);
	const mistyped = values.length-matching.length;

	return trace({

		"{kind}": mistyped === 0
			|| `expected ${kind} values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`

	});

}
