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
import type { Dictionary, Reference } from "@metreeca/qest/resource";


export type Shape =
	| BooleanShape
	| NumberShape
	| StringShape
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

export type ResourceShape = {

	readonly kind: "resource"

	/**
	 * Shapes whose state extending resources are required to expose alongside their own.
	 *
	 * Entries may be deferred to break definition cycles.
	 */
	readonly extends: readonly Lazy<ResourceShape>[]

	/**
	 * Members the resource exposes in its own right.
	 */
	readonly members: Members

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


export type Id = {

	readonly kind: "id"

}

export type Type = { // !!! review Optional

	readonly kind: "type"

}

export type Property = {

	readonly kind: "property"

	/**
	 * Shape describing the values the property admits, possibly deferred to break definition cycles.
	 */
	readonly range: Lazy<Shape>

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the state a shape describes.
 *
 * Yields the value type instances of the shape expose, computed from the members the shape declares rather than
 * carried alongside it, so that the two cannot drift.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type State<S extends Lazy<Shape>> =
	Eager<S> extends BooleanShape ? boolean
		: Eager<S> extends NumberShape ? number
			: Eager<S> extends StringShape ? string
				: Eager<S> extends {
						readonly kind: "resource",
						readonly extends: infer I extends readonly Lazy<ResourceShape>[],
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
export type Inheritance<I extends readonly Lazy<ResourceShape>[]> =
	I extends readonly [infer H extends Lazy<ResourceShape>, ...infer T extends readonly Lazy<ResourceShape>[]]
		? State<H> & Inheritance<T>
		: unknown

export type Instance<M extends Members> = {

	readonly [field in keyof M]: Content<M[field]>

};

export type Content<M extends Member> =
	M extends Id ? Reference
		: M extends Type ? Optional<Reference>
			: M extends { readonly kind: "property", readonly range: infer R extends Lazy<Shape> } ? State<R>
				: never


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

export function dictionary() {}


export function reference() {}

export function resource<const I extends readonly Lazy<ResourceShape>[], const M extends Members>(
	...args: [...inheritance: I, members: M]
): { readonly kind: "resource", readonly extends: I, readonly members: M }

export function resource<const I extends readonly Lazy<ResourceShape>[], const M extends Members>(
	...args: [...inheritance: I, members: M, constraints: ResourceConstraints]
): { readonly kind: "resource", readonly extends: I, readonly members: M }

export function resource(...args: readonly unknown[]): ResourceShape {
	throw new Error(";( to be implemented");
}


export function id(): Id {
	throw new Error(";( to be implemented");
}

export function type(): Type {
	throw new Error(";( to be implemented");
}

export function property<const R extends Lazy<Shape>>(range: R): { readonly kind: "property", readonly range: R } {
	throw new Error(";( to be implemented");
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Mutually recursive definitions cycle through their values, so neither shape can be inferred from its own
// initializer: one explicit annotation per cycle breaks it. The annotation states the shape, never the state, which
// stays derived through State<>.

type SchemeShape={

	readonly kind: "resource",
	readonly extends: [],

	readonly members: {
		readonly id: Id,
		readonly label: { readonly kind: "property", readonly range: StringShape },
		readonly hasTopConcept: { readonly kind: "property", readonly range: () => ConceptShape }
	}

}

type ConceptShape={

	readonly kind: "resource",
	readonly extends: [],

	readonly members: {
		readonly id: Id,
		readonly label: { readonly kind: "property", readonly range: StringShape },
		readonly inScheme: { readonly kind: "property", readonly range: () => SchemeShape }
	}

}


const Scheme: SchemeShape=resource({

	id: id(),

	label: property(string()),

	hasTopConcept: property(() => Concept)

});

const Concept: ConceptShape=resource({

	id: id(),

	label: property(string()),

	inScheme: property(() => Scheme)

});


type SchemeState=State<typeof Scheme>;
type ConceptState=State<typeof Concept>;
