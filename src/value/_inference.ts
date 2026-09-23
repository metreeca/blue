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
 * Retrieval result typing.
 *
 * Resolves the value a retrieval hands back, narrowed to the members the template asked for, so that a caller reads a
 * result typed by its own request rather than by everything the shape declares.
 *
 * > [!WARNING]
 * > Provisional. The reworked retrieval model leaves a template stating which values are wanted and no longer what
 * > they are, so every value type comes from the shape while the template contributes the key set alone. This module
 * > bridges that gap for the forms a template states as members, keeping the result types callers already read; a
 * > polymorphic member and a projection column fall back to what the shape describes. Both are settled by the type
 * > inference overhaul, which takes `Model<S>` and `Delivery<S, M>` into the value module.
 *
 * @module
 *
 * @document ./_inference.md
 *
 * @see [Retrieval Inference — Bridge](./_inference.md)
 */

import type { Eager, Lazy } from "@metreeca/core";
import type { Operator } from "@metreeca/qest/model";
import type { ReferenceShape } from "../reference/index.js";
import type { Property, ResourceShape } from "../resource/index.js";
import type { Arity, Carried, Content, Loose } from "../resource/inference.js";
import type { Shape } from "./index.js";


/**
 * Resolves what a retrieval hands back.
 *
 * Yields the value the shape describes, keyed down to the members the template named and descending into a nested
 * template through the resource it reaches, so that a caller reads back what it asked for and nothing wider. Depth,
 * cardinality and optionality come from the shape, the template stating which values are wanted and no longer what
 * they are.
 *
 * A member the template leaves out is left out of the result. A polymorphic member and a projection column are handed
 * back as the shape describes them, the alternatives a branch map names and the value an expression computes being
 * resolved by the inference overhaul rather than here.
 *
 * @typeParam S The shape the retrieval was stated against, possibly deferred to break definition cycles
 * @typeParam M The template that asked for it
 *
 * @opaque
 */
export type Delivery<S extends Lazy<ResourceShape>, M> =
	Loose<Asked<Carried<S>, M>> extends infer C
		? { readonly [field in keyof C]: Cell<C[field], Named<M, field>> }
		: never


//// ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Keeps the members a template named.
 *
 * Yields the members of `C` a plain key of `M` names, so that the result is keyed by the request rather than by the
 * shape.
 *
 * @typeParam C The members the shape carries
 * @typeParam M The template narrowing them
 */
type Asked<C, M> = {

	readonly [field in keyof C as field extends Wanted<M> ? field : never]: C[field]

}

/**
 * Resolves the members a template asks for.
 *
 * Yields the plain identifiers a template states, leaving out the constraint operators and projection bindings sharing
 * the key space with them.
 *
 * @typeParam M The template to read
 */
type Wanted<M> = keyof {

	readonly [field in keyof M as field extends `${Operator}${string}` ? never
		: field extends `${string}=${string}` ? never
			: field
	]: M[field]

}

/**
 * Resolves what a template states under a member.
 *
 * @typeParam M The template to read
 * @typeParam F The member to look up
 */
type Named<M, F> = F extends keyof M ? M[F] : never

/**
 * Resolves the value a member hands back under the template narrowing it.
 *
 * Descends into the resource a member reaches where the template asked for one through a nested template, keeping the
 * arity the member states, and hands back what the shape describes everywhere else.
 *
 * @typeParam C The member to resolve
 * @typeParam A What the template asked for under it
 */
type Cell<C, A> =
	C extends Property<infer R, infer L, infer U>

		// a range reaching no resource of its own, and a slot naming no member of one, stand as the shape describes

		? [Target<R>] extends [never] ? Content<C>
			: [Wanted<Nested<A>>] extends [never] ? Content<C>
				: Target<R> extends infer T extends Lazy<ResourceShape>
					? Arity<Delivery<T, Nested<A>>, L, U>
					: never

		: Content<C>

/**
 * Resolves the resource a range reaches, where it reaches one at all.
 *
 * Yields the target of a link and an embedded resource as it stands, and nothing for a range admitting values of
 * several kinds, which the inference overhaul resolves branch by branch.
 *
 * @typeParam R The range describing the values, possibly deferred to break definition cycles
 */
type Target<R extends Lazy<Shape>> =
	Shape extends Eager<R> ? never
		: Eager<R> extends infer E extends Shape
			? E extends ReferenceShape<infer T> ? T
				: E extends ResourceShape ? E
					: never
			: never

/**
 * Resolves the per-item template a slot states.
 *
 * Yields what the template asked for under a member as it stands, the constraint keys riding alongside it being left
 * out by the key filter the recursion applies.
 *
 * @typeParam A What the template asked for under a member
 */
type Nested<A> = A extends object ? A : {}
