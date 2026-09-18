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
 * Value shape types and operations.
 *
 * Defines the {@link Shape} a value of any kind is matched against and the types a validated value comes back as, and
 * provides the accessors resolving what a shape reaches. A shape gathers the kinds the other modules state, so a
 * caller holding one needs not know which kind it holds, and the type of a validated value is derived from the shape
 * describing it, so the two cannot drift.
 *
 * **The shapes a value is drawn from**
 *
 * Each kind is stated in a module of its own:
 *
 * - {@link boolean!BooleanShape | BooleanShape} — truth values
 * - {@link number!NumberShape | NumberShape} — numeric values
 * - {@link string!StringShape | StringShape} — textual values
 * - {@link dictionary!DictionaryShape | DictionaryShape} — language-tagged maps
 * - {@link reference!ReferenceShape | ReferenceShape} — links to standalone resources
 * - {@link resource!ResourceShape | ResourceShape} — linked data resources
 * - {@link union!UnionShape | UnionShape} — a value drawn from one of several alternatives
 *
 * <img src="../index.svg" alt="Shape hierarchy" style="width: 100%" />
 *
 * {@link sh} names the SHACL terms the shapes are drawn from.
 *
 * **How many values a set admits**
 *
 * {@link Range} states the shape a set draws its values from and how many of them it admits, describing the set a
 * member declares and the set a path resolves to alike, so that either is read the same way. A range is not itself a
 * shape: a shape says what a value may be, a range how many of them there are.
 *
 * **The value a shape describes**
 *
 * The type of a value is derived from the shape describing it, so that the two cannot drift: {@link Instance} yields
 * the value the shape admits, as a resource is held and retrieved, and {@link Delivery} narrows it to the members a
 * retrieval template asked for, so a caller reads back its own request rather than everything the shape declares.
 *
 * ```typescript
 * type Item = Instance<typeof Product>;                        // { readonly id: Reference, readonly name: string, … }
 * type Read = Delivery<typeof Product, { name: {} }>;          // { readonly name: string }
 * ```
 *
 * **Resolving what a shape reaches**
 *
 * {@link eager} resolves a shape or range deferred to break a definition cycle, yielding a resource shape with its
 * inheritance merged and handing back the same value on every later reach.
 *
 * {@link effective} resolves the {@link Range} a path and transform pipe reach through a shape or range, so that a
 * caller may type a projection column or a constraint operand without walking the shape itself: it steps across the
 * members of the resources it reaches, crossing a link to the resource it points at and entering each alternative of
 * a union in turn, and answers with an issue where the path names a member no alternative carries or the pipe cannot
 * act on what the path reached.
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/shacl/ SHACL - Shapes Constraint Language}
 */

import type { Eager, Lazy, Optional } from "@metreeca/core";
import { createNamespace, type Namespace } from "@metreeca/core/resource";
import type { BooleanShape } from "../boolean/index.js";
import type { DictionaryShape } from "../dictionary/index.js";
import type { NumberShape } from "../number/index.js";
import type { ReferenceShape } from "../reference/index.js";
import type { ResourceShape } from "../resource/index.js";
import type { Retrieved } from "../resource/inference.js";
import type { StringShape } from "../string/index.js";
import type { UnionShape } from "../union/index.js";
import type { Branch } from "../union/inference.js";
import type { Plain } from "./inference.js";

export { eager, effective } from "./accessors.js";

export type { Delivery } from "./_inference.js";


/**
 * SHACL vocabulary namespace.
 *
 * An open {@link Namespace} over `http://www.w3.org/ns/shacl#`, resolving any SHACL term as a named property.
 *
 * @see {@link https://www.w3.org/TR/shacl/ SHACL - Shapes Constraint Language}
 */
export const sh: Namespace = createNamespace("http://www.w3.org/ns/shacl#");


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * A description of a value.
 *
 * Describes a plain value, a localised one, a reference to a resource, a resource in its own right or a value drawn
 * from one of several alternatives; a resource shape names the members its instances carry and may extend other
 * resource shapes. The type of the value a shape describes is derived from the shape itself, as {@link Instance}, so
 * that the two cannot drift.
 */
export type Shape =
	| BooleanShape
	| NumberShape
	| StringShape
	| DictionaryShape
	| ReferenceShape
	| ResourceShape
	| UnionShape


/**
 * Description of a cardinality-constrained value set.
 *
 * Describes the set a {@link resource!Property | property} declares and the set a path resolves to alike, so
 * that either may be read for how many values it admits and for the shape those values are drawn from.
 *
 * @typeParam R The shape the values are drawn from, possibly deferred to break definition cycles
 * @typeParam L The least number of values admitted
 * @typeParam U The greatest number of values admitted
 */
export type Range<
	R extends Lazy<Shape> = Lazy<Shape>,
	L extends Optional<number> = Optional<number>,
	U extends Optional<number> = Optional<number>
> = {

	/**
	 * Least number of values admitted.
	 *
	 * `undefined` leaves the set unbounded below.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinCountConstraintComponent SHACL § 4.2.1 sh:minCount}
	 */
	readonly minCount: L

	/**
	 * Greatest number of values admitted.
	 *
	 * `undefined` leaves the set unbounded above.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxCountConstraintComponent SHACL § 4.2.2 sh:maxCount}
	 */
	readonly maxCount: U


	/**
	 * Shape shared by every value in the set.
	 *
	 * Possibly deferred to break definition cycles: resolve it with {@link Eager} before reading it as a
	 * {@link Shape}.
	 */
	readonly shape: R

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the value a shape describes.
 *
 * Yields the type an instance of the shape takes: the plain value for a scalar, localised or reference shape,
 * for a resource shape a record of the members it declares merged over the ones it inherits, and for a union shape the
 * value of any of its branches, as the value alone tells the reader which branch it belongs to. A reference shape
 * contributes a {@link @metreeca/qest!Reference | Reference} to the target alone, keeping a linked resource out of the
 * value pointing at it. A bare {@link Shape}, standing for any kind at all, resolves to no value.
 *
 * Within a resource, an identifier carries the IRI of the resource itself and a type the IRI of its class, left
 * undefined where the resource is untyped. A property carries the values its range describes, as a bare value where it
 * admits at most one and as a read-only array otherwise, non-empty where at least one value is required; localised text
 * is carried whole as a tag-keyed map, at the arity its own shape states, so it is never wrapped in an array and never
 * sits in one beside the values of sibling branches, and a range admitting it alongside other branches carries either
 * the map or the other values, never both.
 *
 * A member the resource may leave out is optional, and one voided by a conflicting override carries no value at all, so
 * an extension relaxing what it inherits reads as a member nothing satisfies rather than silently dropping out.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 *
 * @opaque
 */
export type Instance<S extends Lazy<Shape>> =
	Shape extends Eager<S> ? never
		: Eager<S> extends infer E extends Shape
			? E extends ResourceShape ? Retrieved<E>
				: E extends UnionShape ? Instance<Branch<E>>
					: Plain<E>
			: never
