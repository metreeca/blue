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

import type { Eager, Lazy, Optional } from "@metreeca/core";
import type { Reference } from "@metreeca/qest/resource";
import type { BooleanShape } from "./boolean.js";
import type { NumberShape } from "./number.js";
import type { ReferenceShape } from "./reference.js";
import type { Count, Id, Member, Members, Parents, ResourceShape, Type } from "./resource.js";
import type { StringShape } from "./string.js";

export type Shape =
	| BooleanShape
	| NumberShape
	| StringShape
	| ReferenceShape
	| ResourceShape


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * The transfer a state is resolved for.
 *
 * A shape describes two value types, since retrieval and submission differ in what the peer is responsible for.
 */
export type Transfer =
	| "retrieval"
	| "submission"

/**
 * Resolves the state a shape describes, as retrieved.
 *
 * Yields the value type instances of the shape expose, computed from the members the shape declares rather than
 * carried alongside it, so that the two cannot drift. A {@link ReferenceShape} contributes the target IRI alone,
 * keeping a linked resource out of the state it points at. Reach for `State` wherever a resource is read.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type State<S extends Lazy<Shape>> =
	Resolved<S, "retrieval">

/**
 * Resolves the state a shape describes, as submitted.
 *
 * Yields the value type a resource being created or updated satisfies, which differs from the {@link State | retrieved}
 * one in what the submitter is responsible for: an identifier and a system-managed member may be left out, a member
 * owned by the resources it points at is not accepted at all, and a captive target may be supplied inline rather than
 * by IRI, so that a resource and the ones it holds captive travel together. Reach for `Draft` wherever a resource is
 * written.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 *
 * @see {@link https://github.com/metreeca/keep/issues/4 keep#4}
 */
export type Draft<S extends Lazy<Shape>> =
	Resolved<S, "submission">

/**
 * Resolves the state a shape describes for a transfer.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 * @typeParam T The transfer the state is resolved for
 */
export type Resolved<S extends Lazy<Shape>, T extends Transfer> =
	[Eager<S>] extends [never] ? never
		: Eager<S> extends BooleanShape ? boolean
			: Eager<S> extends NumberShape ? number
				: Eager<S> extends StringShape ? string
					: Eager<S> extends ReferenceShape ? Reference
						: Eager<S> extends {
								readonly kind: "resource",
								readonly extends: infer I extends Parents,
								readonly members: infer M extends Members
							} ? Exposed<Merged<Inherited<I>, M>, T>
							: never

/**
 * Resolves the members a resource carries for a transfer.
 *
 * @typeParam M The members the shape describes
 * @typeParam T The transfer the members are resolved for
 */
export type Exposed<M extends Members, T extends Transfer> =
	T extends "submission" ? Submission<M> : Instance<M>

/**
 * Resolves the members a retrieved resource carries.
 *
 * @typeParam M The members the shape describes
 */
export type Instance<M extends Members> = {

	readonly [field in keyof M]: Content<M[field]>

};

/**
 * Resolves the members a submitted resource carries.
 *
 * Drops the members the submitter does not own and leaves optional the ones the system supplies, keeping the rest as
 * the shape states them.
 *
 * @typeParam M The members the shape describes
 */
export type Submission<M extends Members> =
	& { readonly [field in keyof M as Duty<M[field]> extends "demanded" ? field : never]: Content<M[field], "submission"> }
	& { readonly [field in keyof M as Duty<M[field]> extends "spared" ? field : never]?: Content<M[field], "submission"> }

/**
 * Resolves what a submission owes for a member.
 *
 * Yields `refused` for a member the resources it points at own, `spared` for an identifier and for a system-managed
 * member, both of which a submission may leave out, and `demanded` for every other.
 *
 * @typeParam M The member to resolve
 */
export type Duty<M> =
	M extends { readonly foreign: true } ? "refused"
		: M extends { readonly kind: "id" } ? "spared"
			: M extends { readonly computed: true } ? "spared"
				: "demanded"

/**
 * Resolves the members a list of extended shapes contributes.
 *
 * Yields the members the extended shapes declare, together with those they inherit in turn, so that a constraint
 * stated anywhere up the chain reaches every extending resource.
 *
 * @typeParam I The extended shapes, possibly deferred to break definition cycles
 */
export type Inherited<I extends Parents> =
	I extends readonly [infer H extends Lazy<ResourceShape>, ...infer T extends Parents]
		? Declared<H> & Inherited<T>
		: {}

/**
 * Resolves the members a single shape contributes.
 *
 * @typeParam S The extended shape, possibly deferred to break definition cycles
 */
export type Declared<S extends Lazy<ResourceShape>> =
	Eager<S> extends {
			readonly extends: infer P extends Parents,
			readonly members: infer M extends Members
		} ? Inherited<P> & M
		: {}

/**
 * Merges declared members over inherited ones.
 *
 * Retains a member that restricts the one it overrides and voids any other, so an extending resource may tighten what
 * it inherits but never relax it. Members the extended shapes do not declare pass through untouched.
 *
 * @typeParam P The members the extended shapes contribute
 * @typeParam M The members the extending resource declares in its own right
 */
export type Merged<P, M extends Members> = Omit<P, keyof M> & {

	readonly [field in keyof M]: field extends keyof P
		? Narrows<M[field], P[field]> extends true ? M[field] : never
		: M[field]

}

/**
 * Checks whether a member restricts another.
 *
 * Compares the member kind, the range and the two cardinality bounds in their own right, rather than the state they
 * project, so that two ranges which happen to project the same state are told apart. A bound may only be tightened,
 * and only within the arity it states: raising a lower bound restricts the values admitted, while capping an unbounded
 * property at a single value swaps an array for a bare value and is refused.
 *
 * @typeParam C The member the extending resource declares
 * @typeParam P The member it overrides
 */
export type Narrows<C, P> =
	[Kinds<C, P>, Ranges<C, P>, Lowers<C, P>, Uppers<C, P>] extends [true, true, true, true] ? true : false

type Kinds<C, P> =
	[C, P] extends [{ readonly kind: infer C }, { readonly kind: infer P }]
		? C extends P ? true : false
		: false

type Ranges<C, P> =
	[C, P] extends [
			{ readonly range: infer C extends Lazy<Shape> },
			{ readonly range: infer P extends Lazy<Shape> }
		] ? Eager<C>["kind"] extends Eager<P>["kind"] ? true : false
		: true

type Lowers<C, P> =
	[C, P] extends [{ readonly minCount: infer C extends Count }, { readonly minCount: infer P extends Count }]
		? Unbounded<C> extends true ? Unbounded<P> : true
		: true

type Uppers<C, P> =
	[C, P] extends [{ readonly maxCount: infer C extends Count }, { readonly maxCount: infer P extends Count }]
		? Single<C> extends Single<P> ? true : false
		: true

/**
 * Checks whether an upper bound limits a property to a single value.
 *
 * @typeParam U The greatest number of values admitted
 */
export type Single<U extends Count> =
	[U] extends [1] ? true : false

/**
 * Resolves the value a member carries.
 *
 * @typeParam M The member to resolve
 * @typeParam T The transfer the value is resolved for
 */
export type Content<M extends Member, T extends Transfer = "retrieval"> =
	M extends Id ? Reference
		: M extends Type ? Optional<Reference>
			: M extends {
					readonly kind: "property",
					readonly range: infer R extends Lazy<Shape>,
					readonly minCount: infer L extends Count,
					readonly maxCount: infer U extends Count
				} ? Bounded<Ranged<M, R, T>, L, U>
				: never

/**
 * Resolves the value a property range admits.
 *
 * Admits a captive target inline alongside its IRI where a submission states one, and otherwise carries the state the
 * range describes.
 *
 * @typeParam M The member stating the range
 * @typeParam R The range it states
 * @typeParam T The transfer the value is resolved for
 */
export type Ranged<M, R extends Lazy<Shape>, T extends Transfer> =
	[T, M] extends ["submission", { readonly captive: true }]
		? Eager<R> extends ReferenceShape<infer X> ? Reference | Draft<X> : State<R>
		: State<R>

/**
 * Resolves the form a cardinality admits.
 *
 * Yields a bare value where the property is limited to one, an array otherwise, marking the form optional unless at
 * least one value is required. Bounds beyond the four the cardinality factories name are honoured all the same, so a
 * lower bound of two admits the same non-empty form as one.
 *
 * @typeParam V The value the property range describes
 * @typeParam L The least number of values admitted
 * @typeParam U The greatest number of values admitted
 */
export type Bounded<V, L extends Count, U extends Count> =
	[U] extends [1]
		? Unbounded<L> extends true ? undefined | V : V
		: Unbounded<L> extends true ? undefined | readonly V[]
			: readonly [V, ...V[]]

/**
 * Checks whether a lower bound leaves the property absent.
 *
 * Yields `true` unless at least one value is known to be required, so a bound stated as zero and a bound left
 * unstated both admit absence, as does one stated only as a number.
 *
 * @typeParam L The least number of values admitted
 */
export type Unbounded<L extends Count> =
	[undefined] extends [L] ? true
		: [0] extends [L] ? true
			: false
