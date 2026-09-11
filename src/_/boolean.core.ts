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

import { isBoolean, type Optional } from "@metreeca/core";
import { immutable } from "@metreeca/core/structures";
import { array, type Trace, type } from "@metreeca/core/trace";
import type { BooleanShape } from "./boolean.js";
import type { Scope } from "./index.core.js";


/**
 * Creates a boolean shape.
 *
 * Backs the factory the {@link boolean!} module exposes. The shape takes no constraints, so there is nothing to check
 * and nothing that could make it contradictory.
 *
 * @returns An immutable shape admitting truth values
 */
export function create(): BooleanShape {

	return immutable({

		kind: "boolean"

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Reports whether a boolean shape narrows an inherited one.
 *
 * Tests the override relation without building the merged shape. A boolean shape states nothing beyond its kind, so
 * every override narrows and the relation never reports an obstacle; it is stated all the same, so that a caller may
 * test any pair of shapes without knowing which kind it holds.
 *
 * @returns `undefined`, as a boolean shape carries nothing an override could widen
 */
export function narrowsBoolean(_target: BooleanShape, _source: BooleanShape): Optional<Trace> {

	return undefined;

}

/**
 * Merges a boolean shape with an inherited one.
 *
 * Yields the single shape an extending member is validated against. A boolean shape states nothing beyond its kind,
 * so the merge carries that alone.
 *
 * @returns An immutable shape admitting truth values
 */
export function mergeBoolean(_target: BooleanShape, _source: BooleanShape): BooleanShape {

	return create();

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a boolean shape.
 *
 * Reports each value that is not a boolean as a `{type}` violation keyed by its index, so that a caller may tell which
 * value failed. A boolean shape closes its domain by kind alone, leaving nothing further to enforce at any
 * {@link Scope | strictness}.
 *
 * @param values The values to validate
 * @param _ The shape the values are matched against, stating nothing the kind check doesn't already enforce
 *
 * @returns A trace of the violations found, or `undefined` where every value is a boolean
 */
export function validateBoolean(values: readonly unknown[], _: BooleanShape, {}: {

	scope?: Scope

} = {}): Optional<Trace> {

	return array(type(isBoolean))(values);

}
