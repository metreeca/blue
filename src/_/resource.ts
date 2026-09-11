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
 * Resource shape and factories.
 *
 * Defines {@link ResourceShape} and the factories declaring the structure a linked data resource is expected to
 * carry: {@link resource} for the shape itself, {@link id} and {@link type} for the members naming a resource,
 * {@link required}, {@link optional}, {@link nonempty} and {@link multiple} for the members carrying its values, and
 * {@link property} for the cardinalities those four do not name.
 *
 * > [!IMPORTANT]
 * > Resource shapes are **closed**: a validated resource carries only the members the shape declares, and any other
 * > field is rejected.
 *
 * > [!IMPORTANT]
 * > Every IRI a validated resource carries is absolute. Relative references are resolved against a base as client
 * > input is decoded, before validation sees them.
 *
 * **Defining Resource Shapes**
 *
 * Give each member a range and a cardinality:
 *
 * ```typescript
 * import { boolean } from '@metreeca/blue/boolean';
 * import { integer } from '@metreeca/blue/number';
 * import { id, nonempty, optional, required, resource } from '@metreeca/blue/resource';
 * import { string } from '@metreeca/blue/string';
 *
 * const Product = resource({
 *   id: id(),
 *   name: required(string({ minLength: 1 })),
 *   price: required(integer({ minInclusive: 0 })),
 *   available: optional(boolean()),
 *   tags: nonempty(string())
 * });
 * ```
 *
 * The four named cardinalities cover `1..1`, `0..1`, `1..*` and `0..*`; {@link property} states any other bounds:
 *
 * ```typescript
 * const Shape = resource({
 *   name: required(string()),                                // 1..1
 *   alias: optional(string()),                               // 0..1
 *   tags: nonempty(string()),                                // 1..*
 *   notes: multiple(string()),                               // 0..*
 *   codes: property(string(), { minCount: 2, maxCount: 5 })  // 2..5
 * });
 * ```
 *
 * Each factory takes, after the range, the constraints the member carries beyond its cardinality, such as the
 * predicate it maps to or the labels it carries:
 *
 * ```typescript
 * import { createNamespace } from '@metreeca/core/resource';
 *
 * const schema = createNamespace("http://schema.org/");
 *
 * const Person = resource({
 *   name: required(string(), { forward: schema })
 * });
 * ```
 *
 * **Linked and Embedded Resources**
 *
 * A member reaches another resource in one of two ways. A {@link reference!reference | reference} links a
 * **standalone** resource, identified and managed in its own right; a resource shape included directly describes an
 * **embedded** resource, carried inline with no identity of its own.
 *
 * ```typescript
 * import { reference } from '@metreeca/blue/reference';
 *
 * const Rating = resource({
 *   average: required(number({ minInclusive: 0, maxInclusive: 5 })),
 *   reviews: required(number({ minInclusive: 0 }))
 * });
 *
 * const Product = resource({
 *   id: id(),
 *   rating: optional(Rating),           // embedded
 *   vendor: required(reference(Vendor)) // standalone
 * });
 * ```
 *
 * An embedded resource carries no {@link id} member: having no identity of its own, an identifier is rejected as a
 * value is validated rather than as the shape is built, since an id-bearing embedded range reads exactly like an
 * expanded captive target until a value is matched against it.
 *
 * A shape reaching itself defers the range, breaking the definition cycle:
 *
 * ```typescript
 * function Category() {
 *   return resource({
 *     id: id(),
 *     name: required(string()),
 *     parent: optional(reference(Category))
 *   });
 * }
 * ```
 *
 * **Inheritance**
 *
 * A shape extends the ones it is given ahead of its members, carrying their members and constraints:
 *
 * ```typescript
 * const NamedEntity = resource({
 *   id: id(),
 *   name: required(string({ minLength: 1 }))
 * });
 *
 * const Employee = resource(NamedEntity, {
 *   department: required(string()),
 *   salary: required(integer({ minInclusive: 0 }))
 * });
 * ```
 *
 * > [!IMPORTANT]
 * > Constraints accumulate: a value is held to the constraints the extending shape states **and** to every one it
 * > inherits. An override tightens what it inherits and never relaxes it.
 *
 * A member reaching a resource is refined by re-pointing it at a shape extending the inherited target: the refinement
 * states what it adds alone, as the narrower target carries the inherited definition through its own parents. A
 * {@link union!union | union}-valued member is refined by dropping alternatives and tightening the ones it keeps,
 * never by adding new ones.
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/shacl/ SHACL - Shapes Constraint Language}
 * @see {@link https://www.w3.org/TR/shacl/#ClosedConstraintComponent SHACL § 4.8.1 sh:closed}
 */

import type { Identifier, Lazy, Optional } from "@metreeca/core";
import { createNamespace, type Namespace } from "@metreeca/core/resource";
import { TraceError } from "@metreeca/core/trace";
import type { Dictionary, Reference } from "@metreeca/qest/resource";
import type { Range, Shape } from "./index.js";
import { assemble, type Declared, declare } from "./resource.core.js";

export {
	getShapeClass,
	getShapeClasses,
	getShapeId,
	getShapeProperties,
	getShapeType
} from "./resource.core.js";


/**
 * Default space for resolving member names to predicate IRIs (`app:/#`).
 *
 * Stands in wherever a shape states no {@link ResourceConstraints.space | space} of its own and inherits none.
 */
export const defaultNamespace: Namespace = createNamespace("app:/#");


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Describes a linked data resource.
 *
 * Admits the [resources](https://www.w3.org/TR/rdf11-concepts/) a store holds: a record carrying the members the
 * shape declares, and nothing else, so that what a resource may state is fixed by the shape rather than left to
 * whoever writes it. A shape extends the shapes it lists as {@link parents}, carrying their members and constraints
 * on top of its own.
 *
 * **Inheritance**
 *
 * Where a shape extends the ones it lists as {@link parents}, they are merged according to the following rules. The
 * *child* is the extending shape; the *parent* is the inherited one.
 *
 * | Field         | Override Rule                                                                       |
 * | ------------- | ------------------------------------------------------------------------------------ |
 * | `kind`        | Cannot be overridden                                                                |
 * | `name`        | Always from the child; not inherited                                                |
 * | `description` | Always from the child; not inherited                                                |
 * | `space`       | Inherited; conflicting parents without a child override are reported as an error    |
 * | `class`       | Always from the child; outside inheritance scope                                    |
 * | `classes`     | Computed from the `class` of the shapes extended; never stated                      |
 * | `pattern`     | Only a trailing `/*` admits narrowing; any other case requires equality             |
 * | `in`          | Child may only drop allowed identifiers                                             |
 * | `hasValue`    | Child may only add required identifiers                                             |
 * | `members`     | Declared members merged over inherited ones, each narrowing the one it overrides     |
 *
 * **Cross-Field Validation**
 *
 * - all merged `hasValue` entries must be members of the merged `in` set (if defined)
 * - at most one `id` member and one `type` member, counted after inheritance
 * - no two members may share a forward predicate, nor two a reverse predicate
 *
 * @typeParam P The shapes extended, possibly deferred to break definition cycles
 * @typeParam M The members declared in the shape's own right
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.2 Node Shapes}
 */
export type ResourceShape<
	P extends Parents = Parents,
	M extends Members = Members
> = ResourceConstraints & {

	/**
	 * Discriminator identifying this as a resource shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "resource"


	/**
	 * The classes a resource belongs to on top of its own.
	 *
	 * Lists the {@link ResourceConstraints.class | class} every extended shape states, transitively and deduplicated,
	 * so that a caller may test a resource against a supertype without walking the inheritance chain itself. Each
	 * extended shape contributes the class it states, followed by the ones it inherits in turn, in the order the
	 * shapes are extended. A shape extending nothing that states a class is empty.
	 *
	 * **Inheritance** — computed from the `class` of the shapes extended; never stated.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#ClassConstraintComponent SHACL § 4.1.1 sh:class}
	 */
	readonly classes: readonly Reference[]

	/**
	 * The shapes extended, each possibly deferred to break definition cycles.
	 *
	 * Their members and constraints reach every resource this shape describes, so an extending shape states what it
	 * adds or tightens alone.
	 *
	 * **Inheritance** — states the shapes extended in the shape's own right, and is never itself inherited.
	 */
	readonly parents: P

	/**
	 * The members a resource carries.
	 *
	 * Stated merged: the members declared in the shape's own right over the ones the extended shapes contribute, so a
	 * caller reads what a resource carries off the shape rather than by walking the inheritance chain. The shape is
	 * closed, so a resource carrying anything else is rejected.
	 *
	 * **Inheritance** — declared members merged over inherited ones, each narrowing the one it overrides.
	 */
	readonly members: M

}

/**
 * Constraints accepted by the {@link resource} shape factory.
 *
 * States what a resource is called, where its members resolve their predicates, what class it belongs to and which
 * identifiers it may be named by; the members it carries are stated apart.
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.2 Node Shapes}
 */
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


/**
 * The shapes a resource shape extends.
 *
 * Retains the order the shapes were stated in, so that a member reaching the extending shape along several paths is
 * resolved against a stable sequence; order carries no priority, as every extended shape contributes.
 */
export type Parents =
	readonly Lazy<ResourceShape>[]

/**
 * The members a resource carries, keyed by the name each is stated under.
 *
 * The name doubles as the field a resource states the member under and as the term resolved against the shape's
 * {@link ResourceConstraints.space | space} where the member maps to no predicate of its own.
 */
export type Members = {

	readonly [field: Identifier]: Member

}

/**
 * A member a resource carries.
 *
 * Either of the two members naming a resource, {@link Id} and {@link Type}, or a {@link Property} carrying values of
 * its own.
 */
export type Member =
	| Id
	| Type
	| Property


/**
 * The member naming a resource.
 *
 * Carries the absolute IRI a resource is identified by, mapped to the JSON-LD `@id` keyword. A shape states at most
 * one, counted once inheritance has merged the members.
 *
 * @see {@link https://www.w3.org/TR/json-ld11/#node-identifiers JSON-LD 1.1 § 3.3 Node Identifiers}
 */
export type Id = {

	/**
	 * Discriminator identifying this as the member naming a resource.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "id"

}

/**
 * The member typing a resource.
 *
 * Carries the absolute IRI of the class a resource belongs to, mapped to the JSON-LD `@type` keyword. The value is
 * derived from the {@link ResourceConstraints.class | class} the shape states, so a shape stating none admits no
 * value for it. A shape states at most one, counted as {@link Id} is.
 *
 * @see {@link https://www.w3.org/TR/json-ld11/#specifying-the-type JSON-LD 1.1 § 3.5 Specifying the Type}
 */
export type Type = {

	/**
	 * Discriminator identifying this as the member typing a resource.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "type"

}


/**
 * A member carrying values of its own.
 *
 * States the shape its values are drawn from and how many of them a resource may carry, alongside the predicate the
 * values are stored under and the labels the member is presented by.
 *
 * **Inheritance**
 *
 * Where a shape extends the ones it lists as {@link ResourceShape.parents | parents}, members stated on both sides are
 * merged according to the following rules. The *child* is the extending shape; the *parent* is the inherited one.
 *
 * | Field         | Override Rule                                    |
 * | ------------- | ------------------------------------------------ |
 * | `kind`        | Cannot be overridden                             |
 * | `hidden`      | Inherited where the child states none            |
 * | `foreign`     | Cannot be overridden                             |
 * | `captive`     | Cannot be overridden                             |
 * | `name`        | Cannot be overridden                             |
 * | `description` | Cannot be overridden                             |
 * | `forward`     | Cannot be overridden                             |
 * | `reverse`     | Cannot be overridden                             |
 * | `minCount`    | Child ≥ parent, narrowing the lower bound        |
 * | `maxCount`    | Child ≤ parent, narrowing the upper bound        |
 * | `shape`       | Child narrows the range it overrides             |
 *
 * A bound left unstated leaves that end unbounded rather than unsaid, so a child stating none inherits the bound the
 * parent states.
 *
 * @typeParam R The shape the values are drawn from, possibly deferred to break definition cycles
 * @typeParam L The least number of values admitted
 * @typeParam U The greatest number of values admitted
 *
 * @see {@link https://www.w3.org/TR/shacl/#property-shapes SHACL § 2.3 Property Shapes}
 */
export type Property<
	R extends Lazy<Shape> = Lazy<Shape>,
	L extends Optional<number> = Optional<number>,
	U extends Optional<number> = Optional<number>
> = PropertyConstraints & Range<R, L, U> & {

	/**
	 * Discriminator identifying this as a member carrying values.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "property"

}

/**
 * Constraints accepted by the member factories.
 *
 * States how a member is stored, presented and owned, leaving its cardinality to the factory naming it and its
 * {@link PropertyBounds | bounds} to the general-purpose one.
 *
 * @see {@link https://www.w3.org/TR/shacl/#property-shapes SHACL § 2.3 Property Shapes}
 */
export type PropertyConstraints = {

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
export type PropertyBounds = PropertyConstraints & {

	/**
	 * Least number of values admitted.
	 *
	 * Left unstated, the member is unbounded below and a resource may leave it out.
	 *
	 * **Inheritance** — child value must be ≥ parent value, narrowing the lower bound.
	 *
	 * @defaultValue `undefined` (no lower bound)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinCountConstraintComponent SHACL § 4.2.1 sh:minCount}
	 */
	readonly minCount?: Optional<number>

	/**
	 * Greatest number of values admitted.
	 *
	 * Left unstated, the member is unbounded above and a resource states its values as an array.
	 *
	 * **Inheritance** — child value must be ≤ parent value, narrowing the upper bound.
	 *
	 * @defaultValue `undefined` (no upper bound)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxCountConstraintComponent SHACL § 4.2.2 sh:maxCount}
	 */
	readonly maxCount?: Optional<number>

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a resource shape.
 *
 * Extends the shapes given ahead of the members, carrying their members and constraints on top of the ones declared
 * here; a member redeclared over an inherited one narrows it. The shape is built merged, so that a caller reads the
 * members a resource carries off the shape itself rather than by walking the inheritance chain.
 *
 * @typeParam I The shapes extended, possibly deferred to break definition cycles
 * @typeParam M The members declared in the shape's own right
 *
 * @param args The shapes extended, the members declared, and optionally the shape
 *     {@link ResourceConstraints constraints}
 *
 * @returns An immutable shape admitting the resources the members and constraints bound
 *
 * @throws {TraceError} Where a member fails to narrow the one it overrides, the extended shapes disagree on an
 *     inherited constraint, or the merged shape states two identifiers, two types, or two members mapping to the same
 *     predicate
 */
export function resource<I extends Parents, M extends Members>(
	...args: [...inheritance: I, members: M]
): ResourceShape<I, M>

export function resource<I extends Parents, M extends Members>(
	...args: [...inheritance: I, members: M, constraints: ResourceConstraints]
): ResourceShape<I, M>

export function resource(...args: readonly unknown[]): ResourceShape {

	return assemble(args);

}


/**
 * Creates the member naming a resource.
 *
 * Marks the member it is declared under as carrying the resource's identifier, mapping it to the JSON-LD `@id`
 * keyword. A shape states at most one, counted once inheritance has merged the members: a marker reaching the shape
 * under one name through several parents, or redeclared over an inherited one, is a single member, while two markers
 * under distinct names are rejected.
 *
 * @returns An immutable member naming the resource
 *
 * @see {@link https://www.w3.org/TR/json-ld11/#node-identifiers JSON-LD 1.1 § 3.3 Node Identifiers}
 */
export function id(): Id {

	return declare({ kind: "id" });

}

/**
 * Creates the member typing a resource.
 *
 * Marks the member it is declared under as carrying the resource's class, mapping it to the JSON-LD `@type` keyword.
 * The value is derived from the {@link ResourceConstraints.class | class} the shape states, so the member is active
 * only on a shape stating one and a shape stating none rejects every value supplied for it: a shared supershape may
 * thus declare the member once for the shapes extending it, each activating it by stating a class of its own. A shape
 * states at most one, counted as {@link id} is.
 *
 * @returns An immutable member typing the resource
 *
 * @see {@link https://www.w3.org/TR/json-ld11/#specifying-the-type JSON-LD 1.1 § 3.5 Specifying the Type}
 */
export function type(): Type {

	return declare({ kind: "type" });

}


/**
 * Creates a member carrying any number of values.
 *
 * @typeParam R The shape the values are drawn from
 * @typeParam C The stated constraints
 *
 * @param range The shape the values are drawn from, possibly deferred to break definition cycles
 * @param constraints Optional member {@link PropertyConstraints constraints}
 *
 * @returns An immutable member admitting any number of values of `range`
 */
export function multiple<
	R extends Lazy<Shape>,
	const C extends PropertyConstraints = {}
>(
	range: R, constraints?: C
): C & Property<R, undefined, undefined> {

	return declare({ kind: "property", ...constraints, minCount: undefined, maxCount: undefined, shape: range });

}

/**
 * Creates a member carrying at least one value.
 *
 * @typeParam R The shape the values are drawn from
 * @typeParam C The stated constraints
 *
 * @param range The shape the values are drawn from, possibly deferred to break definition cycles
 * @param constraints Optional member {@link PropertyConstraints constraints}
 *
 * @returns An immutable member requiring at least one value of `range`
 */
export function nonempty<
	R extends Lazy<Shape>,
	const C extends PropertyConstraints = {}
>(
	range: R, constraints?: C
): C & Property<R, 1, undefined> {

	return declare({ kind: "property", ...constraints, minCount: 1, maxCount: undefined, shape: range });

}

/**
 * Creates a member carrying at most one value.
 *
 * @typeParam R The shape the value is drawn from
 * @typeParam C The stated constraints
 *
 * @param range The shape the value is drawn from, possibly deferred to break definition cycles
 * @param constraints Optional member {@link PropertyConstraints constraints}
 *
 * @returns An immutable member admitting at most one value of `range`
 */
export function optional<
	R extends Lazy<Shape>,
	const C extends PropertyConstraints = {}
>(
	range: R, constraints?: C
): C & Property<R, undefined, 1> {

	return declare({ kind: "property", ...constraints, minCount: undefined, maxCount: 1, shape: range });

}

/**
 * Creates a member carrying exactly one value.
 *
 * @typeParam R The shape the value is drawn from
 * @typeParam C The stated constraints
 *
 * @param range The shape the value is drawn from, possibly deferred to break definition cycles
 * @param constraints Optional member {@link PropertyConstraints constraints}
 *
 * @returns An immutable member requiring exactly one value of `range`
 */
export function required<
	R extends Lazy<Shape>,
	const C extends PropertyConstraints = {}
>(
	range: R, constraints?: C
): C & Property<R, 1, 1> {

	return declare({ kind: "property", ...constraints, minCount: 1, maxCount: 1, shape: range });

}


/**
 * Creates a member carrying a stated number of values.
 *
 * Reads the cardinality off the {@link PropertyBounds.minCount | minCount} and
 * {@link PropertyBounds.maxCount | maxCount} the constraints state, for the bounds the four named factories leave
 * uncovered; a bound left unstated leaves that end unbounded.
 *
 * @typeParam R The shape the values are drawn from
 * @typeParam C The stated constraints and cardinality bounds
 *
 * @param range The shape the values are drawn from, possibly deferred to break definition cycles
 * @param constraints Optional member {@link PropertyBounds constraints and bounds}
 *
 * @returns An immutable member admitting the stated number of values of `range`
 *
 * @example
 *
 * ```typescript
 * const Product = resource({
 *   tags: property(string(), { minCount: 2, maxCount: 5 })
 * });
 * ```
 */
export function property<
	R extends Lazy<Shape>,
	const C extends PropertyBounds = {}
>(
	range: R, constraints?: C
): C & Property<R, Declared<C, "minCount">, Declared<C, "maxCount">> {

	return declare({

		kind: "property",

		...constraints,

		minCount: constraints?.minCount,
		maxCount: constraints?.maxCount,

		shape: range

	});

}
