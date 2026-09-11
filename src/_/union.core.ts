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
 * Union shape operators.
 *
 * @module
 */

import { eager, type Eager, isFunction, type Lazy } from "@metreeca/core";
import { immutable } from "@metreeca/core/structures";
import { array, type Trace, TraceError } from "@metreeca/core/trace";
import { mergeShape, narrowsShape, type Scope, validateShape } from "./index.core.js";
import type { Shape } from "./index.js";
import type { UnionBranches, UnionShape } from "./union.js";


/**
 * Resolves the alternatives a union describes.
 *
 * Yields every branch at once, each as declared, so that a value of the union is resolved by resolving each branch in
 * turn, as {@link _!Instance} and {@link _!Compound} do; a shape that is not a union has no branch at all.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Branch<S extends Lazy<Shape>> =
	Eager<S> extends UnionShape<infer B> ? B[number] : never


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
export function narrowsUnion(target: UnionShape, source: UnionShape): undefined | Trace {

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
function claim(target: UnionShape, source: UnionShape): NonNullable<undefined | Trace> | Map<number, number> {

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


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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

} = {}): undefined | Trace {

	const branches = getShapeBranches(shape);

	return array((value: unknown) => {

		const matched = branches.filter(branch => validateShape([value], branch, { scope }) === undefined);

		return matched.length === 0 ? ["{branches} no branch admits the value"]
			: scope !== "model" && matched.length > 1 ? ["{branches} several branches admit the value"]
				: undefined;

	})(values);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the branches a range admits values from.
 *
 * Flattens a union to its branches, in the order they were stated, and takes any other range to the single branch it
 * is, so that a caller routing a value over a range needs not tell a polymorphic one from a plain one. Branches are
 * resolved, a nested union flattened into the enclosing one, so that a caller routes each alternative without
 * flattening again.
 *
 * @param shape The range to enumerate, possibly deferred to break definition cycles
 *
 * @returns The branches `shape` admits values from, in the order they were stated
 */
export function getShapeBranches(shape: Lazy<Shape>): readonly Shape[] {

	const resolved = eager(shape);

	return resolved.kind === "union"
		? resolved.branches.flatMap(branch => getShapeBranches(branch))
		: [resolved];

}

/**
 * Picks the single branch a data value belongs to.
 *
 * Routes a value being stored, or an option a filter tests membership against, to the one branch admitting it against
 * every constraint, so that a caller ingesting a value against a polymorphic range settles it on a definite branch. A
 * value admitted by several branches is ambiguous and one admitted by none unsatisfiable; both yield nothing rather
 * than a branch chosen by guesswork.
 *
 * @typeParam B The branch type, carried through from the branches supplied
 *
 * @param state The value to route
 * @param branches The branches to choose among
 *
 * @returns The sole branch `state` belongs to, or `undefined` where it belongs to none or to several
 *
 * @see [Unions — Design](./union.md)
 */
export function getStateBranch<B extends Shape>(state: unknown, branches: readonly B[]): undefined | B {

	const matched = branches.filter(branch => validateShape([state], branch, { scope: "state" }) === undefined);

	return matched.length === 1 ? matched[0] : undefined;

}

/**
 * Picks the single branch a relational bound filters against.
 *
 * Routes a `<`, `>`, `<=` or `>=` operand to the one branch it filters, so that a caller may type the bound by the
 * branch it resolves to. A bound need not be a legal element value, so it is matched on the syntactic discriminators
 * alone and the union is expected to be literally disjoint; the match stays exactly one, as a conversion commits to a
 * single branch.
 *
 * @typeParam B The branch type, carried through from the branches supplied
 *
 * @param bound The bound to route
 * @param branches The branches to choose among
 *
 * @returns The sole branch `bound` filters against, or `undefined` where it filters none or several
 *
 * @see [Unions — Design](./union.md)
 */
export function getBoundBranch<B extends Shape>(bound: unknown, branches: readonly B[]): undefined | B {

	const matched = branches.filter(branch => validateShape([bound], branch, { scope: "bound" }) === undefined);

	return matched.length === 1 ? matched[0] : undefined;

}

/**
 * Picks every branch a retrieval placeholder fits.
 *
 * Routes a placeholder to all branches it may draw from, so that a caller retrieving against a polymorphic range needs
 * not know which branch a value was stored on. A placeholder is matched by JSON type alone, its value immaterial, so
 * it may span several branches and retrieve each; only one fitting no branch at all is unsatisfiable.
 *
 * @typeParam B The branch type, carried through from the branches supplied
 *
 * @param model The placeholder to route
 * @param branches The branches to choose among
 *
 * @returns Every branch `model` fits, or `undefined` where it fits none
 *
 * @see [Unions — Design](./union.md)
 */
export function getModelBranches<B extends Shape>(model: unknown, branches: readonly B[]): undefined | readonly B[] {

	const matched = branches.filter(branch => validateShape([model], branch, { scope: "model" }) === undefined);

	return matched.length > 0 ? matched : undefined;

}
