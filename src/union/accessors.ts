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
 * Lists the alternatives a shape admits values from, and picks the branches a stored value, a filter operand or a
 * retrieval placeholder is matched against. A caller routing an input over a shape thus handles polymorphic and plain
 * shapes alike.
 *
 * @module
 */

import { isObject, type Lazy, opt, type Optional } from "@metreeca/core";
import { type Trace } from "@metreeca/core/trace";
import { isAtomic } from "@metreeca/qest/model";
import { getShapeTarget } from "../reference/index.js";
import type { Member, ResourceShape } from "../resource/index.js";
import { validateTemplate } from "../resource/validator.js";
import { reject } from "../value/assembler.js";
import { eager, type Shape } from "../value/index.js";
import { validateShape } from "../value/validator.js";
import type { UnionShape } from "./index.js";
import { checkBound, checkOption, isTemplateModel, matching } from "./validator.js";


/**
 * The branches of each union already resolved and found coherent.
 *
 * Keyed by the union stating them, so that coherence is checked once per union rather than on every reach.
 */
const unions = new WeakMap<UnionShape, readonly Shape[]>();


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the branches a shape admits values from.
 *
 * Flattens a union to its branches, in the order they were stated, and takes any other shape to the single branch it
 * is, so that a caller routing a value over a shape needs not tell a polymorphic one from a plain one. Branches are
 * resolved, a nested union flattened into the enclosing one, so that a caller routes each alternative without
 * flattening again.
 *
 * Resolution also holds the union to coherence: a member name declared by several of the resources its branches
 * describe or link to must denote the same property throughout, so that a caller may resolve it once rather than per
 * branch. The declarations must agree on the member kind, on the `forward` and `reverse` predicates the name is
 * mapped to, and on the `captive` and `foreign` flags; they may differ in range, cardinality and value domain, which
 * merge into the range a path crossing the union reaches.
 *
 * @param shape The shape to enumerate, possibly deferred to break definition cycles
 *
 * @returns The branches `shape` admits values from, in the order they were stated, each resolved and merged where it
 *     describes a resource
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where a deferred definition reaches itself, or where the
 *     branches declare a shared member name inconsistently
 *
 * @see {@link https://metreeca.github.io/qest/documents/model.Model_Design.html Model Design § 3.2 Union Constraints}
 */
export function getShapeBranches(shape: Lazy<Shape>): readonly Shape[] {

	const resolved = eager(shape);

	return resolved.kind === "union"
		? unions.get(resolved) ?? settle(resolved)
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
export function getStateBranch<B extends Shape>(state: unknown, branches: readonly B[]): Optional<B> {

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
 * A localised branch takes a plain string bound, compared against the strings its tags carry. A plain string bound over
 * a string branch and a localised one therefore fits both and routes to neither. Links and embedded resources have no
 * order and take no bound.
 *
 * Routing applies the same rule as template validation, so every bound in a validated template routes to a branch.
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
export function getBoundBranch<B extends Shape>(bound: unknown, branches: readonly B[]): Optional<B> {

	const matched = branches.filter(branch => checkBound(bound, branch) === undefined);

	return matched.length === 1 ? matched[0] : undefined;

}

/**
 * Picks the single branch a set-matching option is tested against.
 *
 * Routes a `?`, `!` or `+` operand to the one branch it is compared with, so that a caller may type the option by that
 * branch. An option is tested by equality and need not be a legal element value. It is matched on its kind alone,
 * ignoring any lexical pattern, so the union is expected to be kind-disjoint. The match stays exactly one, as a
 * conversion commits to a single branch.
 *
 * A localised branch takes either a plain string option, matched against the strings of every tag, or a map grouping
 * options by language tag. A `null` option has no kind and fits every branch, so it routes to a branch only over a
 * single-branch shape.
 *
 * Routing applies the same rule as template validation, so every option in a validated template routes to a branch.
 * Stored values route through {@link getStateBranch} instead, which never assigns a plain string to a localised branch.
 *
 * @typeParam B The branch type, carried through from the branches supplied
 *
 * @param option The option to route, stated singly rather than as the set a filter lists
 * @param branches The branches to choose among
 *
 * @returns The sole branch `option` is tested against, or `undefined` where it fits none or several
 *
 * @see [Unions — Design](./index.md)
 */
export function getOptionBranch<B extends Shape>(option: unknown, branches: readonly B[]): Optional<B> {

	const matched = branches.filter(branch => checkOption(option, branch) === undefined);

	return matched.length === 1 ? matched[0] : undefined;

}

/**
 * Picks every branch a retrieval placeholder fits.
 *
 * Routes a placeholder to all branches it may draw from, so that a caller retrieving against a polymorphic shape need
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
 * A template may span several resource branches. Each branch admitting at least one of the members asked for is
 * picked, and answers the members it admits. A member several branches declare may take a different shape in each,
 * and what is asked for it need fit only one of them. The template is rejected only if some member it asks for fits no
 * branch.
 *
 * A tag range may also be a member name, so an object is read one way only. It is a template if each of its keys names
 * a member of a resource branch, reached directly or through a link, and a map of tag ranges otherwise. A template
 * never reaches the localised branches, even if the resource branches reject it.
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
export function getModelBranches<B extends Shape>(model: unknown, branches: readonly B[]): Optional<readonly B[]> {

	const template = isTemplateModel(model, branches);
	const members = isObject(model) ? Object.entries(model) : [];

	const matched = branches.filter(branch => {

		const target = getShapeTarget(branch);

		return isAtomic(model)

			// an embedded resource states no identifier to come back as, so it is reached through a template alone

			? branch.kind !== "resource" && validateShape([model], branch, { scope: "model" }) === undefined

			// a template crosses a link, standing for the resource it points at rather than for the link itself, and
			// may span several resources, each answering the members whose placeholders it admits

			: target !== undefined ? template && members.some(([name, asked]) => answers(target, name, asked))

				// an object read as a template never asks for tag ranges

				: (branch.kind !== "dictionary" || !template)
				&& validateShape([model], branch, { scope: "model" }) === undefined;

	});

	// a member several resources declare may take a different shape in each, so its placeholder is held to fit one of
	// them rather than all

	const answered = !template || members.every(([name, asked]) => matched.some(branch =>
		opt(getShapeTarget(branch), target => answers(target, name, asked), false)
	));

	return answered && matched.length > 0 ? matched : undefined;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Tells whether a resource admits what a template asks for one of its members.
 */
function answers(target: ResourceShape, name: string, asked: unknown): boolean {

	return validateTemplate([{ [name]: asked }], target) === undefined;

}

/**
 * Resolves the branches of a union and holds them to coherence.
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where the branches declare a shared member name
 *     inconsistently
 */
function settle(union: UnionShape): readonly Shape[] {

	const branches = union.branches.flatMap(branch => getShapeBranches(branch));

	reject("incoherent union shape", checkCoherence(branches));

	unions.set(union, branches);

	return branches;

}

/**
 * Checks that the member names shared by the resources a set of branches describe or link to denote the same property.
 *
 * @returns A trace of the attributes each shared name is declared with inconsistently, or `undefined` where every
 *     shared name agrees throughout
 */
function checkCoherence(branches: readonly Shape[]): Optional<Trace> {

	const declarations = branches
		.map(branch => getShapeTarget(branch))
		.filter(target => target !== undefined)
		.flatMap(target => Object.entries(target.members));

	const names = [...new Set(declarations.map(([name]) => name))];

	const issues = names.flatMap(name => {

		const [first, ...rest] = declarations
			.filter(([declared]) => declared === name)
			.map(([, member]) => identity(member));

		const conflicts = first
			.filter(([, value], index) => rest.some(other => other[index][1] !== value))
			.map(([attribute]) => `inconsistent <${attribute}> across branches`);

		return conflicts.length === 0 ? [] : [{ [name]: conflicts }];

	});

	return issues.length === 0 ? undefined : issues;

}

/**
 * Lists the attributes fixing the property a member denotes, in a fixed order, unstated flags taken as `false`.
 */
function identity(member: Member): readonly (readonly [string, unknown])[] {

	const property = member.kind === "property" ? member : undefined;

	return [
		["kind", member.kind],
		["forward", property?.forward],
		["reverse", property?.reverse],
		["captive", property?.captive ?? false],
		["foreign", property?.foreign ?? false]
	];

}
