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
 * Boolean shape assembly.
 *
 * Builds the shape the factory states into the form its consumers read, and combines it with the one it overrides: the
 * kind closes the domain to two values, so a shape is never contradictory, while an override admitting the other truth
 * value would leave the member admitting nothing and is rejected before either shape is committed to.
 *
 * @module
 */

import { type Optional } from "@metreeca/core";
import { immutable } from "@metreeca/core/values";
import { test, type Trace } from "@metreeca/core/trace";
import { reject } from "../value/assembler.js";
import type { BooleanConstraints, BooleanShape } from "./index.js";


/**
 * Assembles a boolean shape.
 *
 * Backs the factory the {@link boolean!} module exposes. The kind closes the domain to two values and the enumeration
 * to one of them, so there is nothing that could make the stated constraints contradictory.
 *
 * @typeParam V The values the shape admits, as stated by the signature of the calling factory
 *
 * @param constraints The stated shape {@link BooleanConstraints constraints}
 *
 * @returns An immutable shape admitting the truth values the constraints leave open
 */
export function assemble<V extends boolean>(constraints: BooleanConstraints): BooleanShape<V> {

	return immutable({

		kind: "boolean",

		...constraints

	}) as BooleanShape<V>; // ;(cast) the factory signature fixes the admitted values to the enumerated one

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Reports whether a boolean shape narrows an inherited one.
 *
 * Tests the override relation without building the merged shape, so that an incompatible extension is told apart from
 * a legitimate refinement before either is committed to: a shape narrows the inherited one where it enumerates the
 * same value, or leaves open a domain the inherited shape is free to close.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns A trace of the obstacles to the override, or `undefined` where `target` narrows `source`
 */
export function narrowsBoolean(target: BooleanShape, source: BooleanShape): Optional<Trace> {

	return test<BooleanShape>(({ in: admitted }) => {

		return admitted === undefined || source.in === undefined || admitted === source.in || [
			`{in} unexpected value <${admitted}>`
		];

	})(target);

}

/**
 * Merges a boolean shape with an inherited one.
 *
 * Yields the single shape an extending member is validated against: the admitted value carries through from whichever
 * shape enumerates it, the two agreeing wherever both do.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns An immutable shape admitting the values both `target` and `source` admit
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `target` doesn't narrow `source`
 */
export function mergeBoolean(target: BooleanShape, source: BooleanShape): BooleanShape {

	reject("incompatible boolean shape override", narrowsBoolean(target, source));

	return immutable({

		kind: target.kind,

		// conjunctive: in — the enumerated value, equal wherever both shapes state one

		in: target.in ?? source.in

	});

}
