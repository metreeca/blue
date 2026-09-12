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
 * Union value validation.
 *
 * Holds a value to the alternatives a union admits, reporting a value no branch admits and, where the strictness asks
 * for it, one several branches admit at once.
 *
 * @module
 */

import { type Optional } from "@metreeca/core";
import { array, type Trace } from "@metreeca/core/trace";
import { type Scope, validateShape } from "../index.core.js";
import type { UnionShape } from "./index.js";
import { getShapeBranches } from "./accessors.js";


/**
 * Validates values against a union.
 *
 * Matches each value against the branches and reports how many admit it, under the regime the
 * {@link Scope | strictness} names: a `"state"` value and a `"bound"` must single out **exactly one** branch, as
 * either fixes the branch that drives storage or conversion, while a `"model"` placeholder need only fit **at least
 * one**, retrieving each it fits. A value fitting no branch is reported as unsatisfiable and one required to single
 * out a branch but fitting several as ambiguous.
 *
 * @param values The values to validate
 * @param shape The shape the values are matched against
 * @param opts Validation options
 * @param opts.scope The {@link Scope | strictness} the branches are matched at, defaulting to `"state"`
 *
 * @returns A trace of the violations found, keyed by element, or `undefined` where every value matches a branch
 *     admissibly
 */
export function validateUnion(values: readonly unknown[], shape: UnionShape, {

	scope = "state"

}: {

	scope?: Scope

} = {}): Optional<Trace> {

	const branches = getShapeBranches(shape);

	return array((value: unknown) => {

		const matched = branches.filter(branch => validateShape([value], branch, { scope }) === undefined);

		return matched.length === 0 ? ["{branches} no branch admits the value"]
			: scope !== "model" && matched.length > 1 ? ["{branches} several branches admit the value"]
				: undefined;

	})(values);

}
