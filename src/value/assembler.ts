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
 * Shape assembly.
 *
 * Combines a shape with the one it overrides: {@link narrowsShape} tests the override relation and
 * {@link mergeShape} builds the merged shape, each routing the pair to the operators of the kind they share, so that a
 * caller holding two shapes needs not know which kind it holds.
 *
 * @module
 */

import { type Optional } from "@metreeca/core";
import { type Trace, TraceError } from "@metreeca/core/trace";
import { mergeBoolean, narrowsBoolean } from "../boolean/assembler.js";
import type { BooleanShape } from "../boolean/index.js";
import { mergeDictionary, narrowsDictionary } from "../dictionary/assembler.js";
import type { DictionaryShape } from "../dictionary/index.js";
import { mergeNumber, narrowsNumber } from "../number/assembler.js";
import type { NumberShape } from "../number/index.js";
import { mergeReference, narrowsReference } from "../reference/assembler.js";
import type { ReferenceShape } from "../reference/index.js";
import { mergeResource, narrowsResource } from "../resource/assembler.js";
import type { ResourceShape } from "../resource/index.js";
import { mergeString, narrowsString } from "../string/assembler.js";
import type { StringShape } from "../string/index.js";
import { getShapeBranches } from "../union/index.js";
import { mergeUnion, narrowsUnion } from "../union/assembler.js";
import type { UnionShape } from "../union/index.js";
import type { Shape } from "./index.js";


/**
 * Reports whether a shape narrows an inherited one.
 *
 * Routes the pair to the operators of the kind they share, so that a caller holding two shapes tests the override
 * relation without knowing which kind it holds. Two shapes of different kinds never narrow one another, as an override
 * refines what a member admits and never retypes it.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns A trace of the obstacles to the override, or `undefined` where `target` narrows `source`
 */
export function narrowsShape(target: Shape, source: Shape): Optional<Trace> {

	// a polymorphic inherited shape is narrowed to the single alternative the overriding one restricts, which thus
	// restates no wrapper of its own

	if ( source.kind === "union" && target.kind !== "union" ) {

		const claimed = claims(target, source);

		return claimed.length === 1 ? undefined
			: claimed.length === 0 ? ["{branches} restricts no inherited branch"]
				: ["{branches} restricts several inherited branches"];

	}

	// the kind guard is what makes each branch well-typed: it is reached only where both shapes share target.kind

	return target.kind !== source.kind ? [`{kind} mismatched kinds <${target.kind}> vs <${source.kind}>`]
		: target.kind === "boolean" ? narrowsBoolean(target, source as BooleanShape)
			: target.kind === "number" ? narrowsNumber(target, source as NumberShape)
				: target.kind === "string" ? narrowsString(target, source as StringShape)
					: target.kind === "dictionary" ? narrowsDictionary(target, source as DictionaryShape)
						: target.kind === "reference" ? narrowsReference(target, source as ReferenceShape)
							: target.kind === "union" ? narrowsUnion(target, source as UnionShape)
								: narrowsResource(target, source as ResourceShape);

}

/**
 * Merges a shape with an inherited one.
 *
 * Routes the pair to the operators of the kind they share, so that a caller holding two shapes builds the merged one
 * without knowing which kind it holds.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns An immutable shape admitting the values both `target` and `source` admit
 *
 * @throws {TraceError} Where `target` doesn't narrow `source`
 */
export function mergeShape(target: Shape, source: Shape): Shape {

	const trace = narrowsShape(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible shape override", trace);
	}

	// the single alternative an overriding shape restricts is the one it is merged with, the rest being dropped

	if ( source.kind === "union" && target.kind !== "union" ) {
		return mergeShape(target, claims(target, source)[0]);
	}

	// the kind guard above is what makes each branch well-typed: the kinds are known to match by here

	return target.kind === "boolean" ? mergeBoolean(target, source as BooleanShape)
		: target.kind === "number" ? mergeNumber(target, source as NumberShape)
			: target.kind === "string" ? mergeString(target, source as StringShape)
				: target.kind === "dictionary" ? mergeDictionary(target, source as DictionaryShape)
					: target.kind === "reference" ? mergeReference(target, source as ReferenceShape)
						: target.kind === "union" ? mergeUnion(target, source as UnionShape)
							: mergeResource(target, source as ResourceShape);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the alternatives of an inherited polymorphic shape an overriding shape restricts.
 *
 * @param target The overriding shape
 * @param source The inherited polymorphic shape
 *
 * @returns The alternatives `target` narrows, in the order they were stated
 */
function claims(target: Shape, source: UnionShape): readonly Shape[] {

	return getShapeBranches(source).filter(branch => narrowsShape(target, branch) === undefined);

}
