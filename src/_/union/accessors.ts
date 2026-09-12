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
 * Union shape accessors.
 *
 * Reads off a range the alternatives it admits values from, and picks the one a given value, bound or placeholder
 * singles out, so that a caller routing a value over a range needs not tell a polymorphic range from a plain one.
 *
 * @module
 */

import { type Lazy } from "@metreeca/core";
import { eager, validateShape } from "../index.core.js";
import type { Shape } from "../value/index.js";


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
