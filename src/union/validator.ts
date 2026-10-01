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
 * for it, one several branches admit at once. Also holds a relational bound, a set-matching option and a retrieval
 * placeholder to the branches they are matched against.
 *
 * @module
 */

import { isArray, isBoolean, isNumber, isObject, isString, type Optional } from "@metreeca/core";
import { isTag } from "@metreeca/core/language";
import { array, object, type Trace } from "@metreeca/core/trace";
import { isAtomic } from "@metreeca/qest/model";
import { isReference } from "@metreeca/qest/state";
import { getShapeTarget } from "../reference/index.js";
import type { Shape } from "../value/index.js";
import { type Scope, validateShape } from "../value/validator.js";
import { getShapeBranches } from "./accessors.js";
import type { UnionShape } from "./index.js";


/**
 * Validates values against a union.
 *
 * Matches each value against the branches and reports how many admit it, under the regime the
 * {@link Scope | strictness} names: a `"state"` value must single out **exactly one** branch, as it fixes the branch
 * that drives storage, while a `"model"` placeholder need only fit **at least one**, retrieving each it fits. A value
 * fitting no branch is reported as unsatisfiable and one required to single out a branch but fitting several as
 * ambiguous.
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

		const matched = matching(value, branches, scope);

		return matched.length === 0 ? ["{branches} no branch admits the value"]
			: scope !== "model" && matched.length > 1 ? ["{branches} several branches admit the value"]
				: undefined;

	})(values);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Tells whether a placeholder object asks for a nested resource rather than for tag ranges.
 *
 * A tag range may also be a member name, so the object form alone does not tell a template from a map of tag ranges.
 * The branches settle it: an object is a template if each of its keys names a member of a resource branch, reached
 * directly or through a link, and a map of tag ranges otherwise. A map of tag ranges whose ranges all name such members
 * therefore cannot be asked for.
 *
 * @param model The placeholder to read
 * @param branches The branches the placeholder is matched against
 *
 * @returns `true` if `model` is an object to be read as a template; `false` otherwise
 */
export function isTemplateModel(model: unknown, branches: readonly Shape[]): boolean {

	const names = new Set(branches.flatMap(branch => Object.keys(getShapeTarget(branch)?.members ?? {})));

	return !isAtomic(model) && isObject(model) && Object.keys(model).every(key => names.has(key));

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

/**
 * Checks whether a relational bound can filter against a branch.
 *
 * A bound must be of the branch kind and, on a string branch, match its pattern. A localised branch takes a plain
 * string, while links and embedded resources take no bound.
 *
 * Template validation and {@link union!getBoundBranch | getBoundBranch} share this rule, so a bound accepted against a
 * branch also routes to it.
 *
 * @param bound The bound to check
 * @param branch The branch it is to filter against
 *
 * @returns A trace of the reasons `bound` cannot filter against `branch`, or `undefined` where it can
 */
export function checkBound(bound: unknown, branch: Shape): Optional<Trace> {

	// a localised value is filtered through the strings it carries, a string through its lexical pattern

	return branch.kind === "dictionary" ? isString(bound) ? undefined : ["expected string value"]
		: branch.kind === "string" && isString(bound) ? lexical(bound, branch.pattern)
			: literal(bound, branch, () => [`unsupported constraint for <${branch.kind}> value`]);

}

/**
 * Checks whether a set-matching option can be tested against a branch.
 *
 * An option must be of the branch kind, whatever its pattern, and a link or resource branch takes a reference. A
 * localised branch takes a plain string or a map of strings keyed by language tag. A `null` option fits any branch.
 *
 * Template validation and {@link union!getOptionBranch | getOptionBranch} share this rule, so an option accepted
 * against a branch also routes to it.
 *
 * @param option The option to check, stated singly rather than as the set a filter lists
 * @param branch The branch it is to be tested against
 *
 * @returns A trace of the reasons `option` cannot be tested against `branch`, or `undefined` where it can
 */
export function checkOption(option: unknown, branch: Shape): Optional<Trace> {

	// an option stated as nothing at all matches any value type

	return option === null ? undefined
		: branch.kind === "dictionary" ? isString(option) ? undefined
				: isObject(option) ? tags(option)
					: [`unsupported constraint for <${branch.kind}> value`]
			: literal(option, branch, () => isReference(option) ? undefined : ["expected <reference> value"]);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Holds a value to the literal branch it is matched against, deferring any other kind to the caller.
 */
function literal(value: unknown, branch: Shape, otherwise: () => Optional<Trace>): Optional<Trace> {

	switch ( branch.kind ) {

		case "boolean":

			return isBoolean(value) ? undefined : [`expected <${branch.kind}> value`];

		case "number":

			return isNumber(value) ? undefined : [`expected <${branch.kind}> value`];

		case "string":

			return isString(value) ? undefined : [`expected <${branch.kind}> value`];

		default:

			return otherwise();

	}

}

/**
 * Matches a string against the lexical pattern of a branch, admitting every string where it states none.
 */
function lexical(value: string, pattern: undefined | string): Optional<Trace> {

	return pattern === undefined || new RegExp(pattern).test(value) ? undefined
		: [`{pattern} expected string matching </${pattern}/>`];

}

/**
 * Validates a set of options stated as a tag map, grouped by the tag they are to match under.
 *
 * The map states the options a filter tests against rather than a value a resource holds, so a tag carries as many as
 * the filter lists whatever the member admits, and the strings, being matched for equality, need not be legal values
 * of the shape.
 */
function tags(value: Readonly<Record<string, unknown>>): Optional<Trace> {

	return object(([tag, asked]: readonly [string, unknown]) =>
		!isTag(tag) ? [{ [tag]: ["invalid tag"] }]
			: isString(asked) || isArray(asked, isString) ? undefined
				: [{ [tag]: ["expected string or string array option"] }]
	)(value);

}
