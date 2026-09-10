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

import type { Eager, Lazy } from "@metreeca/core";
import type { Reference } from "@metreeca/qest/resource";
import type { BooleanShape } from "./boolean.js";
import type { NumberShape } from "./number.js";
import type { ReferenceShape } from "./reference.js";
import type { Inherited, Instance, Members, Merged, Parents, ResourceShape, Submission } from "./resource.js";
import type { StringShape } from "./string.js";


//// Shapes //////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * The shapes a value may be described by.
 */
export type Shape =
	| BooleanShape
	| NumberShape
	| StringShape
	| ReferenceShape
	| ResourceShape

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


//// Resolution //////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * The transfer a state is resolved for.
 *
 * A shape describes two value types, since retrieval and submission differ in what the peer is responsible for.
 */
export type Transfer =
	| "retrieval"
	| "submission"

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
