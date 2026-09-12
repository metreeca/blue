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
 * Resource type inference.
 *
 * Resolves the value a resource shape describes: `Retrieved` for the state a stored resource carries and `Submitted`
 * for the one a writer may state, each mapping the members the shape declares and the ones it inherits to the form
 * their range and cardinality admit.
 *
 * @module
 */

import type { Eager, Lazy, Optional } from "@metreeca/core";
import type { Reference } from "@metreeca/qest/resource";
import type { Compound, Instance, Shape } from "../value/index.js";
import type { DictionaryShape } from "../dictionary/index.js";
import type { ReferenceShape } from "../reference/index.js";
import type { UnionShape } from "../union/index.js";
import type { Id, Parents, Property, PropertyBounds, ResourceShape, Type } from "./index.js";


//// Resource Inheritance ////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the members a resource carries.
 *
 * Yields the members the shape declares merged over the ones it inherits, and no member at all for a shape that
 * describes something other than a resource. A declared member that restricts the one it overrides is retained and
 * any other is voided, so an extending resource may tighten what it inherits but never relax it.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Carried<S extends Lazy<Shape>> =
	Eager<S> extends ResourceShape<infer P, infer M> ? Merged<Inherited<P>, M> : {}

/**
 * Resolves the members a list of extended shapes contributes.
 *
 * Yields the members every extended shape carries, so that a constraint stated anywhere up the chain reaches every
 * extending resource and shapes agreeing on a member pass it on as it stands.
 *
 * @typeParam P The extended shapes, possibly deferred to break definition cycles
 */
export type Inherited<P extends Parents> =
	P extends readonly [infer H extends Lazy<ResourceShape>, ...infer T extends Parents]
		? Carried<H> & Inherited<T>
		: {}

/**
 * Merges declared members over inherited ones.
 *
 * Retains a declared member whose outline restricts the one it overrides and voids any other; inherited members left
 * undeclared pass through untouched.
 *
 * @typeParam I The inherited members
 * @typeParam M The members the extending resource declares in its own right
 */
export type Merged<I, M> = Omit<I, keyof M> & {

	readonly [field in keyof M]: field extends keyof I
		? Outline<M[field]> extends Outline<I[field]> ? M[field] : never
		: M[field]

}

/**
 * Resolves the outline a member may be narrowed within.
 *
 * Yields, for a property, the kind of its range in the form its cardinality admits, and an identifier or a type as it
 * stands, so that a member restricts another exactly when its outline is assignable to the other's: the range kind is
 * kept, telling apart two ranges which happen to project the same state, a required value is never made optional, and
 * a repeated property is never capped at a single value, which would swap an array for a bare value.
 *
 * @typeParam M The member to outline
 */
export type Outline<M> =
	M extends Property<infer R, infer L, infer U> ? Arity<Eager<R>["kind"], L, U> : M


//// Resource Members ////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the value an instance of a resource carries.
 *
 * Maps every member the shape carries to its content, leaving optional the ones a resource may leave out.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Retrieved<S extends Lazy<Shape>> =
	Loose<Carried<S>> extends infer M ? { readonly [field in keyof M]: Content<M[field]> } : never

/**
 * Resolves the value a resource carries with the ones it holds captive inlined.
 *
 * Maps the members the resource owns to their input, leaving optional the ones a writer may leave out: the
 * identifier, as the system fills it in, and the ones the resource may do without.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Submitted<S extends Lazy<Shape>> =
	Loose<Owned<S>, Id> extends infer M ? { readonly [field in keyof M]: Input<M[field]> } : never

/**
 * Resolves the members a resource owns: every member the shape carries but a foreign one.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Owned<S extends Lazy<Shape>> = {

	readonly [field in keyof Carried<S> as Carried<S>[field] extends Foreign ? never : field]: Carried<S>[field]

}

/**
 * A member a submission does not accept, as the resources it points at own it.
 */
export type Foreign = {

	readonly foreign: true

}


/**
 * Marks optional the members a resource may leave out.
 *
 * Yields the members as they stand, optional where a resource may leave them out, so that a value mapped over them
 * requires exactly the members the resource is bound to carry.
 *
 * @typeParam M The members to mark
 * @typeParam X The members left out on top of the ones any resource may leave out
 */
export type Loose<M, X = never> = Joined<
	& { readonly [field in keyof M as Omitted<M[field], X> extends true ? never : field]: M[field] }
	& { readonly [field in keyof M as Omitted<M[field], X> extends true ? field : never]?: M[field] }
>

/**
 * Joins the parts of a record into a single one.
 *
 * Yields one record carrying every member the parts declare, with its modifiers, so that a resource resolved from
 * required and optional members reads and compares as one type rather than as an intersection.
 *
 * @typeParam T The parts to join
 */
export type Joined<T> = {

	[field in keyof T]: T[field]

}

/**
 * Checks whether a member may be left out of a resource.
 *
 * Yields `true` for a type, for a member of the kinds a transfer names and for a property whose lower bound is
 * skippable, so that a resource states only the members it is bound to carry. A voided member is never left out, so
 * that a conflict surfaces where the state is resolved.
 *
 * @typeParam M The member to check
 * @typeParam X The members a transfer lets out on top of the ones any resource may leave out
 */
export type Omitted<M, X = never> =
	[M] extends [never] ? false
		: M extends Type | X ? true
			: M extends Property<Lazy<Shape>, infer L, Optional<number>> ? Skippable<L>
				: false

/**
 * Resolves the value a member carries in an instance.
 *
 * Yields an IRI for an identifier, an optional IRI for a type and, for a property, the
 * {@link Slot | form its range and cardinality admit}.
 *
 * @typeParam M The member to resolve
 */
export type Content<M> =
	M extends Id ? Reference
		: M extends Type ? Optional<Reference>
			: M extends Property<infer R, infer L, infer U> ? Slot<R, L, U>
				: never

/**
 * Resolves the value a member carries in a compound.
 *
 * Admits a captive target inline alongside its IRI and otherwise carries what the member carries in an instance, as
 * a scalar has nothing to hold captive.
 *
 * @typeParam M The member to resolve
 */
export type Input<M> =
	M extends { readonly captive: true } & Property<Lazy<ReferenceShape<infer T>>, infer L, infer U>
		? Arity<Reference | Compound<T>, L, U>
		: Content<M>


//// Property Cardinality ////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the form a property carries its values in, holding localised text apart.
 *
 * Yields the {@link Arity | arity} form of the values a range describes, except that localised text is carried whole:
 * a language map holds its strings per tag at the arity its own shape states, so it is never wrapped in an array and
 * never sits in one beside the values of sibling branches. A range admitting localised text alone reads as the bare
 * map, whatever the upper bound; one admitting it beside other branches reads as either the map or the arity form of
 * the other values, as a resource carries one or the other and never both. Either form is optional where the lower
 * bound lets the property be left out.
 *
 * @typeParam R The range describing the values, possibly deferred to break definition cycles
 * @typeParam L The least number of values admitted
 * @typeParam U The greatest number of values admitted
 */
export type Slot<R extends Lazy<Shape>, L extends Optional<number>, U extends Optional<number>> =
	[Localised<R>] extends [never] ? Arity<Instance<R>, L, U>
		: [Valued<R>] extends [never] ? Arity<Instance<R>, L, 1>
			: Arity<Instance<Valued<R>>, L, U> | Arity<Instance<Localised<R>>, L, 1>

/**
 * Resolves the alternatives a range admits, each eager.
 *
 * Yields every branch of a union and a shape of any other kind as it stands, so that the branches can be told apart by
 * kind; a bare {@link value!Shape}, standing for any kind at all, admits no alternative.
 *
 * @typeParam R The range describing the values, possibly deferred to break definition cycles
 */
type Variant<R extends Lazy<Shape>> =
	Shape extends Eager<R> ? never
		: Eager<R> extends infer E extends Shape
			? E extends UnionShape<infer B> ? Eager<B[number]> : E
			: never

/**
 * Resolves the alternatives of a range carrying localised text.
 *
 * @typeParam R The range describing the values, possibly deferred to break definition cycles
 */
type Localised<R extends Lazy<Shape>> =
	Extract<Variant<R>, DictionaryShape>

/**
 * Resolves the alternatives of a range carrying anything but localised text.
 *
 * @typeParam R The range describing the values, possibly deferred to break definition cycles
 */
type Valued<R extends Lazy<Shape>> =
	Exclude<Variant<R>, DictionaryShape>

/**
 * Resolves the form a value takes at the arity its bounds admit.
 *
 * Yields a bare value where the range admits at most one, an array otherwise, marking the form optional unless at
 * least one value is known to be required. Bounds beyond the four the cardinality factories name are honoured all
 * the same, so a lower bound of two admits the same non-empty form as one.
 *
 * @typeParam V The value the range describes
 * @typeParam L The least number of values admitted
 * @typeParam U The greatest number of values admitted
 */
export type Arity<V, L extends Optional<number>, U extends Optional<number>> =
	Skippable<L> extends true
		? Optional<[U] extends [1] ? V : readonly V[]>
		: [U] extends [1] ? V : readonly [V, ...V[]]

/**
 * Checks whether a lower bound lets the values be left out.
 *
 * Yields `true` unless at least one value is known to be required, so a bound stated as zero and a bound left
 * unstated both admit absence, as does one stated only as a number.
 *
 * @typeParam L The least number of values admitted
 */
export type Skippable<L extends Optional<number>> =
	[Extract<Optional<0>, L>] extends [never] ? false : true

/**
 * Resolves a cardinality bound stated in a constraints object.
 *
 * Yields the bound where the object states one and `undefined` where it does not, so a property built from
 * constraints carries the bounds it was given rather than the widest ones.
 *
 * @typeParam C The stated constraints
 * @typeParam K The bound to resolve
 */
export type Declared<C extends PropertyBounds, K extends keyof PropertyBounds> =
	K extends keyof C ? C[K] : undefined
