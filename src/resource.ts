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
 * **Resource Metadata**
 *
 * Use {@link identify} and {@link classify} to retrieve the `id` and `type` metadata of resources given
 * the associated {@link ResourceShape}.
 *
 * ```typescript
 * identify(product, shape); // resource identifier or undefined
 * classify(product, shape); // resource type or undefined
 * ```
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
 * import { required, optional, multiple, repeatable, cardinality } from '@metreeca/blue';
 * import { string } from '@metreeca/blue';
 * import { resource, property } from '@metreeca/blue/resource';
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
 * import { required } from '@metreeca/blue';
 * import { string } from '@metreeca/blue';
 * import { resource, property } from '@metreeca/blue/resource';
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
 * import { required, optional } from '@metreeca/blue';
 * import { string, number } from '@metreeca/blue';
 * import { resource, id, reference } from '@metreeca/blue/resource';
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
 * import { required } from '@metreeca/blue';
 * import { string, integer } from '@metreeca/blue';
 * import { resource, id, reference } from '@metreeca/blue/resource';
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
 * > Constraints are enforced **conjunctively**: when a child shape overrides an inherited property, values must
 * > satisfy both the child's constraints and all inherited constraints. Overrides can restrict inherited constraints
 * > but never relax them.
 *
 * > [!WARNING]
 * > Constraints that can be expressed in the type system — such as non-empty set requirements on `in`, `hasValue`,
 * > `languageIn`, and `validators` — are enforced at compile time and not re-validated at runtime.
 *
 * **Polymorphic Properties**
 *
 * Use {@link index!union | union} for properties accepting multiple value types. Unions are pure type
 * discriminators — cardinality constraints belong on the enclosing {@link SetShape}, not on individual variants.
 * At runtime, union values are represented as {@link @metreeca/qest!Indexed | Indexed} records mapping variant names
 * to their values, corresponding to JSON-LD [indexed containers](https://www.w3.org/TR/json-ld11/#data-indexing)
 * (`@container: @index`):
 *
 * ```typescript
 * import { union, optional, required } from '@metreeca/blue';
 * import { string } from '@metreeca/blue';
 * import { resource, reference } from '@metreeca/blue/resource';
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
 * **Custom Validators**
 *
 * Implement custom resource-level constraints using {@link index!Validator | Validator} functions, returning keyed
 * {@link index!Trace | Trace} reports:
 *
 * ```typescript
 * import type { Validator } from '@metreeca/blue';
 *
 * interface Product { minPrice?: number; maxPrice?: number; startDate?: string; endDate?: string }
 *
 * const checkProduct: Validator<Product> = value => {
 *
 *   const priceIssue = value.minPrice !== undefined && value.maxPrice !== undefined
 *       && value.minPrice > value.maxPrice
 *       ? "minPrice must not exceed maxPrice" : undefined;
 *
 *   const dateIssue = value.startDate !== undefined && value.endDate !== undefined
 *       && value.startDate > value.endDate
 *       ? "startDate must not follow endDate" : undefined;
 *
 *   return priceIssue || dateIssue
 *       ? { minPrice: priceIssue, startDate: dateIssue } : undefined;
 *
 * };
 *
 * const Product = resource({ validators: [checkProduct] }, {
 *   minPrice: optional(integer()),
 *   maxPrice: optional(integer()),
 *   startDate: optional(date()),
 *   endDate: optional(date())
 * });
 * ```
 *
 * @module
 *
 *
 * @see {@link https://www.w3.org/TR/shacl/ SHACL - Shapes Constraint Language}
 * @see {@link https://www.w3.org/TR/shacl/#ClosedConstraintComponent SHACL § 4.8.1 sh:closed}
 */

import { type Identifier, isFunction, isString, type Lazy } from "@metreeca/core";
import { immutable } from "@metreeca/core/deep";
import { asIRI, createNamespace, type IRI, isIRI, type Namespace } from "@metreeca/core/resource";
import { defaultBase, Reference } from "@metreeca/qest";
import type { Localised, Resource, Value } from "@metreeca/qest/state";
import { materialize } from "./core/cache.js";
import { TraceError } from "./core/trace.js";
import type { Cardinality, Declared, Infer, SetShape, UnionShape, Validator } from "./index.js";
import type { LocalisedShape } from "./localised.js";
import { checkSingletons, flatten } from "./resource.core.js";


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
	readonly name?: Localised;

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
	readonly description?: Localised;


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
 * | `range`       | Delegated to {@link SetShape} merge rules                                                |
 * | `hidden`      | Inherited; conflicting parents without child override are reported as an error         |
 * | `computed`    | Inherited; conflicting parents without child override are reported as an error         |
 * | `name`        | Cannot be overridden                                                                  |
 * | `description` | Cannot be overridden                                                                  |
 * | `forward`     | Cannot be overridden                                                                  |
 * | `reverse`     | Cannot be overridden                                                                  |
 *
 * @typeParam P The predicate type for IRI mappings, defaulting to resolved {@link Reference}
 * @typeParam R The {@link SetShape} type, defaulting to unconstrained
 *
 * @see {@link https://www.w3.org/TR/shacl/#property-shapes SHACL § 2.3.2 Property Shapes}
 */
export interface Property<P extends Predicate = Reference, R extends SetShape = SetShape> extends PropertyConstraints<P> {

	/**
	 * Discriminator identifying this as a property shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "property";


	/**
	 * Value range for this property.
	 *
	 * **Inheritance** — delegated to {@link SetShape} merge rules.
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
	readonly name?: Localised;

	/**
	 * Human-readable description of the property.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (no description)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 6.1.2 sh:description}
	 */
	readonly description?: Localised;


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
 * Accepts {@link Id} and {@link Type} markers, naked {@link SetShape} values for concise syntax, or full
 * {@link Property} definitions with additional constraints like IRI mappings and labels.
 */
export type Entry =
	| Id
	| Type
	| SetShape
	| Property<Predicate>;


//// Type Inference .///////////////////////////////////////////////////////////////////////////////////////////////////

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
		? Declared<Intersection<
			E extends readonly (infer S extends Lazy<ResourceShape>)[] ? Infer<S>
				: E extends Lazy<ResourceShape> ? Infer<E>
					: never
		>>
		: {};

/**
 * Converts a union type to an intersection type.
 *
 * @typeParam U The union type
 */
export type Intersection<U extends Value> =
	(U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

/**
 * Builds a resource type from {@link Entries}.
 *
 * @typeParam E The entries type
 */
export type Composition<E extends Entries> =
	& { readonly [K in RequiredKeys<E> as K & string]: Content<E[K]> }
	& { readonly [K in OptionalKeys<E> as K & string]?: Exclude<Content<E[K]>, undefined> };

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
 * Extracts the content type from an {@link Entry}.
 *
 * @typeParam E The entry type
 */
export type Content<E extends Entry> =
	E extends Id ? IRI
		: E extends Type ? undefined | IRI
			: PropertyRange<E> extends SetShape<infer T, infer L, infer U, infer S>
				? [S] extends [LocalisedShape | UnionShape]
					? Cardinality<PropertyRange<E>["model"], L, 1>
					: Cardinality<T, L, U>
				: never;

/**
 * Extracts the {@link SetShape} range from a {@link Property} or naked {@link SetShape} entry.
 *
 * @typeParam E The entry type
 */
export type PropertyRange<E extends Entry> =
	E extends Property<Predicate, infer R> ? R
		: E extends SetShape ? E
			: never;


//// Metadata //////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Retrieves the identifier of a resource.
 *
 * @typeParam T The resource type
 *
 * @param resource The resource to inspect
 * @param shape The {@link ResourceShape} describing `resource`
 *
 * @returns The resource identifier, if `shape` declares an {@link Id | id} property, `resource` includes one, and the
 *     value is a well-formed absolute IRI; `undefined` otherwise
 */
export function identify<T extends Resource>(resource: T, shape: ResourceShape): undefined | Reference {

	const key = Object.entries(shape.properties).find(([, p]) => p.kind === "id")?.[0];
	const value = key !== undefined ? resource[key] : undefined;

	return value !== undefined && isIRI(value, "absolute") ? value : undefined;

}

/**
 * Retrieves the type of a resource.
 *
 * @typeParam T The resource type
 *
 * @param resource The resource to inspect
 * @param shape The {@link ResourceShape} describing `resource`
 *
 * @returns The resource type if `shape` declares a {@link Type | type} property, `resource` includes one, and the
 *     value is a well-formed absolute IRI; `undefined` otherwise
 */
export function classify<T extends Resource>(resource: T, shape: ResourceShape): undefined | Reference {

	const key = Object.entries(shape.properties).find(([, p]) => p.kind === "type")?.[0];
	const value = key !== undefined ? resource[key] : undefined;

	return value !== undefined && isIRI(value, "absolute") ? value : undefined;

}


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
 * Accepts {@link Entry} values including full {@link Property} definitions, naked {@link SetShape} values for
 * concise syntax, and {@link Id}/{@link Type} markers.
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
 * Accepts {@link Entry} values including full {@link Property} definitions, naked {@link SetShape} values for
 * concise syntax, and {@link Id}/{@link Type} markers.
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
	 * Wraps naked {@link SetShape} entries into {@link Property} objects.
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

			if ( entry.kind === "set" ) {

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
		});


		/**
		 * Derives the model value for a property entry.
		 */
		function propertyModel(entry: Id | Type | Property): unknown {
			return entry.kind === "id" || entry.kind === "type" ? defaultBase : entry.range.model;
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
export function property<R extends SetShape>(
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
export function property<R extends SetShape>(
	constraints: PropertyConstraints<Predicate>,
	range: R
): Property<Predicate, R>;

/**
 * Creates property shapes.
 *
 */
export function property<R extends SetShape>(
	a: SetShape | PropertyConstraints<Predicate>,
	b?: SetShape
): Property<Predicate, R> {

	const constraints = (b !== undefined ? a : {}) as PropertyConstraints<Predicate>;
	const range = (b !== undefined ? b : a) as R;

	return immutable({
		kind: "property",
		...constraints,
		range
	});

}
