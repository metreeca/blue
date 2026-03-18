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
 * Resource shape model and factories.
 *
 * Provides shapes for validating linked data resources with property definitions, cardinality constraints, and
 * inheritance. Resource shapes define the expected structure of linked data resources using a SHACL-based model with
 * compile-time type inference.
 *
 * > [!IMPORTANT]
 * > Resource shapes are **closed**: validated resources may only contain properties explicitly defined in the shape.
 * > Any additional properties will cause validation to fail.
 *
 * > [!IMPORTANT]
 * > All IRI values in validated resources must be absolute. When decoding client input, relative references may be
 * > auto‑resolved using the `base` option in
 * > [decodeResource](https://metreeca.github.io/qest/functions/state.decodeResource.html) or
 * > [decodeQuery](https://metreeca.github.io/qest/functions/query.decodeQuery.html).
 *
 * **Defining Resource Shapes**
 *
 * Combine property definitions with value ranges to define resource structures:
 *
 * ```typescript
 * import { resource, id, required, optional, repeatable } from '@metreeca/blue';
 * import { string, integer, boolean, reference } from '@metreeca/blue';
 *
 * const Product = resource({
 *   id: id(),
 *   name: required(string({ minLength: 1 })),
 *   price: required(integer({ minInclusive: 0 })),
 *   available: optional(boolean()),
 *   tags: repeatable(string())
 * });
 * ```
 *
 * **Properties and Ranges**
 *
 * Ranges define cardinality constraints for property values:
 *
 * ```typescript
 * import { resource, property, required, optional, multiple, repeatable, cardinality } from '@metreeca/blue';
 * import { string } from '@metreeca/blue';
 *
 * const Shape = resource({
 *   name: required(string()),           // 1..1
 *   alias: optional(string()),          // 0..1
 *   tags: repeatable(string()),         // 1..*
 *   notes: multiple(string()),          // 0..*
 *   codes: cardinality(2, 5)(string())  // 2..5
 * });
 * ```
 *
 * Naked ranges are automatically wrapped in a {@link property}; use explicit {@link property} when IRI mappings
 * or labels are needed:
 *
 * ```typescript
 * import { resource, property, required, string } from '@metreeca/blue';
 * import { createNamespace } from '@metreeca/core/resource';
 *
 * const schema = createNamespace("http://schema.org/");
 *
 * const Person = resource({
 *   name: property({ forward: schema }, required(string()))
 * });
 * ```
 *
 * **Resource References and Embedding**
 *
 * Resource properties link to other resources in two ways. A {@link reference} wrapper links to a **standalone
 * resource** — an independently identified and managed entity. A direct shape inclusion defines an **embedded
 * resource** — a nested object with no independent identity, created and managed together with its parent.
 *
 * > [!NOTE]
 * > In state validation, embedded resources are always validated as complete states.
 *
 * ```typescript
 * import { resource, id, required, optional, reference } from '@metreeca/blue';
 * import { string, number } from '@metreeca/blue';
 *
 * const Rating = resource({
 *   average: required(number({ minInclusive: 0, maxInclusive: 5 })),
 *   reviews: required(number({ minInclusive: 0 }))
 * });
 *
 * const Vendor = resource({
 *   id: id(),
 *   name: required(string())
 * });
 *
 * const Product = resource({
 *   id: id(),
 *   name: required(string()),
 *   rating: optional(Rating),            // embedded
 *   vendor: required(reference(Vendor)) // standalone
 * });
 * ```
 *
 * Use {@link foreign} for reverse links managed by the target resource. Foreign references are read-only from the
 * source resource perspective: included in responses but rejected in state updates.
 *
 * Self-referential shapes use lazy factories:
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
 * Extend parent shapes to inherit properties and constraints:
 *
 * ```typescript
 * import { resource, id, required, string, integer, reference } from '@metreeca/blue';
 *
 * const NamedEntity = resource({
 *   id: id(),
 *   name: required(string({ minLength: 1 }))
 * });
 *
 * const Employee = resource({
 *
 *   extends: NamedEntity
 *
 *  }, {
 *   department: required(string()),
 *   salary: required(integer({ minInclusive: 0 }))
 * });
 * ```
 *
 * > [!IMPORTANT]
 * > Constraints are enforced **conjunctively**: when a child shape overrides an inherited property, values must satisfy
 * > both the child's constraints and all inherited constraints. Overrides can restrict inherited constraints but never
 * > relax them.
 *
 * > [!WARNING]
 * > Constraints that can be expressed in the type system — such as non-empty set requirements on `in`, `hasValue`,
 * > `languageIn`, and `validators` — are enforced at compile time and not re-validated at runtime.
 *
 * **Polymorphic Properties**
 *
 * Use {@link union} for properties accepting multiple value types. Unions are pure type discriminators — cardinality
 * constraints belong on the enclosing {@link Range}, not on individual variants. At runtime, union values are
 * represented as `Indexed` records mapping variant names to their values, corresponding
 * to JSON-LD [indexed containers](https://www.w3.org/TR/json-ld11/#data-indexing) (`@container: @index`):
 *
 * ```typescript
 * import { resource, property, union, optional, reference, string } from '@metreeca/blue';
 *
 * const PostalAddress = resource({
 *   street: required(string()),
 *   city: required(string())
 * });
 *
 * const Contact = resource({
 *   address: optional(union({
 *     text: string(),
 *     PostalAddress: reference(PostalAddress)
 *   }))
 * });
 * ```
 *
 * Variant keys act as discriminators in runtime values:
 *
 * ```json
 * {
 *   "address": {
 *     "text": "123 Main St"
 *   }
 * }
 *
 * {
 *   "address": {
 *     "PostalAddress": {
 *       "id": "https://data.example.com/addresses/456",
 *       "streetAddress": "12 Harbour Street",
 *       "addressLocality": "Copenhagen"
 *     }
 *   }
 * }
 * ```
 *
 * @module
 *
 *
 * @see {@link https://www.w3.org/TR/shacl/ SHACL - Shapes Constraint Language}
 * @see {@link https://www.w3.org/TR/shacl/#ClosedConstraintComponent SHACL § 4.8.1 sh:closed}
 */

import { type Identifier, isFunction, isString, type Lazy } from "@metreeca/core";
import { immutable } from "@metreeca/core/nested";
import { asIRI, createNamespace, type IRI, type Namespace } from "@metreeca/core/resource";
import type { Local, Reference, Resource, Value } from "@metreeca/qest/state";
import { materialize } from "./core/cache.js";
import { TraceError } from "./core/trace.js";
import type { Validator, ValueShape } from "./index.js";
import { checkSingletons, flatten } from "./resource.core.js";


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Default application namespace for property IRI resolution (`app:/#`).
 *
 * @see {@link ResourceShape.namespace}
 */
export const defaultNamespace: Namespace = createNamespace("app:/#");


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Shape definition for resource references.
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link ResourceConstraints.extends | extends}, reference-valued
 * properties are merged according to the following rules. The *child* is the extending shape; the *parent* is the
 * inherited shape.
 *
 * | Field      | Override Rule                                                             |
 * | ---------- | ------------------------------------------------------------------------ |
 * | `kind`     | Cannot be overridden                                                     |
 * | `model`    | Must be strictly equal — mismatch signals incompatible shapes            |
 * | `foreign`  | Cannot be overridden                                                     |
 * | `shape`    | Cannot be overridden                                                     |
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.3.1 Node Shapes}
 */
export interface ReferenceShape {

	/**
	 * Discriminator identifying this as a reference shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "reference";

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * **Inheritance** — must be strictly equal between parent and child.
	 *
	 * @defaultValue `"app:/"`
	 */
	readonly model: Reference;


	/**
	 * Marks the reference as a reverse link managed by the target resource.
	 *
	 * Foreign references are read-only from the source resource perspective: included in responses but rejected in
	 * state updates. The forward link is owned by the target resource, not by the source resource declaring the
	 * foreign reference.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly foreign?: boolean;

	/**
	 * Target {@link ResourceShape resource shape} for the referenced resource.
	 *
	 * Accepts a lazy value to support circular and self-referential definitions.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly shape: Lazy<ResourceShape>;

}


/**
 * Shape definition for linked data resources.
 *
 * Validates linked data resources with structural constraints including inheritance, property definitions, and
 * SHACL-aligned validation rules. Resource shapes define the expected structure of linked data resources and support
 * type inference for property values.
 *
 * > [!IMPORTANT]
 * > Resource shapes are **closed**: validated resources may only contain properties explicitly defined in the shape.
 * > Any additional properties will cause validation to fail.
 *
 * **Inheritance**
 *
 * When a resource shape extends a parent via {@link ResourceConstraints.extends | extends}, fields are merged
 * according to the following rules. The *child* is the extending shape; the *parent* is the inherited shape.
 *
 * | Field        | Override Rule                                                                          |
 * | ------------ | ------------------------------------------------------------------------------------- |
 * | `kind`       | Cannot be overridden                                                                  |
 * | `model`      | Computed from properties, not user-defined                                            |
 * | `virtual`    | Inherited; conflicting parents without child override are reported as an error          |
 * | `name`       | Cannot be overridden                                                                  |
 * | `description`| Cannot be overridden                                                                  |
 * | `namespace`  | Inherited; conflicting parents without child override are reported as an error          |
 * | `extends`    | Structural; outside inheritance scope                                                  |
 * | `class`      | Shape-specific target class; outside inheritance scope                                 |
 * | `classes`    | Union of parent `class` and child/parent `classes`                                       |
 * | `pattern`    | Child may replace trailing `/*` wildcard with more specific segments                    |
 * | `in`         | Intersection of parent and child sets; empty result is reported as an error       |
 * | `hasValue`   | Union of parent and child required values; child must require all parent values  |
 * | `validators` | Union of parent and child validators; all apply                                        |
 * | `properties` | Union; clashing keys merged per property rules; `kind` mismatch is reported as an error|
 *
 * **Cross-Field Validation**
 *
 * - all merged `hasValue` entries must be members of the merged `in` set (if defined)
 * - `forward` predicate IRIs must be unique across all properties
 * - `reverse` predicate IRIs must be unique across all properties
 * - `forward` and `reverse` are independent sets: the same IRI may appear in both
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.3.1 Node Shapes}
 * @see {@link https://www.w3.org/TR/shacl/#ClosedConstraintComponent SHACL § 4.8.1 sh:closed}
 */
export interface ResourceShape extends ResourceConstraints {

	/**
	 * Discriminator identifying this as a resource shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "resource";

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * Provides an immutable model of the expected TypeScript type for resources matching this shape. When a shape
	 * extends parent shapes, inherited properties are merged into the model; local definitions override inherited ones.
	 *
	 * **Inheritance** — computed from properties, not user-defined.
	 */
	readonly model: Resource;


	/**
	 * Custom resource validators.
	 *
	 * When specified, all validators are applied during validation. Must be non-empty.
	 *
	 * **Inheritance** — parent and child validators are merged; all apply.
	 *
	 * @remarks
	 *
	 * SHACL defines custom constraints via SPARQL; this library uses programmatic validators.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#constraint-components-overview SHACL § 3 Constraint Components}
	 */
	readonly validators?: readonly [Validator<Resource>, ...Validator<Resource>[]];

	/**
	 * Property shapes defining the expected structure.
	 *
	 * At most one {@link Id} and one {@link Type} entry are allowed.
	 *
	 * **Inheritance** — parent and child properties are merged; clashing keys are merged per property rules.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#property-shapes SHACL § 2.3.2 Property Shapes}
	 */
	readonly properties: { readonly [property: Identifier]: Id | Type | Property };

}

/**
 * Constraints for resource shape factories.
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.3.1 Node Shapes}
 */
export interface ResourceConstraints {

	/**
	 * Marks the resource as dynamically generated.
	 *
	 * When `true`, indicates the resource is at least partially computed rather than stored.
	 *
	 * **Inheritance** — inherited from parent; conflicting parents without child override are reported as an error.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly virtual?: boolean;


	/**
	 * Human-readable name for the shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @remarks
	 *
	 * SHACL defines sh:name only for property shapes; extended here to node shapes.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 6.1.1 sh:name}
	 */
	readonly name?: Local;

	/**
	 * Human-readable description of the shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @remarks
	 *
	 * SHACL defines sh:description only for property shapes; extended here to node shapes.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 6.1.2 sh:description}
	 */
	readonly description?: Local;


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
	 * Parent shape(s) this shape inherits from.
	 *
	 * Inherited properties and constraints are merged into the derived shape. When a child overrides an inherited
	 * property, constraints are enforced conjunctively: values must satisfy both the child's and all inherited
	 * constraints. This ensures overrides can only restrict, never relax, inherited definitions.
	 *
	 * > [!WARNING]
	 * > When inheriting from multiple shapes with different {@link namespace} values, an overriding namespace must be
	 * > declared in this shape.
	 *
	 * **Inheritance** — structural; outside inheritance scope.
	 */
	readonly extends?: Lazy<ResourceShape> | readonly [Lazy<ResourceShape>, ...Lazy<ResourceShape>[]];


	/**
	 * Target class for resource instances.
	 *
	 * The absolute IRI identifying the primary class that resource instances must belong to. Shape-specific and not
	 * inherited. If defined, this value is exposed through the property mapped to `@type` using {@link type}.
	 *
	 * **Inheritance** — shape-specific target class; outside inheritance scope.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#targetClass SHACL § 2.1.1 sh:targetClass}
	 */
	readonly class?: IRI;

	/**
	 * Ancillary class constraints for resource instances.
	 *
	 * Additional class IRIs that resource instances must conform to. Must be non-empty.
	 *
	 * **Inheritance** — union of parent `class` and child/parent `classes`.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#ClassConstraintComponent SHACL § 4.2.1 sh:class}
	 */
	readonly classes?: readonly [IRI, ...IRI[]];


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
	 * When specified, resource identifiers must be members of this list. IRIs must be absolute. Must be non-empty.
	 *
	 * **Inheritance** — intersection of parent and child sets; empty result is reported as an error.
	 *
	 * @defaultValue `undefined` (no enumeration constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#InConstraintComponent SHACL § 4.5.1 sh:in}
	 */
	readonly in?: readonly [IRI, ...IRI[]];

	/**
	 * Required resource {@link Id identifiers} that must be present.
	 *
	 * When specified, all listed resource identifiers must appear. IRIs must be absolute. Must be non-empty.
	 *
	 * **Inheritance** — union of parent and child required values; child must require all parent values.
	 *
	 * @defaultValue `undefined` (no required values)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#HasValueConstraintComponent SHACL § 4.5.2 sh:hasValue}
	 */
	readonly hasValue?: readonly [IRI, ...IRI[]];

}


/**
 * Shape definition for the resource identifier property.
 *
 * Tags a resource property as mapping to JSON-LD `@id`. Created by the {@link id} factory. At most one per
 * resource shape.
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link ResourceConstraints.extends | extends}, identifier
 * properties are subject to the following rules.
 *
 * | Field    | Override Rule                                                        |
 * | -------- | ------------------------------------------------------------------- |
 * | `kind`   | Cannot be overridden                                                |
 * | `hidden` | At most one per inheritance hierarchy; conflicts cannot arise       |
 *
 * At most one `id` entry is allowed per inheritance hierarchy.
 *
 * @see {@link https://www.w3.org/TR/json-ld11/#node-identifiers JSON-LD 1.1 § 3.3 Node Identifiers}
 */
export interface Id {

	/**
	 * Discriminator identifying this as a resource identifier property.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "id";

	/**
	 * Excludes the property from default serialisation.
	 *
	 * **Inheritance** — inherited from the single entry in the hierarchy.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly hidden?: boolean;

}

/**
 * Shape definition for the resource type property.
 *
 * Tags a resource property as mapping to JSON-LD `@type`. Created by the {@link type} factory. At most one per
 * resource shape.
 *
 * > [!WARNING]
 * > This property is system-managed: its value is derived from the {@link ResourceConstraints.class | class}
 * > constraint defined in the shape. Client-supplied values, for instance in state updates, are silently ignored.
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link ResourceConstraints.extends | extends}, type
 * properties are subject to the following rules.
 *
 * | Field    | Override Rule                                                        |
 * | -------- | ------------------------------------------------------------------- |
 * | `kind`   | Cannot be overridden                                                |
 * | `hidden` | At most one per inheritance hierarchy; conflicts cannot arise       |
 *
 * At most one `type` entry is allowed per inheritance hierarchy.
 *
 * @see {@link https://www.w3.org/TR/json-ld11/#specifying-the-type JSON-LD 1.1 § 3.5 Specifying the Type}
 */
export interface Type {

	/**
	 * Discriminator identifying this as a resource type property.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "type";

	/**
	 * Excludes the property from default serialisation.
	 *
	 * **Inheritance** — inherited from the single entry in the hierarchy.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly hidden?: boolean;

}

/**
 * Shape definition for a resource property.
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link ResourceConstraints.extends | extends}, properties
 * with matching keys are merged according to the following rules.
 *
 * | Field         | Override Rule                                                                          |
 * | ------------- | ------------------------------------------------------------------------------------- |
 * | `kind`        | Cannot be overridden                                                                  |
 * | `range`       | Delegated to {@link Range} merge rules                                                |
 * | `hidden`      | Inherited; conflicting parents without child override are reported as an error         |
 * | `computed`    | Inherited; conflicting parents without child override are reported as an error         |
 * | `name`        | Cannot be overridden                                                                  |
 * | `description` | Cannot be overridden                                                                  |
 * | `forward`     | Cannot be overridden                                                                  |
 * | `reverse`     | Cannot be overridden                                                                  |
 *
 * @typeParam P The predicate type for IRI mappings, defaulting to resolved {@link Reference}
 * @typeParam R The value {@link Range} type, defaulting to unconstrained
 *
 * @see {@link https://www.w3.org/TR/shacl/#property-shapes SHACL § 2.3.2 Property Shapes}
 */
export interface Property<P extends Predicate = Reference, R extends Range = Range> extends PropertyConstraints<P> {

	/**
	 * Discriminator identifying this as a property shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "property";


	/**
	 * Value range for this property.
	 *
	 * **Inheritance** — delegated to {@link Range} merge rules.
	 */
	readonly range: R;

}

/**
 * Constraints for property shape factories.
 *
 * When neither {@link forward} nor {@link reverse} is explicitly defined, a default forward IRI is generated by
 * resolving the property name against the effective namespace, determined in this order:
 *
 * 1. The shape's own {@link ResourceConstraints.namespace}
 * 2. The common inherited namespace from parent shapes
 * 3. The default {@link defaultNamespace} namespace
 *
 * @typeParam P The predicate type for IRI mappings, defaulting to resolved {@link Reference}
 *
 * @see {@link https://www.w3.org/TR/shacl/#property-shapes SHACL § 2.3.2 Property Shapes}
 */
export interface PropertyConstraints<P extends Predicate = Reference> {

	/**
	 * Excludes the property from default serialisation.
	 *
	 * **Inheritance** — inherited from parent; conflicting parents without child override are reported as an error.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly hidden?: boolean;

	/**
	 * Marks the property as system-managed.
	 *
	 * > [!IMPORTANT]
	 * > Computed properties are populated by the system and may be silently overwritten on mutation operations.
	 * > Client-supplied values must still be present in mutation payloads but carry no guarantees of being preserved.
	 *
	 * **Inheritance** — inherited from parent; conflicting parents without child override are reported as an error.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly computed?: boolean;


	/**
	 * Human-readable name for the property.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (no label)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 6.1.1 sh:name}
	 */
	readonly name?: Local;

	/**
	 * Human-readable description of the property.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (no description)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 6.1.2 sh:description}
	 */
	readonly description?: Local;


	/**
	 * The absolute IRI identifying the property for direct mapping.
	 *
	 * Accepts either an absolute IRI string or a {@link Namespace} function that resolves the property name to an
	 * absolute IRI (for instance, `{ forward: schema }` on property `name` yields `http://schema.org/name`).
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @see {@link https://www.w3.org/TR/json-ld11/#iris JSON-LD 1.1 § 3.2 IRIs}
	 */
	readonly forward?: P;

	/**
	 * The absolute IRI identifying the property for inverse mapping.
	 *
	 * Accepts either an absolute IRI string or a {@link Namespace} function that resolves the property name to an
	 * absolute IRI (for instance, `{ reverse: schema }` on property `employee` yields `http://schema.org/employee`).
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (no inverse mapping)
	 *
	 * @see {@link https://www.w3.org/TR/json-ld11/#reverse-properties JSON-LD 1.1 § 4.8 Reverse Properties}
	 */
	readonly reverse?: P;

}


/**
 * Predicate type for property IRI mappings.
 *
 * Accepts either a resolved absolute IRI ({@link Reference}) or a {@link Namespace} function that resolves property
 * names to absolute IRIs. Namespace predicates are resolved to concrete IRIs by the {@link resource} factory.
 */
export type Predicate =
	| Reference
	| Namespace;

/**
 * Shape for a set of values linked from a resource by a property.
 *
 * Combines a value shape with cardinality constraints to define how many values of a given type
 * a property may have.
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link ResourceConstraints.extends | extends}, each
 * property's range is merged according to the following rules.
 *
 * | Field      | Override Rule                                                                     |
 * | ---------- | ------------------------------------------------------------------------------- |
 * | `kind`     | Cannot be overridden                                                              |
 * | `minCount` | Child ≥ parent, narrowing the minimum cardinality                                |
 * | `maxCount` | Child ≤ parent, narrowing the maximum cardinality                                |
 * | `shape`    | `kind` must match; delegated to value shape or {@link UnionShape} merge rules    |
 *
 * **Cross-Field Validation**
 *
 * - merged `minCount` must be ≤ merged `maxCount`
 *
 * @typeParam T The type for all values in the linked set
 * @typeParam L The minimum count constraint type
 * @typeParam U The maximum count constraint type
 *
 * @see {@link https://www.w3.org/TR/shacl/#property-shapes SHACL § 2.3.2 Property Shapes}
 */
export interface Range<
	T = unknown,
	L extends undefined | number = undefined | number,
	U extends undefined | number = undefined | number
> {

	/**
	 * Discriminator identifying this as a range.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "range";


	/**
	 * Minimum number of values in the linked set.
	 *
	 * **Inheritance** — child value must be ≥ parent value, narrowing the minimum cardinality.
	 *
	 * @defaultValue `undefined` (no minimum constraint, equivalent to 0)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinCountConstraintComponent SHACL § 4.1.1 sh:minCount}
	 */
	readonly minCount?: L;

	/**
	 * Maximum number of values in the linked set.
	 *
	 * **Inheritance** — child value must be ≤ parent value, narrowing the maximum cardinality.
	 *
	 * @defaultValue `undefined` (no maximum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxCountConstraintComponent SHACL § 4.1.2 sh:maxCount}
	 */
	readonly maxCount?: U;


	/**
	 * Shape for all values in the linked set, or a union of value shapes for polymorphic values.
	 *
	 * **Inheritance** — `kind` must match; delegated to value shape or {@link UnionShape} merge rules.
	 */
	readonly shape: (ValueShape | UnionShape) & { readonly model: T };

}


/**
 * Discriminated type alternatives for polymorphic property values.
 *
 * Values for union properties are represented as `Indexed` records mapping variant identifiers to values. In JSON-LD,
 * this maps to an indexed container (`@container: @index`), where variant keys serve as type discriminators.
 *
 * Unions are pure type discriminators — cardinality constraints belong on the enclosing {@link Range}, not on
 * individual variants.
 *
 * > [!NOTE]
 * > Indexed containers are designed exactly to provide JSON structure without affecting JSON-LD graph semantics,
 * > making unions unambiguous and manageable while preserving interoperability with linked data systems.
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link ResourceConstraints.extends | extends}, union-typed
 * properties are merged according to the following rules.
 *
 * | Field      | Override Rule                                                                   |
 * | ---------- | ------------------------------------------------------------------------------ |
 * | `kind`     | Cannot be overridden                                                           |
 * | `model`    | Computed from variants, not user-defined                                       |
 * | `variants` | Variant keys must match parent's; each variant delegated to value shape merge  |
 *
 * Adding or removing variant keys changes the discriminated union structure and is always rejected. Within each
 * matched variant, the corresponding value shape merge rules apply.
 *
 * @typeParam V The variants record type mapping names to value shapes
 *
 * @see {@link https://www.w3.org/TR/shacl/#OrConstraintComponent SHACL § 4.7.2 sh:or}
 * @see {@link https://www.w3.org/TR/json-ld11/#data-indexing JSON-LD 1.1 § 4.6.1 Data Indexing}
 */
export interface UnionShape<V extends {

	readonly [variant: Identifier]: ValueShape

} = {

	readonly [variant: Identifier]: ValueShape

}> {

	/**
	 * Discriminator identifying this as a union.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "union";

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * An indexed record mapping variant keys to their model types. Each variant key is individually optional since
	 * union values provide one variant at a time.
	 *
	 * **Inheritance** — computed from variants, not user-defined.
	 */
	readonly model: { readonly [K in keyof DeclaredProperties<V>]?: V[K] extends ValueShape ? V[K]["model"] : never };


	/**
	 * Named value shape variants.
	 *
	 * Each key serves as a type discriminator for polymorphic property values.
	 *
	 * **Inheritance** — variant keys must match parent's; each variant delegated to value shape merge rules.
	 */
	readonly variants: V;

}


//// Factory Arguments /////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Property definitions for a {@link ResourceShape}.
 *
 * Maps property names to their definitions.
 */
export type Entries =
	| { readonly [property: Identifier]: Entry };

/**
 * A property definition entry.
 *
 * Accepts {@link Id} and {@link Type} markers, naked {@link Range} values for concise syntax, or full
 * {@link Property} definitions with additional constraints like IRI mappings and labels.
 */
export type Entry =
	| Id
	| Type
	| Range
	| Property<Predicate>;


//// Type Inferences ///////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks that child property overrides are assignable to inherited types.
 */
export type Overrides<E extends Entries, I> = {
	[K in keyof E]: K & string extends keyof I
		? Content<E[K]> extends I[K & string] ? E[K] : never
		: E[K]
};

/**
 * Extracts inherited model types from {@link ResourceConstraints.extends}.
 */
export type Inheritance<C> =
	C extends {
			readonly extends: infer E extends
				| Lazy<ResourceShape>
				| readonly [Lazy<ResourceShape>, ...Lazy<ResourceShape>[]]
		}
		? DeclaredProperties<Intersection<
			E extends readonly (infer S extends Lazy<ResourceShape>)[] ? Infer<S>
				: E extends Lazy<ResourceShape> ? Infer<E>
					: never
		>>
		: {};

/**
 * Builds a resource type from {@link Entries}.
 *
 * @typeParam E The entries type
 */
export type Composition<E extends Entries> =
	& { readonly [K in RequiredKeys<E> as K & string]: Content<E[K]> }
	& { readonly [K in OptionalKeys<E> as K & string]?: Exclude<Content<E[K]>, undefined> };

/**
 * Maps SHACL cardinality constraints to TypeScript types.
 *
 * @typeParam V The value type
 * @typeParam L The {@link Range.minCount} constraint
 * @typeParam U The {@link Range.maxCount} constraint
 */
export type Cardinality<V, L extends undefined | number, U extends undefined | number> =
	U extends 1
		? L extends undefined | 0 ? undefined | V : V
		: L extends undefined | 0 ? undefined | readonly V[] : readonly [V, ...V[]];

/**
 * Extracts the content type from an {@link Entry}.
 *
 * @typeParam E The entry type
 */
export type Content<E extends Entry> =
	E extends Id ? IRI
		: E extends Type ? undefined | IRI
			: (E extends Property<Predicate, infer R> ? R
			: E extends Range ? E : never) extends Range<infer T, infer L, infer U>
				? Cardinality<T, L, U>
				: never;

/**
 * Extracts keys of required properties from {@link Entries}.
 *
 * @typeParam E The entries type
 */
export type RequiredKeys<E extends Entries> =
	| { [K in keyof E]: undefined extends Content<E[K]> ? never : K }[keyof E];

/**
 * Extracts keys of optional properties from {@link Entries}.
 *
 * @typeParam E The entries type
 */
export type OptionalKeys<E extends Entries> =
	| { [K in keyof E]: undefined extends Content<E[K]> ? K : never }[keyof E];

/**
 * Extracts explicitly declared properties, stripping index signatures.
 */
export type DeclaredProperties<T> = {
	[K in keyof T as string extends K ? never : number extends K ? never : K]: T[K]
};

/**
 * Converts a union type to an intersection type.
 *
 * @typeParam U The union type
 */
export type Intersection<U extends Value> =
	(U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;


/**
 * Extracts the eager {@link ValueShape} from a {@link Lazy} shape.
 *
 * Resolves lazy factories to their return type and passes direct shapes through unchanged.
 *
 * @typeParam S The lazy shape to resolve
 */
export type Eager<S extends Lazy<ValueShape>> =
	S extends Lazy<infer T extends ValueShape> ? T
		: S extends ValueShape ? S
			: never;

/**
 * Infers the model type from a {@link Lazy} shape or {@link UnionShape}.
 *
 * Resolves lazy factories to their return type and extracts the `model` type from the underlying shape.
 *
 * @typeParam S The shape type
 */
export type Infer<S extends Lazy<ValueShape> | UnionShape> =
	S extends () => { readonly model: infer T } ? T
		: S extends { readonly model: infer T } ? T
			: never;


//// Resources /////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a reference shape for the given target {@link ResourceShape resource shape}.
 *
 * > [!WARNING]
 * > The target shape must include an {@link Id} property. This constraint is checked at runtime but not at compile
 * > time due to limitations with recursive type inference.
 *
 * > [!TIP]
 * > Always dereference {@link ReferenceShape.shape} through {@link resource | resource()} rather than calling the
 * > factory directly, to ensure the resulting shape is fully flattened.
 *
 *
 * @param shape The target resource shape, either directly or as a lazy function to support circular and
 *     self-referential definitions
 *
 * @returns An immutable shape for validating resource references
 *
 * @throws {TypeError} If `shape` is not a valid {@link ResourceShape}
 */
export function reference(shape: Lazy<ResourceShape>): ReferenceShape {

	return immutable({

		kind: "reference",
		model: "app:/",

		shape

	});

}

/**
 * Creates a foreign reference shape for the given target {@link ResourceShape resource shape}.
 *
 * Foreign references are reverse links managed by the target resource. They are read-only from the source resource
 * perspective: included in responses but rejected in state updates.
 *
 * > [!TIP]
 * > Always dereference {@link ReferenceShape.shape} through {@link resource | resource()} rather than calling the
 * > factory directly, to ensure the resulting shape is fully flattened.
 *
 *
 * @param shape The target resource shape, either directly or as a lazy function to support circular and
 *     self-referential definitions
 *
 * @returns An immutable foreign reference shape with `foreign` set to `true`
 *
 * @throws {TypeError} If `shape` is not a valid {@link ResourceShape}
 *
 * @see {@link reference}
 */
export function foreign(shape: Lazy<ResourceShape>): ReferenceShape {

	return immutable({

		kind: "reference",
		model: "app:/",

		foreign: true,
		shape

	});

}


/**
 * Creates a resource shape from a lazy definition.
 *
 * Accepts a {@link ResourceShape} or a factory function returning one. Use a factory for self-referential or circular
 * definitions that must be deferred to avoid infinite recursion at definition time.
 *
 * > [!TIP]
 * > When `shape` includes `extends`, parent shapes are recursively flattened and merged into the returned shape.
 * > Consumers can work with the result directly without traversing the inheritance chain. The `extends` field is
 * > retained for reference, but all inherited constraints are already resolved.
 *
 * > [!TIP]
 * > Always resolve {@link ResourceShape} values from public APIs through `resource()` to ensure the resulting shape
 * > is fully flattened and branded.
 *
 * > [!NOTE]
 * > This function is idempotent: the returned shape is branded and won't be re-flattened if passed to the factory
 * > again or used as a parent in another shape.
 *
 * @typeParam T The concrete {@link ResourceShape} type
 *
 * @param shape The resource shape or a factory function returning it
 *
 * @returns An immutable resource shape with inherited constraints and properties flattened and merged
 *
 * @throws {TraceError} If the shape contains incompatible constraints
 *
 * @example
 *
 * ```typescript
 * // direct shape
 * const Person = resource(shape);
 *
 * // lazy self-referential shape
 * const Person: ResourceShape = resource(() => resource({
 *   friends: optional(reference(Person))
 * }));
 * ```
 */
export function resource<T extends ResourceShape>(shape: Lazy<T>): T;

/**
 * Creates a resource shape from property definitions.
 *
 * Accepts {@link Entry} values including full {@link Property} definitions, naked {@link Range} values for concise
 * syntax, and {@link Id}/{@link Type} markers.
 *
 * > [!TIP]
 * > `name: required(string())` is equivalent to `name: property(required(string()))`
 *
 *
 * @typeParam E The entries record type
 *
 * @param entries The property definitions mapping property names to entries
 *
 * @returns An immutable resource shape with the specified properties
 *
 * @throws {TraceError} If entry definitions are invalid (for example, duplicate id/type markers)
 *
 * @example
 *
 * ```typescript
 * const Person = resource({
 *   name: required(string()),           // naked range
 *   age: property(optional(integer()))  // full property
 * });
 * ```
 */
export function resource<E extends Entries>(
	entries: E
): ResourceShape & { readonly model: Composition<E> };

/**
 * Creates a resource shape from constraints and property definitions.
 *
 * Accepts {@link Entry} values including full {@link Property} definitions, naked {@link Range} values for concise
 * syntax, and {@link Id}/{@link Type} markers.
 *
 * > [!TIP]
 * > When `constraints` includes `extends`, parent shapes are recursively flattened and merged into the returned shape.
 * > Consumers can work with the result directly without traversing the inheritance chain. The `extends` field is
 * > retained for reference, but all inherited constraints are already resolved.
 *
 * > [!NOTE]
 * > This function is idempotent: the returned shape is branded and won't be re-flattened if passed to the factory
 * > again or used as a parent in another shape.
 *
 *
 * @typeParam C The constraints type (used to infer inheritance)
 * @typeParam E The entries record type
 *
 * @param constraints Shape constraints including namespace, name, validators, and optionally `extends`
 * @param entries The property definitions
 *
 * @returns An immutable resource shape with inherited constraints and properties flattened and merged
 *
 * @throws {TraceError} If entry definitions are invalid or inherited constraints are incompatible
 *
 * @example
 *
 * ```typescript
 * // without inheritance
 * const Person = resource({ namespace: schema }, {
 *   name: required(string())  // naked range
 * });
 *
 * // with inheritance
 * const Employee = resource({ extends: Person }, {
 *   department: required(string())  // naked range
 * });
 * ```
 */
export function resource<
	const C extends ResourceConstraints,
	E extends Entries,
	M extends Composition<E> & Inheritance<C> = Composition<E> & Inheritance<C>
>(
	constraints: C & { readonly validators?: readonly [Validator<M>, ...Validator<M>[]] },
	entries: E & Overrides<E, Inheritance<C>>
): ResourceShape & { readonly model: M };

/**
 * Creates resource shapes.
 */
export function resource(
	a: Lazy<ResourceShape> | Entries | ResourceConstraints,
	b?: Entries
): ResourceShape {

	type Parents = ResourceConstraints["extends"];
	type Properties<P extends Predicate> = { readonly [property: Identifier]: Id | Type | Property<P> };


	if ( isFunction(a) ) {

		return materialize(a as Lazy<ResourceShape>);

	} else if ( "kind" in a && a.kind === "resource" ) {

		const shape = a as ResourceShape;

		if ( flatten(shape) === shape ) { // idempotency: already-flattened shapes are returned unchanged

			return shape;

		} else {

			const namespace = locate(shape);
			const resolved = resolve(normalize(shape.properties, shape.extends), namespace);

			return flatten({

				...shape,

				kind: "resource",
				model: build(resolved, shape),

				properties: resolved

			});

		}

	} else if ( b !== undefined ) {

		const constraints = a as ResourceConstraints;
		const properties = b;

		const namespace = locate(constraints);
		const resolved = resolve(normalize(properties, constraints.extends), namespace);

		return flatten({

			kind: "resource",
			model: build(resolved, constraints),

			...constraints,

			properties: resolved

		});

	} else {

		const properties = a as Entries;
		const namespace = locate({});
		const resolved = resolve(normalize(properties), namespace);

		return flatten({

			kind: "resource",
			model: build(resolved),

			properties: resolved

		});

	}


	/**
	 * Identifies the effective namespace for property IRI resolution.
	 *
	 * @param constraints The resource constraints containing namespace and extends
	 *
	 * @returns The effective namespace, resolved in order: declared → inherited → app
	 */
	function locate({ namespace, extends: parents }: ResourceConstraints): Namespace {

		if ( namespace !== undefined ) {

			return namespace;

		} else if ( parents !== undefined ) {

			const namespaces = (Array.isArray(parents) ? parents : [parents]).map(parent =>
				resource(parent).namespace
			);

			// conflicts validated later by flatten() using flattened parent namespaces

			return namespaces[0] ?? defaultNamespace;

		} else {

			return defaultNamespace;

		}

	}

	/**
	 * Wraps naked {@link Range} entries into {@link Property} objects.
	 *
	 * @param entries The property definitions to normalize
	 * @param parents Optional parent shapes for inheritance-aware duplicate detection
	 *
	 * @returns Normalized properties with range wrapped
	 */
	function normalize(entries: Entries, parents?: Parents): Properties<Predicate> {

		const bases: Properties<Reference>[] = parents === undefined ? []
			: (Array.isArray(parents) ? parents : [parents])
				.map(parent => resource(parent).properties);

		const properties = [
			...bases.flatMap(base => Object.values(base)),
			...Object.values(entries)
		];

		const trace = checkSingletons(properties);

		if ( trace !== undefined ) {
			throw new TraceError("duplicate singleton entries", trace);
		}

		return Object.fromEntries(Object.entries(entries).map(([name, entry]) => {

			if ( entry.kind === "range" ) {

				// inherit forward/reverse from parent when wrapping naked range

				const base = bases.reduce<Entry | undefined>((found, b) => found ?? b[name], undefined);

				if ( base !== undefined && base.kind === "property"
					&& (base.forward !== undefined || base.reverse !== undefined)
				) {

					return [name, property({
						...base.forward !== undefined && { forward: base.forward },
						...base.reverse !== undefined && { reverse: base.reverse }
					}, entry)];

				} else {

					return [name, property(entry)];

				}

			} else {

				return [name, entry]; // pass-through Id | Type | Property

			}

		}));
	}

	/**
	 * Resolves namespace functions to concrete IRIs for property mappings.
	 *
	 * When neither `forward` nor `reverse` is defined, generates a default forward IRI using the effective namespace.
	 *
	 * @param properties The properties to resolve
	 * @param namespace The effective namespace for default forward resolution
	 *
	 * @returns Properties with `forward` and `reverse` resolved to IRIs
	 */
	function resolve(properties: Properties<Predicate>, namespace: Namespace): Properties<Reference> {
		return Object.fromEntries(Object.entries(properties).map(([name, property]) => {

			if ( property.kind === "id" || property.kind === "type" ) {

				return [name, property];

			} else {

				const forward = isString(property.forward) ? asIRI(property.forward) // IRI
					: property.forward ? asIRI(property.forward[name]) // namespace
						: undefined;

				const reverse = isString(property.reverse) ? asIRI(property.reverse) // IRI
					: property.reverse ? asIRI(property.reverse[name]) // namespace
						: undefined;


				return [name, {

					...property,

					// generate default forward when neither forward nor reverse is defined

					forward: forward === undefined && reverse === undefined
						? asIRI(namespace[name])
						: forward,

					reverse

				}];

			}

		}));
	}

	/**
	 * Builds a representative model value from property definitions.
	 *
	 * Constructs an immutable object where each property contains a model value derived from its range:
	 * scalar if `maxCount === 1`, array otherwise; unions produce records mapping variant names to their models.
	 *
	 * When parent shapes are provided, their models are merged before applying local properties, so local
	 * definitions override inherited ones. Parent models already contain transitive inherited properties.
	 *
	 * @param properties The resolved property definitions
	 * @param constraints Optional constraints containing parent shapes whose models should be inherited
	 *
	 * @returns An immutable resource model
	 */
	function build(properties: Properties<Reference>, { extends: parents }: ResourceConstraints = {}): Resource {

		const inherited = parents === undefined ? {} : (Array.isArray(parents) ? parents : [parents])
			.map(parent => resource(parent).model)
			.reduce((inherited, model) => ({ ...model, ...inherited }), {});

		return immutable({
			...inherited,
			...Object.fromEntries(Object.entries(properties)
				.map(([name, property]) => [name, propertyModel(property)])
			)
		}) as Resource;


		/**
		 * Derives the model value for a property entry.
		 */
		function propertyModel(entry: Id | Type | Property): unknown {
			return entry.kind === "id" || entry.kind === "type" ? "/"
				: rangeModel(entry.range);
		}

		/**
		 * Derives the model value for a range.
		 */
		function rangeModel(range: Range): unknown {
			return range.maxCount === 1
				? range.shape.model
				: [range.shape.model];
		}

	}

}


//// Properties ////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a property shape for the resource identifier.
 *
 * Maps to JSON-LD `@id` and provides a required single absolute IRI property.
 *
 *
 * @param constraints The identifier property constraints
 * @param constraints.hidden Excludes the property from default serialisation
 *
 * @returns An immutable required single IRI (1..1) property shape for the resource identifier
 *
 * @see {@link https://www.w3.org/TR/json-ld11/#node-identifiers JSON-LD 1.1 § 3.3 Node Identifiers}
 */
export function id(constraints: {

	readonly hidden?: boolean;

} = {}): Id {

	return immutable({

		kind: "id",

		hidden: constraints.hidden

	});

}

/**
 * Creates a property shape for the resource type.
 *
 * Maps to JSON-LD `@type` and provides an optional single absolute IRI property.
 *
 *
 * @param constraints The type property constraints
 * @param constraints.hidden Excludes the property from default serialisation
 *
 * @returns An immutable optional single IRI (0..1) property shape for the resource type
 *
 * @see {@link https://www.w3.org/TR/json-ld11/#specifying-the-type JSON-LD 1.1 § 3.5 Specifying the Type}
 */
export function type(constraints: {

	readonly hidden?: boolean;

} = {}): Type {

	return immutable({

		kind: "type",

		hidden: constraints.hidden

	});

}


/**
 * Creates a property shape from a value range.
 *
 *
 * @typeParam R The range type
 *
 * @param range The value range for this property
 *
 * @returns An immutable {@link Property} with the specified range
 */
export function property<R extends Range>(
	range: R
): Property<Predicate, R>;

/**
 * Creates a property shape with constraints from a value range.
 *
 * @remarks
 *
 * The `forward` and `reverse` fields accept plain strings for convenience; they are converted to {@link IRI} values
 * internally.
 *
 *
 * @typeParam R The range type
 *
 * @param constraints Property constraints including IRI mappings and labels
 * @param range The value range for this property
 *
 * @returns An immutable {@link Property} with the specified range
 */
export function property<R extends Range>(
	constraints: PropertyConstraints<Predicate>,
	range: R
): Property<Predicate, R>;

/**
 * Creates property shapes.
 *
 */
export function property<R extends Range>(
	a: Range | PropertyConstraints<Predicate>,
	b?: Range
): Property<Predicate, R> {

	const constraints = (b !== undefined ? a : {}) as PropertyConstraints<Predicate>;
	const range = (b !== undefined ? b : a) as R;

	return immutable({
		kind: "property",
		...constraints,
		range
	});

}


//// Ranges ////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a union of named value shapes.
 *
 * Each key in the record serves as a type discriminator for polymorphic property values,
 * enabling JSON-LD `@container: @index` patterns while preserving RDF semantics.
 *
 * Unions are pure type discriminators — cardinality constraints are applied by wrapping the union in a
 * {@link Range} via cardinality helpers like {@link required}, {@link optional}, etc.
 *
 *
 * @typeParam V The variants record type
 *
 * @param variants Record mapping variant names to value shapes
 *
 * @returns An immutable union with the specified variants
 *
 * @example
 *
 * ```typescript
 * const address = property(optional(union({
 *   string: string(),
 *   PostalAddress: PostalAddress
 * })));
 * ```
 *
 * @see {@link https://www.w3.org/TR/shacl/#OrConstraintComponent SHACL § 4.7.2 sh:or}
 * @see {@link https://www.w3.org/TR/json-ld11/#data-indexing JSON-LD 1.1 § 4.6.1 Data Indexing}
 */
export function union<V extends { readonly [variant: Identifier]: Lazy<ValueShape> }>(variants: V): UnionShape<{

	readonly [K in keyof V]: Eager<V[K]>

}> {

	const materialized = Object.fromEntries(
		Object.entries(variants)
			.map(([k, v]) => [k, materialize(v)])
	);

	return immutable({

		kind: "union",

		model: Object.fromEntries(Object.entries(materialized).map(([k, v]) =>
			[k, (v as ValueShape).model]
		)),

		variants: materialized

	}) as UnionShape<{ readonly [K in keyof V]: Eager<V[K]> }>;

}


/**
 * Creates a value range with no cardinality constraints (0..*).
 *
 * Allows zero or more values, resulting in an optional array type (`undefined | readonly V[]`).
 *
 *
 * @typeParam S The {@link Lazy} {@link ValueShape} or {@link UnionShape} type
 *
 * @param shape The {@link Lazy} {@link ValueShape} or {@link UnionShape} for the linked set
 *
 * @returns An immutable range with no minimum or maximum count
 */
export function multiple<S extends Lazy<ValueShape> | UnionShape>(shape: S): Range<Infer<S>, undefined, undefined> {

	return cardinality(undefined, undefined)(shape);

}

/**
 * Creates a value range requiring at least one value (1..*).
 *
 * Requires one or more values, resulting in a non-empty array type (`readonly [V, ...V[]]`).
 *
 *
 * @typeParam S The {@link Lazy} {@link ValueShape} or {@link UnionShape} type
 *
 * @param shape The {@link Lazy} {@link ValueShape} or {@link UnionShape} for the linked set
 *
 * @returns An immutable range with minCount=1 and no maximum count
 */
export function repeatable<S extends Lazy<ValueShape> | UnionShape>(shape: S): Range<Infer<S>, 1, undefined> {

	return cardinality(1, undefined)(shape);

}

/**
 * Creates a value range for at most one value (0..1).
 *
 * Allows zero or one value, resulting in an optional scalar type (`undefined | V`).
 *
 *
 * @typeParam S The {@link Lazy} {@link ValueShape} or {@link UnionShape} type
 *
 * @param shape The {@link Lazy} {@link ValueShape} or {@link UnionShape} for the linked set
 *
 * @returns An immutable range with no minimum count and maxCount=1
 */
export function optional<S extends Lazy<ValueShape> | UnionShape>(shape: S): Range<Infer<S>, undefined, 1> {

	return cardinality(undefined, 1)(shape);

}

/**
 * Creates a value range for exactly one value (1..1).
 *
 * Requires exactly one value, resulting in a required scalar type (`V`).
 *
 *
 * @typeParam S The {@link Lazy} {@link ValueShape} or {@link UnionShape} type
 *
 * @param shape The {@link Lazy} {@link ValueShape} or {@link UnionShape} for the linked set
 *
 * @returns An immutable range with minCount=1 and maxCount=1
 */
export function required<S extends Lazy<ValueShape> | UnionShape>(shape: S): Range<Infer<S>, 1, 1> {

	return cardinality(1, 1)(shape);

}

/**
 * Creates a value range factory with custom cardinality constraints.
 *
 * Returns a factory function that creates ranges with the specified minimum and maximum counts.
 *
 *
 * @typeParam L The minimum count constraint type
 * @typeParam U The maximum count constraint type
 *
 * @param lower Minimum number of values in the linked set
 * @param upper Maximum number of values in the linked set
 *
 * @returns A factory function that creates immutable ranges with the specified cardinality
 *
 * @example
 *
 * ```typescript
 * const twoToFive = cardinality(2, 5);
 * const tags = property(twoToFive(string()));
 * ```
 */
export function cardinality<
	L extends undefined | number,
	U extends undefined | number = undefined
>(
	lower: L,
	upper?: U
): <S extends Lazy<ValueShape> | UnionShape>(shape: S) => Range<Infer<S>, L, U> {

	if ( lower !== undefined && lower < 0 ) {
		throw new TypeError(`expected non-negative minCount <${lower}>`);
	}

	if ( upper !== undefined && upper < 0 ) {
		throw new TypeError(`expected non-negative maxCount <${upper}>`);
	}

	if ( lower !== undefined && upper !== undefined && lower > upper ) {
		throw new TypeError(`inconsistent bounds <${lower}> > <${upper}>`);
	}

	return <S extends Lazy<ValueShape> | UnionShape>(shape: S) => {

		const materialized = "kind" in shape ? shape : materialize(shape);

		return immutable({

			kind: "range",

			minCount: lower,
			maxCount: upper,

			shape: materialized as (ValueShape | UnionShape) & {
				readonly model: Infer<S>
			}

		});

	};

}
