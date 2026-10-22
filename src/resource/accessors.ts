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
 * Resource shape and state accessors.
 *
 * Reads off a shape what the resources it describes are named, classified and made of, resolving a deferred shape and
 * following a link through to its target, so that a caller reaches a resource definition without walking the shape
 * itself. A shape pointing at no resource at all answers every shape accessor with nothing rather than failing.
 *
 * Reads the identifier and the values of a validated state. Each value comes typed by the value shape it matches, so a
 * caller converting a state into another form can switch on the kind of each value and handle it without a cast.
 *
 * @module
 */

import { error, type Identifier, type Lazy, opt, type Optional } from "@metreeca/core";
import { some } from "@metreeca/core/arrays";
import { TraceError } from "@metreeca/core/trace";
import type { Reference } from "@metreeca/qest/state";
import type { Shape, State } from "../value/index.js";
import { getShapeTarget } from "../reference/index.js";
import { getShapeBranches, getStateBranch, type UnionShape } from "../union/index.js";
import { validate } from "../index.js";
import type { Members, Property, ResourceShape } from "./index.js";


/**
 * One value a state holds, paired with the property holding it, its field name and the shape it matches.
 *
 * Narrowing an entry on `kind` narrows `shape` and `value` together, typing `value` as the {@link value!State | state}
 * of `shape`. Union values are resolved to the branch they match, so no entry ever has kind `union`.
 *
 * @typeParam S The value shapes an entry may match; defaults to every shape except unions
 */
export type Entry<S extends Shape = Exclude<Shape, UnionShape>> = S extends Shape ? {

	/**
	 * The kind of value shape the value matches, discriminating the entry.
	 */
	readonly kind: S["kind"];

	/**
	 * The field name the value is stated under in the state.
	 */
	readonly field: Identifier;

	/**
	 * The property holding the value, carrying its range, cardinality and RDF predicates.
	 */
	readonly property: Property;

	/**
	 * The value shape the value matches; for a union range, the branch the value belongs to.
	 */
	readonly shape: S;

	/**
	 * The value, typed as the state of `shape`.
	 */
	readonly value: State<S>;

} : never;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the class the resources a shape describes belong to.
 *
 * @param shape The shape to resolve, possibly deferred to break definition cycles
 *
 * @returns The class the target shape declares, or `undefined` where it declares none or `shape` points at no
 *     resource
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where a deferred definition reaches itself with no link to
 *     break the cycle, or states a target that doesn't narrow the one the link it is reached through overrides
 */
export function getShapeClass(shape: Lazy<Shape>): Optional<Reference> {

	return getShapeTarget(shape)?.class;

}

/**
 * Resolves the classes the resources a shape describes belong to on top of their own.
 *
 * @param shape The shape to resolve, possibly deferred to break definition cycles
 *
 * @returns The classes the target shape inherits, empty where it extends nothing stating one, or `undefined` where
 *     `shape` points at no resource
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where a deferred definition reaches itself with no link to
 *     break the cycle, or states a target that doesn't narrow the one the link it is reached through overrides
 */
export function getShapeClasses(shape: Lazy<Shape>): Optional<readonly Reference[]> {

	return getShapeTarget(shape)?.classes;

}

/**
 * Resolves the name of the member naming the resources a shape describes.
 *
 * @param shape The shape to resolve, possibly deferred to break definition cycles
 *
 * @returns The name the identifier is stated under, or `undefined` where the target states none or `shape` points at
 *     no resource
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where a deferred definition reaches itself with no link to
 *     break the cycle, or states a target that doesn't narrow the one the link it is reached through overrides
 */
export function getShapeId(shape: Lazy<Shape>): Optional<Identifier> {

	return named(shape, "id");

}

/**
 * Resolves the name of the member typing the resources a shape describes.
 *
 * @param shape The shape to resolve, possibly deferred to break definition cycles
 *
 * @returns The name the class is stated under, or `undefined` where the target states none or `shape` points at no
 *     resource
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where a deferred definition reaches itself with no link to
 *     break the cycle, or states a target that doesn't narrow the one the link it is reached through overrides
 */
export function getShapeType(shape: Lazy<Shape>): Optional<Identifier> {

	return named(shape, "type");

}

/**
 * Resolves the members the resources a shape describes carry.
 *
 * @param shape The shape to resolve, possibly deferred to break definition cycles
 *
 * @returns The members of the target shape, or no member at all where `shape` points at no resource
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where a deferred definition reaches itself with no link to
 *     break the cycle, or states a target that doesn't narrow the one the link it is reached through overrides
 */
export function getShapeProperties(shape: Lazy<Shape>): Members {

	return getShapeTarget(shape)?.members ?? {};

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Retrieves the identifier of a state.
 *
 * @typeParam S The type of `shape`, fixing the type of `state`
 *
 * @param shape The resource shape `state` conforms to, possibly deferred to break definition cycles
 * @param state The state to read
 *
 * @returns The identifier `state` states, or `undefined` where `shape` declares no id member or `state` states none
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `state` doesn't conform to `shape`, where a deferred
 *     definition reaches itself with no link to break the cycle, or where it states a target that doesn't narrow the
 *     one the link it is reached through overrides, as a re-pointed target must extend the one it replaces
 */
export function getStateId<S extends Lazy<ResourceShape>>(shape: S, state: State<S>): Optional<Reference> {

	const $state = validated(shape, state);

	// ;(cast) the id member of a valid state holds a reference, if any

	return opt(getShapeId(shape), id => $state[id] as Optional<Reference>);

}

/**
 * Retrieves the values of a state.
 *
 * Each value comes as an {@link Entry} typed by the value shape it matches. Entries follow member declaration order,
 * then value order within each member. The id and type members are not values and produce no entry.
 *
 * @typeParam S The type of `shape`, fixing the type of `state`
 *
 * @param shape The resource shape `state` conforms to, possibly deferred to break definition cycles
 * @param state The state to read
 *
 * @returns One entry for each value `state` holds under a property `shape` declares
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `state` doesn't conform to `shape`, where a deferred
 *     definition reaches itself with no link to break the cycle, where it states a target that doesn't narrow the one
 *     the link it is reached through overrides, or where a union range declares a shared member name inconsistently
 */
export function getStateEntries<S extends Lazy<ResourceShape>>(shape: S, state: State<S>): readonly Entry[] {

	const $state = validated(shape, state);

	// ;(cast) a valid value is the state of the branch it matches, never a union as getShapeBranches flattens unions

	return Object.entries(getShapeProperties(shape)).flatMap(([field, property]) => property.kind === "property"
		? some($state[field]).flatMap(value => opt(
			matched(value, getShapeBranches(property.range.shape)),
			branch => [{ kind: branch.kind, field, property, shape: branch, value } as Entry],
			[]
		))
		: []
	);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates a state against its shape, at no cost where the state was already found valid.
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `state` doesn't conform to `shape`
 */
function validated<S extends Lazy<ResourceShape>>(shape: S, state: State<S>): State<S> {

	return validate(state, { shape })({
		value: value => value,
		trace: trace => error(new TraceError("invalid state", trace ?? []))
	});

}

/**
 * Resolves the branch a valid value matches, matching it again only where a union leaves more than one branch.
 */
function matched(value: unknown, branches: readonly Shape[]): Optional<Shape> {

	return branches.length === 1 ? branches[0] : getStateBranch(value, branches);

}

/**
 * Resolves the name the marker of a given kind is stated under.
 */
function named(shape: Lazy<Shape>, kind: "id" | "type"): Optional<Identifier> {

	return Object.entries(getShapeTarget(shape)?.members ?? {})
		.find(([, declared]) => declared.kind === kind)
		?.[0];

}
