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
 * Value inference.
 *
 * Resolves what a shape admits at the type level: {@link Plain} maps a shape to the scalar, localised or reference
 * value it describes, and {@link Legal} narrows a domain to the values a set of constraints enumerates.
 *
 * @module
 */

import type { Eager, Lazy } from "@metreeca/core";
import type { Reference } from "@metreeca/qest/resource";
import type { BooleanShape } from "../boolean/index.js";
import type { Tagged } from "../dictionary/inference.js";
import type { DictionaryShape } from "../dictionary/index.js";
import type { NumberShape } from "../number/index.js";
import type { ReferenceShape } from "../reference/index.js";
import type { StringShape } from "../string/index.js";
import type { Shape } from "./index.js";


/**
 * Resolves the plain value a shape describes.
 *
 * Yields a boolean, a number or a string, narrowed to the values the shape enumerates where it does, a
 * {@link Tagged | tag-keyed map} for a localised shape, carrying its content at the arity the shape states as unique,
 * and a {@link Reference} to the target for a reference shape. A plain value carries no members, so it reads the same
 * whether or not captive resources are inlined; neither a resource shape nor a union shape describes a plain value.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Plain<S extends Lazy<Shape>> =
	Eager<S> extends BooleanShape ? boolean
		: Eager<S> extends NumberShape<infer V> ? V
			: Eager<S> extends StringShape<infer V> ? V
				: Eager<S> extends infer D extends DictionaryShape ? Tagged<D>
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
