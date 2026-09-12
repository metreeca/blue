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
 * Union shape assembly.
 *
 * Builds the union the factory states into the form its consumers read, flattening a nested union into the enclosing
 * one, and combines it with the one it overrides: an extension narrows exactly when each of its branches claims one
 * inherited branch of its own.
 *
 * @module
 */

import { isFunction, type Optional } from "@metreeca/core";
import { immutable } from "@metreeca/core/structures";
import { array, type Trace, TraceError } from "@metreeca/core/trace";
import { mergeShape, narrowsShape } from "../index.core.js";
import { getShapeBranches } from "./accessors.js";
import type { UnionBranches, UnionShape } from "./index.js";

/**
 * Creates a union shape.
 *
 * Backs the factory the {@link union!} module exposes. A branch that is itself a union is replaced by the alternatives
 * it holds, so that a union states a flat list of alternatives however it was assembled; any other branch is kept as
 * it was stated, deferred or not, so that a cycle among definitions is broken by whichever branch defers. Order is
 * retained throughout, a spliced branch taking the place its union held.
 *
 * @typeParam B The alternatives a value may be drawn from
 *
 * @param branches The shapes a value may be drawn from
 *
 * @returns An immutable shape admitting the values any of the branches admits
 */
export function create<B extends UnionBranches>(branches: B): UnionShape<B> {

	// a nested union is itself built here, so it is already flat and splicing one level keeps the branches flat

	const flattened = branches.flatMap(branch =>
		!isFunction(branch) && branch.kind === "union" ? branch.branches : [branch]
	);

	return immutable<UnionShape>({

		kind: "union",

		branches: flattened

	}) as UnionShape<B>; // ;(cast) a spliced branch admits exactly the values the union holding it admitted

}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Reports whether a union narrows an inherited one.
 *
 * Tests the override relation without building the merged union, so that an incompatible extension is told apart from
 * a legitimate refinement before either is committed to: a union narrows the inherited one where each of its branches
 * narrows exactly one inherited branch and no two of them claim the same one. Inherited branches left unclaimed are
 * dropped, so an extending shape may shed alternatives but never add them.
 *
 * @param target The overriding union
 * @param source The inherited union
 *
 * @returns A trace of the obstacles to the override, or `undefined` where `target` narrows `source`
 */
export function narrowsUnion(target: UnionShape, source: UnionShape): Optional<Trace> {

	const claimed = claim(target, source);

	return claimed instanceof Map ? undefined : claimed;

}

/**
 * Merges a union with an inherited one.
 *
 * Yields the single shape an extending member is validated against: each claimed inherited branch merged with the
 * branch claiming it, in the order the inherited union stated them, with the unclaimed ones dropped.
 *
 * @param target The overriding union
 * @param source The inherited union
 *
 * @returns An immutable shape admitting the values both `target` and `source` admit
 *
 * @throws {TraceError} Where `target` doesn't narrow `source`

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
 */
export function mergeUnion(target: UnionShape, source: UnionShape): UnionShape {

	const claimed = claim(target, source);

	if ( !(claimed instanceof Map) ) {
		throw new TraceError("incompatible union shape override", claimed);
	}

	// merged branches keep the inherited order; unclaimed inherited branches are dropped

	return create(getShapeBranches(source).flatMap((inherited, index) => {

		const claimant = claimed.get(index);

		return claimant === undefined ? [] : [mergeShape(getShapeBranches(target)[claimant], inherited)];

	}));

}


/**
 * Claims each inherited branch for the branch narrowing it.
 *
 * Pairs by trial narrowing: a branch claims an inherited one where {@link narrowsShape} reports no obstacle. Every
 * branch must claim exactly one, and no inherited branch may be claimed twice, so the pairing is a partial injection
 * from the inherited branches to the overriding ones and the inherited branches left over are dropped by the caller.
 *
 * @param target The overriding union
 * @param source The inherited union
 *
 * @returns A map from inherited branch to the branch claiming it, or a trace of the obstacles to the pairing
 */
function claim(target: UnionShape, source: UnionShape): NonNullable<Optional<Trace>> | Map<number, number> {

	const inherited = getShapeBranches(source);

	// the inherited branches each overriding branch narrows

	const claims = getShapeBranches(target).map(branch =>
		inherited.flatMap((base, index) => narrowsShape(branch, base) === undefined ? [index] : [])
	);

	const exactly = array((bases: readonly number[]) =>
		bases.length === 0 ? ["branch narrows no inherited branch"]
			: bases.length > 1 ? ["branch narrows several inherited branches"]
				: undefined
	)(claims);

	if ( exactly !== undefined ) {
		return exactly;
	}

	// no two overriding branches may claim the same inherited branch

	const claimed = claims.map(bases => bases[0]);

	const injective = array((taken: boolean) =>
		taken ? ["branch narrows an inherited branch already claimed"] : undefined
	)(claimed.map((base, index) => claimed.findIndex(other => other === base) !== index));

	return injective ?? new Map(claimed.map((base, index) => [base, index]));

}
