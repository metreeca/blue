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
 * Numeric shape type guards and validation.
 *
 * Provides type guards for {@link NumberShape}, {@link NumberConstraints}, and {@link NumericConstraints}, plus the
 * numeric value validator enforcing range and enumeration constraints.
 *
 * @module
 */

import { isNumber } from "@metreeca/core";
import type { NumberConstraints, NumberShape, NumericConstraints } from "./number.js";
import { every, group, trace } from "./trace.core.js";
import type { Trace } from "./trace.js";


/**
 * Validates values against a number shape.
 *
 * Filters input values by type, reporting non-numeric values under the `kind` key, then enforces
 * numeric constraints on matching values.
 */
export function validateNumber(values: readonly unknown[], {

	kind,

	minExclusive,
	maxExclusive,
	minInclusive,
	maxInclusive,

	in: allowed,
	hasValue

}: NumberShape): undefined | Trace {

	const matching = values.filter(isNumber);
	const mistyped = values.length-matching.length;

	return trace({

		"{kind}": mistyped === 0
			|| `expected ${kind} values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		"{minExclusive}": every(matching, value =>
			minExclusive === undefined || value > minExclusive
			|| `expected values > ${minExclusive}`
		),

		"{maxExclusive}": every(matching, value =>
			maxExclusive === undefined || value < maxExclusive
			|| `expected values < ${maxExclusive}`
		),

		"{minInclusive}": every(matching, value =>
			minInclusive === undefined || value >= minInclusive
			|| `expected values >= ${minInclusive}`
		),

		"{maxInclusive}": every(matching, value =>
			maxInclusive === undefined || value <= maxInclusive
			|| `expected values <= ${maxInclusive}`
		),

		"{in}": every(matching, value =>
			allowed === undefined || allowed.includes(value)
			|| `expected values in [${allowed.join(", ")}]`
		),

		"{hasValue}": group(matching, group =>
			hasValue === undefined || hasValue.every(v => group.includes(v))
			|| `expected values to include [${hasValue.join(", ")}]`
		)

	});

}
