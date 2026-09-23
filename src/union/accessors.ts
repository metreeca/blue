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
 * Reads off a shape the alternatives it admits values from, and selects the ones a given value, bound or placeholder
 * fits, whether the caller needs the single branch it singles out or every branch it may be drawn from, so that a
 * caller routing a value over a shape needs not tell a polymorphic shape from a plain one.
 *
 * @module
 */

import { type Lazy } from "@metreeca/core";
import { isAtomic } from "@metreeca/qest/model";
import { getShapeTarget } from "../reference/index.js";
import { validateTemplate } from "../resource/validator.js";
import { eager, type Shape } from "../value/index.js";
import { type Scope, validateShape } from "../value/validator.js";


/**
 * Resolves the branches a shape admits values from.
 *
 * Flattens a union to its branches, in the order they were stated, and takes any other shape to the single branch it
 * is, so that a caller routing a value over a shape needs not tell a polymorphic one from a plain one. Branches are
 * resolved, a nested union flattened into the enclosing one, so that a caller routes each alternative without
 * flattening again.
 *
 * @param shape The shape to enumerate, possibly deferred to break definition cycles
 *
 * @returns The branches `shape` admits values from, in the order they were stated, each resolved and merged where it
 *     describes a resource
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where a deferred definition reaches itself
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
 * Routes a value being stored to the one branch admitting it against every constraint, so that a caller ingesting a
 * value against a polymorphic shape settles it on a definite branch. A value admitted by several branches is ambiguous
 * and one admitted by none unsatisfiable; both yield nothing rather than a branch chosen by guesswork.
 *
 * @typeParam B The branch type, carried through from the branches supplied
 *
 * @param state The value to route
 * @param branches The branches to choose among
 *
 * @returns The sole branch `state` belongs to, or `undefined` where it belongs to none or to several
 *
 * @see [Unions — Design](./index.md)
 */
export function getStateBranch<B extends Shape>(state: unknown, branches: readonly B[]): undefined | B {

	const matched = matching(state, branches, "state");

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
 * @see [Unions — Design](./index.md)
 */
export function getBoundBranch<B extends Shape>(bound: unknown, branches: readonly B[]): undefined | B {

	const matched = matching(bound, branches, "bound");

	return matched.length === 1 ? matched[0] : undefined;

}

/**
 * Picks every branch a retrieval placeholder fits.
 *
 * Routes a placeholder to all branches it may draw from, so that a caller retrieving against a polymorphic shape needs
 * not know which branch a value was stored on. A placeholder carries no value to tell branches apart, so it may span
 * several and retrieve each; only one fitting no branch at all is unsatisfiable.
 *
 * Routing goes by form. The atomic placeholder asks for the value as it stands, so it fits every branch coming back as
 * one: a literal, a link, as the identifier naming its target, and a localised map, coalesced under the request's
 * language priority; an embedded resource states no identifier to come back as, so it is reached through a template
 * alone. A nested template fits the branches naming a resource, by the members it asks for, so that a link is reached
 * either way it may be asked for. A template states what to bring back rather than what is held, so it is held to the
 * members the resource declares but not to their presence: leaving one out routes the template all the same. A map of
 * tag ranges fits the localised branches alone.
 *
 * @typeParam B The branch type, carried through from the branches supplied
 *
 * @param model The placeholder to route
 * @param branches The branches to choose among
 *
 * @returns Every branch `model` fits, or `undefined` where it fits none
 *
 * @see [Unions — Design](./index.md)
 */
export function getModelBranches<B extends Shape>(model: unknown, branches: readonly B[]): undefined | readonly B[] {

	const matched = branches.filter(branch => {

		const target = getShapeTarget(branch);

		return isAtomic(model)

			// an embedded resource states no identifier to come back as, so it is reached through a template alone

			? branch.kind !== "resource" && validateShape([model], branch, { scope: "model" }) === undefined

			// a template crosses a link, standing for the resource it points at rather than for the link itself

			: target !== undefined ? validateTemplate([model], target) === undefined
				: validateShape([model], branch, { scope: "model" }) === undefined;

	});

	return matched.length > 0 ? matched : undefined;

}

/**
 * Selects the branches admitting a value.
 *
 * Matches a value against each branch at the strictness the caller asks for, in the order the branches were stated, so
 * that a caller routing a value over a union reads the alternatives it fits off a single list.
 *
 * @typeParam B The branch type, carried through from the branches supplied
 *
 * @param value The value to match
 * @param branches The branches to match against
 * @param scope The {@link Scope | strictness} the branches are matched at
 *
 * @returns The branches admitting `value`, in the order they were stated
 */
export function matching<B extends Shape>(value: unknown, branches: readonly B[], scope: Scope): readonly B[] {

	return branches.filter(branch => validateShape([value], branch, { scope }) === undefined);

}
