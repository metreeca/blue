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
import type { Reference, Resource } from "@metreeca/qest/resource";


export type Shape =
	| BooleanShape
	| NumberShape
	| StringShape
	| ResourceShape


export type BooleanShape<T extends boolean = boolean> = {

	readonly kind: "boolean"

}

export type NumberShape<T extends number = number> = {

	readonly kind: "number"

}

export type StringShape<T extends string = string> = {

	readonly kind: "string"

}

export type ResourceShape<T extends Resource = Resource> = {

	readonly kind: "resource"

}


export type Member =
	| Id
	| Type
	| Property

export type Members = {

	readonly [field: Identifier]: Member

}


export type Id<T extends Reference = Reference> = {

	readonly kind: "id"

}

export type Type<T extends Optional<Reference> = Optional<Reference>> = { // !!! review Optional

	readonly kind: "type"

}

export type Property<S extends Shape = Shape> = {

	readonly kind: "property"

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export type State<S extends Lazy<Shape>> =
	Eager<S> extends BooleanShape<infer T> ? Enumerated<T, boolean>
		: Eager<S> extends NumberShape<infer T> ? Enumerated<T, number>
			: Eager<S> extends StringShape<infer T> ? Enumerated<T, string>
				: Eager<S> extends ResourceShape<infer T> ? T
					: never

export type Instance<M extends Members> = {

	readonly [field in keyof M]: Content<M[field]>

};

export type Content<M extends Member> =
	M extends Id<infer T> ? T
		: M extends Type<infer T> ? T
			: M extends Property<infer R extends Shape> ? State<R>
				: never


/**
 * Resolves the value type an enumerable constraint admits.
 *
 * Yields the enumerated values where the enumeration is populated and the unconstrained base type where it is empty:
 * an empty `in` list states no constraint and must not narrow the values a shape accepts.
 *
 * @typeParam T The enumerated values
 * @typeParam B The base type admitted where no enumeration is stated
 */
export type Enumerated<T, B> =
	[T] extends [never] ? B : T


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function boolean<T extends boolean>(): BooleanShape<T> {
	throw new Error(";( to be implemented");
} // !!! infer T from {in}

export function number<T extends number>(): NumberShape<T> {
	throw new Error(";( to be implemented");
} // !!! infer T from {in}

export function string<T extends string>(): StringShape<T> {
	throw new Error(";( to be implemented");
} // !!! infer T from {in}

export function dictionary() {}


export function reference() {}

export function resource<M extends Members>(members: M): ResourceShape<Instance<M>> {
	throw new Error(";( to be implemented");
}


export function id<T extends Reference>(): Id<T> {
	throw new Error(";( to be implemented");
}

export function type<T extends Optional<Reference>>(): Type<T> {
	throw new Error(";( to be implemented");
}

export function property<R extends Shape>(range: R): Property<R> {
	throw new Error(";( to be implemented");
}
