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
import type { DictionaryShape } from "./dictionary.js";
import type { Plain } from "./index.core.js";
import type { NumberShape } from "./number.js";
import type { ReferenceShape } from "./reference.js";
import type { Retrieved, Submitted } from "./resource.core.js";
import type { ResourceShape } from "./resource.js";
import type { StringShape } from "./string.js";
import type { Branch } from "./union.core.js";
import type { UnionShape } from "./union.js";

export { eager, effective } from "./index.core.js";


/**
 * A description of a value.
 *
 * Describes a plain value, a localised one, a reference to a resource, a resource in its own right or a value drawn
 * from one of several alternatives; a resource shape names the members its instances carry and may extend other
 * resource shapes. The type of the value a shape describes is derived from the shape itself, as {@link Instance} or
 * {@link Compound}, so that the two cannot drift.
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
 * Describes the set a property declares and the set a path resolves to alike, so that either may be read for how many
 * values it admits and for the shape those values are drawn from.
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
 * Yields the type an instance of the shape takes: the {@link Plain} value for a scalar, localised or reference shape,
 * for a resource shape a record of the members it declares merged over the ones it inherits, and for a union shape the
 * value of every branch at once, as the value alone tells the reader which branch it belongs to. A reference shape
 * contributes a {@link Reference} to the target alone, keeping a linked resource out of the value pointing at it. A
 * shape left wholly undescribed, admitting any shape at all, resolves to no value.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Instance<S extends Lazy<Shape>> =
	Shape extends Eager<S> ? never
		: Eager<S> extends infer E extends Shape
			? E extends ResourceShape ? Retrieved<E>
				: E extends UnionShape ? Instance<Branch<E>>
					: Plain<E>
			: never

/**
 * Resolves the value a shape describes, with captive resources inlined.
 *
 * Yields the {@link Instance} type of the shape, with the differences captivity brings: a captive reference admits its
 * target either as a {@link Reference} or as the resource itself, nested in turn as a compound, so that a resource and
 * the ones it holds captive travel as a single value; the identifier is left optional, as a resource yet to be created
 * has none to state; and a {@link resource!Foreign | foreign} member is left out altogether, as the resources it points
 * at carry the link rather than the compound. A {@link Plain} value, holding nothing captive, reads exactly as an
 * instance does.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Compound<S extends Lazy<Shape>> =
	Shape extends Eager<S> ? never
		: Eager<S> extends infer E extends Shape
			? E extends ResourceShape ? Submitted<E>
				: E extends UnionShape ? Compound<Branch<E>>
					: Plain<E>
			: never
