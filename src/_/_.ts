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
import type { Namespace } from "@metreeca/core/resource";
import type { Dictionary, Reference, Resource } from "@metreeca/qest/resource";


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

export type ResourceConstraints = {

	/**
	 * Human-readable name for the shape.
	 *
	 * Accepts a localised {@link Dictionary} or, as a shorthand for the English-only case, a plain
	 * {@link string!text | text} string, expanded to `{ en: <value> }` on the
	 * {@link ResourceShape.name | built shape}.
	 *
	 * **Inheritance** — always from child; not inherited.
	 *
	 * @remarks
	 *
	 * SHACL defines sh:name only for property shapes; extended here to node shapes.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 2.3.2.1 sh:name}
	 */
	readonly name?: string | Dictionary;

	/**
	 * Human-readable description of the shape.
	 *
	 * Accepts a localised {@link Dictionary} or, as a shorthand for the English-only case, a
	 * {@link string!markdown | Markdown} string, expanded to `{ en: <value> }` on the
	 * {@link ResourceShape.description | built shape}.
	 *
	 * **Inheritance** — always from child; not inherited.
	 *
	 * @remarks
	 *
	 * SHACL defines sh:description only for property shapes; extended here to node shapes.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 2.3.2.1 sh:description}
	 */
	readonly description?: string | Dictionary;


	/**
	 * Default namespace for converting property names to IRIs.
	 *
	 * Property names without explicit IRI mappings are resolved relative to this namespace.
	 *
	 * **Inheritance** — inherited from parent; conflicting parents without child override are reported as an error.
	 *
	 * @defaultValue {@link defaultNamespace}
	 */
	readonly namespace?: Namespace;

	/**
	 * Target class for resource instances.
	 *
	 * The absolute IRI identifying the primary class that resource instances must belong to. Shape-specific and not
	 * inherited. If defined, this value is exposed through the property mapped to `@type` using {@link type}.
	 *
	 * **Inheritance** — shape-specific target class; outside inheritance scope.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#targetClass SHACL § 2.1.3.2 sh:targetClass}
	 */
	readonly class?: Reference;


	/**
	 * IRI path pattern that resource {@link Id identifiers} must match.
	 *
	 * Patterns are IRI-like templates using `{name}` placeholders for single path segments and `/*` for trailing
	 * wildcards. Patterns may be absolute or root-relative; root-relative patterns match absolute IRIs, ignoring the
	 * origin.
	 *
	 * **Inheritance** — only the trailing `/*` wildcard admits narrowing: a child may replace `/*` with more specific
	 * segments (for example, `/products/*` to `/products/{id}/reviews/{rid}`), provided the fixed prefix matches.
	 * All other cases require exact equality; a mismatch is reported as an error.
	 *
	 * @defaultValue `undefined` (no pattern constraint)
	 *
	 * @example
	 * ```
	 * https://example.org/products/{sku}  → https://example.org/products/ABC-456
	 * https://example.org/categories/*    → https://example.org/categories/electronics/phones
	 *
	 * /employees/{id}                     → https://example.org/employees/123
	 * /departments/*                      → https://example.org/departments/sales/emea
	 * ```
	 */
	readonly pattern?: string;

	/**
	 * Allowed resource {@link Id identifiers} (closed enumeration).
	 *
	 * When specified, resource identifiers must be members of this list. IRIs must be absolute. Empty arrays are
	 * ignored.
	 *
	 * **Inheritance** — intersection of parent and child sets; empty result is reported as an error.
	 *
	 * @defaultValue `undefined` (no enumeration constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#InConstraintComponent SHACL § 4.8.3 sh:in}
	 */
	readonly in?: readonly Reference[];

	/**
	 * Required resource {@link Id identifiers} that must be present.
	 *
	 * When specified, all listed resource identifiers must appear. IRIs must be absolute. Empty arrays are ignored.
	 *
	 * **Inheritance** — union of parent and child required values; child must require all parent values.
	 *
	 * @defaultValue `undefined` (no required values)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#HasValueConstraintComponent SHACL § 4.8.2 sh:hasValue}
	 */
	readonly hasValue?: readonly Reference[];

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

export type Property<S extends Lazy<Shape> = Lazy<Shape>> = {

	readonly kind: "property"

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export type State<S extends Lazy<Shape>> =
	Eager<S> extends BooleanShape<infer T> ? Enumerated<T, boolean>
		: Eager<S> extends NumberShape<infer T> ? Enumerated<T, number>
			: Eager<S> extends StringShape<infer T> ? Enumerated<T, string>
				: Eager<S> extends ResourceShape<infer T> ? T
					: never

/**
 * Resolves the state contributed by a list of extended shapes.
 *
 * Yields the intersection of the states the extended shapes describe, that is the inherited members an extending
 * resource is required to expose alongside its own.
 *
 * @typeParam I The extended shapes, possibly deferred to break definition cycles
 */
export type Inheritance<I extends readonly Lazy<ResourceShape>[]> =
	I extends readonly [infer H extends Lazy<ResourceShape>, ...infer T extends readonly Lazy<ResourceShape>[]]
		? State<H> & Inheritance<T>
		: unknown

export type Instance<M extends Members> = {

	readonly [field in keyof M]: Content<M[field]>

};

export type Content<M extends Member> =
	M extends Id<infer T> ? T
		: M extends Type<infer T> ? T
			: M extends Property<infer R extends Lazy<Shape>> ? State<R>
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

export function resource<I extends readonly Lazy<ResourceShape>[], M extends Members>(
	...args: [...inheritance: I, members: M]
): ResourceShape<Inheritance<I> & Instance<M>>

export function resource<I extends readonly Lazy<ResourceShape>[], M extends Members>(
	...args: [...inheritance: I, members: M, constraints: ResourceConstraints]
): ResourceShape<Inheritance<I> & Instance<M>>

export function resource(...args: readonly unknown[]): ResourceShape {
	throw new Error(";( to be implemented");
}


export function id<T extends Reference>(): Id<T> {
	throw new Error(";( to be implemented");
}

export function type<T extends Optional<Reference>>(): Type<T> {
	throw new Error(";( to be implemented");
}

export function property<R extends Lazy<Shape>>(range: R): Property<R> {
	throw new Error(";( to be implemented");
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

type SchemeState={

	readonly id: Reference,
	readonly label: string,
	readonly hasTopConcept: ConceptState

}

type ConceptState={

	readonly id: Reference,
	readonly label: string,
	readonly inScheme: SchemeState

}


const Scheme: ResourceShape<SchemeState>=resource({

	id: id(),

	label: property(string()),

	hasTopConcept: property(() => Concept)

});

const Concept=resource({

	id: id(),

	label: property(string()),

	inScheme: property(() => Scheme)

});
