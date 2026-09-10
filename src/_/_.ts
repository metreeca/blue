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

import type { Eager, Identifier, Lazy, Optional } from "@metreeca/core";
import type { Reference } from "@metreeca/qest/resource";
import type { PropertyConstrains, ResourceConstraints } from "./resource.js";


export type Shape =
	| BooleanShape
	| NumberShape
	| StringShape
	| ReferenceShape
	| ResourceShape


export type BooleanShape = {

	readonly kind: "boolean"

}

export type NumberShape = {

	readonly kind: "number"

}

export type StringShape = {

	readonly kind: "string"

}

export type ReferenceShape = {

	readonly kind: "reference"

}

export type ResourceShape<P extends Parents = Parents, M extends Members = Members> = ResourceConstraints & {

	readonly kind: "resource"


	readonly extends: P

	readonly members: M

}


export type Parents =
	readonly Lazy<ResourceShape>[]

export type Member =
	| Id
	| Type
	| Property

export type Members = {

	readonly [field: Identifier]: Member

}


export type Id = {

	readonly kind: "id"

}

export type Type = {

	readonly kind: "type"

}

export type Property<
	R extends Lazy<Shape> = Lazy<Shape>,
	L extends Count = Count,
	U extends Count = Count
> = PropertyConstrains & {

	readonly kind: "property"

	readonly range: R

	/**
	 * Least number of values the property admits.
	 *
	 * @defaultValue `undefined` (no lower bound)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinCountConstraintComponent SHACL § 4.2.1 sh:minCount}
	 */
	readonly minCount: L

	/**
	 * Greatest number of values the property admits.
	 *
	 * @defaultValue `undefined` (no upper bound)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxCountConstraintComponent SHACL § 4.2.2 sh:maxCount}
	 */
	readonly maxCount: U

}

/**
 * A cardinality bound, absent where the property states none.
 */
export type Count =
	undefined | number

/**
 * Property constraints admitting explicit cardinality bounds.
 *
 * Accepted by {@link property} for bounds beyond the four the cardinality factories name.
 */
export type PropertyBounds = PropertyConstrains & {

	readonly minCount?: Count
	readonly maxCount?: Count

}

/**
 * Resolves a cardinality bound stated in a constraints object.
 *
 * Yields the bound where the object states one and `undefined` where it does not, so a property built from
 * constraints carries the bounds it was given rather than the widest ones.
 *
 * @typeParam C The stated constraints
 * @typeParam K The bound to resolve
 */
export type Stated<C, K extends string> =
	K extends keyof C ? (C[K] extends Count ? C[K] : undefined) : undefined


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the state a shape describes.
 *
 * Yields the value type instances of the shape expose, computed from the members the shape declares rather than
 * carried alongside it, so that the two cannot drift. A {@link ReferenceShape} contributes the target IRI alone,
 * keeping a linked resource out of the state it points at.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type State<S extends Lazy<Shape>> =
	Eager<S> extends BooleanShape ? boolean
		: Eager<S> extends NumberShape ? number
			: Eager<S> extends StringShape ? string
				: Eager<S> extends ReferenceShape ? Reference
					: Eager<S> extends {
							readonly kind: "resource",
							readonly extends: infer I extends Parents,
							readonly members: infer M extends Members
						} ? Inheritance<I> & Instance<M>
						: never

/**
 * Resolves the state contributed by a list of extended shapes.
 *
 * Yields the intersection of the states the extended shapes describe, that is the inherited members an extending
 * resource is required to expose alongside its own.
 *
 * @typeParam I The extended shapes, possibly deferred to break definition cycles
 */
export type Inheritance<I extends Parents> =
	I extends readonly [infer H extends Lazy<ResourceShape>, ...infer T extends Parents]
		? State<H> & Inheritance<T>
		: unknown

export type Instance<M extends Members> = {

	readonly [field in keyof M]: Content<M[field]>

};

export type Content<M extends Member> =
	M extends Id ? Reference
		: M extends Type ? Optional<Reference>
			: M extends {
					readonly kind: "property",
					readonly range: infer R extends Lazy<Shape>,
					readonly minCount: infer L extends Count,
					readonly maxCount: infer U extends Count
				} ? Bounded<State<R>, L, U>
				: never

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


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function boolean(): BooleanShape {
	throw new Error(";( to be implemented");
} // !!! narrow the state from {in}

export function number(): NumberShape {
	throw new Error(";( to be implemented");
} // !!! narrow the state from {in}

export function string(): StringShape {
	throw new Error(";( to be implemented");
} // !!! narrow the state from {in}

export function text(): StringShape {
	throw new Error(";( to be implemented");
}

export function markdown(): StringShape {
	throw new Error(";( to be implemented");
}

export function dictionary() {}


export function reference(shape: Lazy<ResourceShape>): ReferenceShape {
	throw new Error(";( to be implemented"); // !!!
}

export function resource<I extends Parents, M extends Members>(
	...args: [...inheritance: I, members: M]
): ResourceShape<I, M>

export function resource<I extends Parents, M extends Members>(
	...args: [...inheritance: I, members: M, constraints: ResourceConstraints]
): ResourceShape<I, M>

export function resource(...args: readonly unknown[]): ResourceShape {
	throw new Error(";( to be implemented");
}


export function id(): Id {
	throw new Error(";( to be implemented");
}

export function type(): Type {
	throw new Error(";( to be implemented");
}


export function multiple<R extends Lazy<Shape>>(
	range: R, constraints?: PropertyConstrains
): Property<R, undefined, undefined> {
	throw new Error(";( to be implemented");
}

export function nonempty<R extends Lazy<Shape>>(
	range: R, constraints?: PropertyConstrains
): Property<R, 1, undefined> {
	throw new Error(";( to be implemented");
}

export function optional<R extends Lazy<Shape>>(
	range: R, constraints?: PropertyConstrains
): Property<R, undefined, 1> {
	throw new Error(";( to be implemented");
}

export function required<R extends Lazy<Shape>>(
	range: R, constraints?: PropertyConstrains
): Property<R, 1, 1> {
	throw new Error(";( to be implemented");
}


export function property<R extends Lazy<Shape>, const C extends PropertyBounds = {}>(
	range: R, constraints?: C
): Property<R, Stated<C, "minCount">, Stated<C, "maxCount">> {
	throw new Error(";( to be implemented");
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function Scheme() {
	return resource({

		id: id(),

		label: property(string()),

		hasTopConcept: property(reference(Concept))

	})
}

function Concept( ){
	return resource({

		id: id(),

		label: property(string()),

		inScheme: property(reference(Scheme))

	})
}
