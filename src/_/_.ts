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
import type { Instance, Merged, ResourceShape, Submission } from "./resource.js";
import type { StringShape } from "./string.js";


/**
 * The shapes a value may be described by.
 */
export type Shape =
	| BooleanShape
	| NumberShape
	| StringShape
	| ReferenceShape
	| ResourceShape


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
	Resolved<S, Instance<Carried<S>>>

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
 */
export type Draft<S extends Lazy<Shape>> =
	Resolved<S, Submission<Carried<S>>>


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the state a shape describes, given the value a resource exposes.
 *
 * Dispatches on the shape kind, yielding the value type a scalar shape describes in its own right and deferring to
 * the caller for a resource, so that retrieval and submission share one dispatch and differ only in what a resource
 * exposes.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 * @typeParam R The value a resource shape exposes through the members it carries
 */
export type Resolved<S extends Lazy<Shape>, R> =
	[Eager<S>] extends [never] ? never // !!! why?
		: Eager<S> extends BooleanShape ? boolean
			: Eager<S> extends NumberShape<infer V> ? V
				: Eager<S> extends StringShape<infer V> ? V
					: Eager<S> extends ReferenceShape ? Reference
						: Eager<S> extends ResourceShape ? R
							: never

/**
 * Resolves the members a resource carries.
 *
 * Yields the members the shape declares merged over the ones it inherits, and no member at all for a shape that
 * describes something other than a resource.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Carried<S extends Lazy<Shape>> =
	Eager<S> extends ResourceShape<infer I, infer M>
		? Merged<I, M>
		: {}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the values a constraints object admits.
 *
 * Yields the enumerated values where the constraints close the domain to a list, and the whole domain otherwise, so
 * that a state read from an enumerated shape is limited to the values it may actually take. Values stated too loosely
 * to be told apart leave the state as the whole domain.
 *
 * @typeParam C The stated constraints
 * @typeParam D The domain the values are drawn from
 */
export type Admitted<C, D> =
	C extends { readonly in: infer V extends readonly D[] }
		? V[number]
		: D
