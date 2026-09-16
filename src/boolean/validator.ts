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
 * Boolean value validation.
 *
 * Holds a value to what a boolean shape admits and reports everything wrong with it at once, keyed by the value at
 * fault. A boolean shape closes its domain by kind alone, so every strictness enforces the same check.
 *
 * @module
 */

import { isBoolean, type Optional } from "@metreeca/core";
import { array, type Trace, type } from "@metreeca/core/trace";
import type { Scope } from "../value/validator.js";
import type { BooleanShape } from "./index.js";


/**
 * Validates values against a boolean shape.
 *
 * Reports each value that is not a boolean as a `{type}` violation keyed by its index, so that a caller may tell which
 * value failed. A boolean shape closes its domain by kind alone, leaving nothing further to enforce at any
 * {@link Scope | strictness}.
 *
 * @param values The values to validate
 * @param _ The shape the values are matched against, stating nothing the kind check doesn't already enforce
 * @param opts Validation options, none of which changes what is enforced
 *
 * @returns A trace of the violations found, or `undefined` where every value is a boolean
 */
export function validateBoolean(values: readonly unknown[], _: BooleanShape, {}: {

	scope?: Scope

} = {}): Optional<Trace> {

	return array(type(isBoolean))(values);

}
