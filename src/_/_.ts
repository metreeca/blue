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
import type { ResourceShape, Retrieved, Submitted } from "./resource.js";
import type { StringShape } from "./string.js";
import type { Drawn, Offered, UnionShape } from "./union.js";


/**
 * A description of a value.
 *
 * Describes a plain value, a reference to a resource, a resource in its own right or a value drawn from one of several
 * alternatives; a resource shape names the members its instances carry and may extend other resource shapes. The type
 * of the value a shape describes is derived from the shape itself, as {@link Instance} or {@link Proposal}, so that the
 * two cannot drift.
 */
export type Shape =
	| BooleanShape
	| NumberShape
	| StringShape
	| ReferenceShape
	| ResourceShape
	| UnionShape


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the value a shape describes, as retrieved.
 *
 * Yields the type a retrieved instance of the shape exposes: the {@link Plain} value for a scalar or reference shape,
 * for a resource shape a record of the members it declares merged over the ones it inherits, and for a union shape the
 * value of every branch at once, as the stored value alone tells the reader which branch it belongs to. A reference
 * contributes the target IRI alone, keeping a linked resource out of the state it points at. Reach for `Instance`
 * wherever a resource is read.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Instance<S extends Lazy<Shape>> =
	[Eager<S>] extends [never] ? never
		: Eager<S> extends ResourceShape ? Retrieved<S>
			: Eager<S> extends UnionShape ? Drawn<S>
				: Plain<S>

/**
 * Resolves the value a shape describes, as submitted.
 *
 * Yields the type a resource being created or updated satisfies. It differs from the {@link Instance | retrieved}
 * one in what the submitter is responsible for: an identifier and a system-managed member may be left out, a member
 * owned by the resources it points at is not accepted at all, and a captive target may be supplied inline rather than
 * by IRI, so that a resource and the ones it holds captive travel together. A {@link Plain} value is submitted as it
 * is retrieved, and a union shape admits the payload of every branch, as the submitted value is expected to single out
 * the one branch it is stored under. Reach for `Proposal` wherever a resource is written.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Proposal<S extends Lazy<Shape>> =
	[Eager<S>] extends [never] ? never
		: Eager<S> extends ResourceShape ? Submitted<S>
			: Eager<S> extends UnionShape ? Offered<S>
				: Plain<S>


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the plain value a shape describes.
 *
 * Yields a boolean, a number or a string, narrowed to the values the shape enumerates where it does, and the target
 * IRI for a reference shape. A plain value carries no members, so it reads the same whether retrieved or submitted;
 * neither a resource shape nor a union shape describes a plain value.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Plain<S extends Lazy<Shape>> =
	Eager<S> extends BooleanShape ? boolean
		: Eager<S> extends NumberShape<infer V> ? V
			: Eager<S> extends StringShape<infer V> ? V
				: Eager<S> extends ReferenceShape ? Reference
					: never

/**
 * Resolves the legal values under a set of constraints.
 *
 * Yields the enumerated values where the constraints close the domain to a list, and the whole domain otherwise, so
 * that a value read from an enumerated shape is typed by the values it may actually take. An empty list closes
 * nothing, and neither does a list whose values are stated too loosely to be told apart.
 *
 * @typeParam C The stated constraints
 * @typeParam D The domain the values are drawn from
 */
export type Legal<C, D> =
	C extends { readonly in: infer V extends readonly D[] }
		? [V[number]] extends [never] ? D : V[number]
		: D
