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
 * Shared validation vocabulary.
 *
 * @module
 */

import type { Eager, Lazy, Optional } from "@metreeca/core";
import type { Tag } from "@metreeca/core/language";
import type { Reference } from "@metreeca/qest/resource";
import type { BooleanShape } from "./boolean.js";
import type { Unique } from "./dictionary.core.js";
import type { DictionaryShape } from "./dictionary.js";
import type { RangeCount, Shape } from "./index.js";
import type { NumberShape } from "./number.js";
import type { ReferenceShape } from "./reference.js";
import type { StringShape } from "./string.js";


/**
 * Resolves the plain value a shape describes.
 *
 * Yields a boolean, a number or a string, narrowed to the values the shape enumerates where it does, a tag-keyed map
 * for a localised shape, carrying its content at the arity the shape states as {@link Unique | unique}, and a
 * {@link Reference} to the target for a reference shape. A plain value carries no members, so it reads the same
 * whether or not captive resources are inlined; neither a resource shape nor a union shape describes a plain value.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Plain<S extends Lazy<Shape>> =
	Eager<S> extends BooleanShape ? boolean
		: Eager<S> extends NumberShape<infer V> ? V
			: Eager<S> extends StringShape<infer V> ? V
				: Eager<S> extends infer D extends DictionaryShape
					? { readonly [tag: Tag]: Unique<D> extends true ? string : readonly string[] }
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


//// Property Cardinality ////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the form a value takes at the arity its bounds admit.
 *
 * Yields a bare value where the range admits at most one, an array otherwise, marking the form optional unless at
 * least one value is {@link Skippable | known to be required}. Bounds beyond the four the cardinality factories name
 * are honoured all the same, so a lower bound of two admits the same non-empty form as one.
 *
 * @typeParam V The value the range describes
 * @typeParam L The least number of values admitted
 * @typeParam U The greatest number of values admitted
 */
export type Arity<V, L extends RangeCount, U extends RangeCount> =
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
export type Skippable<L extends RangeCount> =
	[Extract<Optional<0>, L>] extends [never] ? false : true
