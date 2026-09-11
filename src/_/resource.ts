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

import type { Identifier, Lazy, Optional } from "@metreeca/core";
import type { Namespace } from "@metreeca/core/resource";
import type { Dictionary, Reference } from "@metreeca/qest/resource";
import type { Range, Shape } from "./index.js";
import type { Declared } from "./resource.core.js";


export type ResourceShape<P extends Parents = Parents, M extends Members = Members> = ResourceConstraints & {

	readonly kind: "resource"


	readonly parents: P

	readonly members: M

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
	 * Default space for converting property names to IRIs.
	 *
	 * Property names without explicit IRI mappings are resolved relative to this space.
	 *
	 * **Inheritance** — inherited from parent; conflicting parents without child override are reported as an error.
	 *
	 * @defaultValue {@link defaultNamespace}
	 */
	readonly space?: Namespace;

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


export type Members = {

	readonly [field: Identifier]: Member

}

export type Member =
	| Id
	| Type
	| Property


export type Id = {

	readonly kind: "id"

}

export type Type = {

	readonly kind: "type"

}

export type Property<
	R extends Lazy<Shape> = Lazy<Shape>,
	L extends Optional<number> = Optional<number>,
	U extends Optional<number> = Optional<number>
> = PropertyConstrains & Range<R, L, U> & {

	readonly kind: "property"

}

export type PropertyConstrains = {

	/**
	 * Excludes the property from default serialisation.
	 *
	 * **Inheritance** — inherited from parent; conflicting parents without child override are reported as an error.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly hidden?: boolean;

	/**
	 * Marks the property as owned by the resources in its range.
	 *
	 * A foreign property is read-only for the resource declaring it: retrieval templates may select it, but state
	 * validation rejects it when submitted, because the link is written by the resources it points at rather than by
	 * the one exposing it.
	 *
	 * > [!IMPORTANT]
	 * > A foreign property is independent from a {@link reverse} mapping. A `reverse` mapping writes an actual inverse
	 * > mapping; `foreign` exposes a read-only view over mappings another property owns and writes nothing on insert.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly foreign?: boolean;

	/**
	 * Marks the resources in the property range as unable to outlive the resource declaring it.
	 *
	 * A captive resource keeps an identity and a lifecycle of its own and may be created, updated and deleted on its
	 * own. It stays existentially dependent on the resource declaring the property, though, and is cascade-removed
	 * when that resource is deleted.
	 *
	 * > [!IMPORTANT]
	 * > Captivity is independent from embedding. An embedded resource has no identity or lifecycle of its own (an `id`
	 * > is rejected during state validation) and is always managed as part of the resource containing it; a captive
	 * > resource has both and may be managed on its own, but does not survive the resource declaring the property.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly captive?: boolean;


	/**
	 * Human-readable name for the property.
	 *
	 * Accepts a localised {@link Dictionary} or, as a shorthand for the English-only case, a plain
	 * {@link string!text | text} string, expanded to `{ en: <value> }` on the
	 * {@link Property.name | resolved property}.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (no label)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 2.3.2.1 sh:name}
	 */
	readonly name?: string | Dictionary;

	/**
	 * Human-readable description of the property.
	 *
	 * Accepts a localised {@link Dictionary} or, as a shorthand for the English-only case, a
	 * {@link string!markdown | Markdown} string, expanded to `{ en: <value> }` on the
	 * {@link Property.description | resolved property}.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (no description)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 2.3.2.1 sh:description}
	 */
	readonly description?: string | Dictionary;


	/**
	 * The absolute IRI identifying the property for direct mapping.
	 *
	 * Accepts either an absolute IRI string or a {@link Namespace} function that resolves the property name to an
	 * absolute IRI (for instance, `{ forward: schema }` on property `name` yields `http://schema.org/name`).
	 *
	 * > [!IMPORTANT]
	 * > Both `forward` and {@link reverse} mappings write actual property values. This is independent from
	 * > {@link foreign}, which exposes a read-only view over mappings another property owns.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @see {@link https://www.w3.org/TR/json-ld11/#iris JSON-LD 1.1 § 3.2 IRIs}
	 */
	readonly forward?: Reference | Namespace;

	/**
	 * The absolute IRI identifying the property for inverse mapping.
	 *
	 * Accepts either an absolute IRI string or a {@link Namespace} function that resolves the property name to an
	 * absolute IRI (for instance, `{ reverse: schema }` on property `employee` yields `http://schema.org/employee`).
	 *
	 * > [!IMPORTANT]
	 * > Both {@link forward} and `reverse` mappings write actual property values. This is independent from
	 * > {@link foreign}, which exposes a read-only view over mappings another property owns.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (no inverse mapping)
	 *
	 * @see {@link https://www.w3.org/TR/json-ld11/#reverse-properties JSON-LD 1.1 § 4.8 Reverse Properties}
	 */
	readonly reverse?: Reference | Namespace;

}

/**
 * Property constraints admitting explicit cardinality bounds.
 *
 * Accepted by {@link property} for bounds beyond the four the cardinality factories name.
 */
export type PropertyBounds = PropertyConstrains & {

	readonly minCount?: Optional<number>
	readonly maxCount?: Optional<number>

}


export type Parents =
	readonly Lazy<ResourceShape>[]


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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


export function multiple<R extends Lazy<Shape>, const C extends PropertyConstrains = {}>(
	range: R, constraints?: C
): C & Property<R, undefined, undefined> {

	throw new Error(";( to be implemented");

}

export function nonempty<R extends Lazy<Shape>, const C extends PropertyConstrains = {}>(
	range: R, constraints?: C
): C & Property<R, 1, undefined> {

	throw new Error(";( to be implemented");

}

export function optional<R extends Lazy<Shape>, const C extends PropertyConstrains = {}>(
	range: R, constraints?: C
): C & Property<R, undefined, 1> {

	throw new Error(";( to be implemented");

}

export function required<R extends Lazy<Shape>, const C extends PropertyConstrains = {}>(
	range: R, constraints?: C
): C & Property<R, 1, 1> {

	throw new Error(";( to be implemented");

}


export function property<R extends Lazy<Shape>, const C extends PropertyBounds = {}>(
	range: R, constraints?: C
): C & Property<R, Declared<C, "minCount">, Declared<C, "maxCount">> {

	throw new Error(";( to be implemented");

}
