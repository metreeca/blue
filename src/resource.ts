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
 * Resource shapes and factories.
 *
 * Defines {@link ResourceShape} and the {@link resource}, {@link property}, {@link id}, and
 * {@link type} factories used to declare the expected structure of linked data resources.
 * Shapes carry property definitions, cardinality constraints, IRI mappings, and inheritance,
 * and drive both runtime validation and compile-time type inference through {@link Content}.
 * Use {@link value!model | model} to extract the deeply typed retrieval template
 * stored on a resource shape.
 *
 * > [!IMPORTANT]
 * > Resource shapes are **closed**: validated resources may only contain members explicitly
 * > defined in the shape. Any additional fields will cause validation to fail.
 *
 * > [!IMPORTANT]
 * > All IRI values in validated resources must be absolute. When decoding client input, relative
 * > references may be auto-resolved using the `base` option in
 * > {@link @metreeca/qest!decodeResource | decodeResource} or
 * > {@link @metreeca/qest!decodeSelection | decodeSelection}.
 *
 * **Defining Resource Shapes**
 *
 * Combine property definitions with value ranges to define resource structures:
 *
 * ```typescript
 * import { required, optional, nonempty } from '@metreeca/blue/value';
 * import { resource, id } from '@metreeca/blue/resource';
 * import { string } from '@metreeca/blue/string';
 * import { integer } from '@metreeca/blue/number';
 * import { boolean } from '@metreeca/blue/boolean';
 *
 * const Product = resource({
 *   id: id(),
 *   name: required(string({ model: "name", minLength: 1 })),
 *   price: required(integer({ minInclusive: 0 })),
 *   available: optional(boolean()),
 *   tags: nonempty(string())
 * });
 * ```
 *
 * **Properties and Ranges**
 *
 * Ranges define cardinality constraints for property values:
 *
 * ```typescript
 * import { multiple, nonempty, optional, property, required, resource } from '@metreeca/blue/resource';
 * import { string } from '@metreeca/blue/string';
 *
 * const Shape = resource({
 *   name: required(string()),                          // 1..1
 *   alias: optional(string()),                         // 0..1
 *   tags: nonempty(string()),                          // 1..*
 *   notes: multiple(string()),                         // 0..*
 *   codes: property(string(), { minCount: 2, maxCount: 5 })  // 2..5
 * });
 * ```
 *
 * Each factory takes the constraints the property carries beyond its cardinality, such as IRI mappings or labels:
 *
 * ```typescript
 * import { required, resource } from '@metreeca/blue/resource';
 * import { string } from '@metreeca/blue/string';
 * import { createNamespace } from '@metreeca/core/resource';
 *
 * const schema = createNamespace("http://schema.org/");
 *
 * const Person = resource({
 *   name: required(string(), { forward: schema })
 * });
 * ```
 *
 * **Resource References and Embedding**
 *
 * Resource members link to other resources in two ways. A
 * {@link reference!reference | reference} wrapper links to a **standalone resource**, an
 * independently identified and managed entity. A direct shape inclusion defines an
 * **embedded resource**, a nested object with no independent identity, created and managed
 * together with its parent.
 *
 * > [!NOTE]
 * > An embedded resource shape may not carry an {@link id} member: embedded resources have no
 * > independent identity, so a nested resource state bearing an identifier is rejected during state
 * > validation rather than at shape construction, since an id-bearing embedded range is
 * > indistinguishable from an expanded captive reference until a state is checked against it. A
 * > {@link type} member is accepted and validated in both state and template retrieval.
 *
 * ```typescript
 * import { required, optional } from '@metreeca/blue/value';
 * import { string } from '@metreeca/blue/string';
 * import { number } from '@metreeca/blue/number';
 * import { resource, id } from '@metreeca/blue/resource';
 * import { reference } from '@metreeca/blue/reference';
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
 *   rating: optional(Rating),           // embedded
 *   vendor: required(reference(Vendor)) // standalone
 * });
 * ```
 *
 * Self-referential shapes use lazy factories to defer resolution and avoid infinite recursion at
 * definition time:
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
 * **Retrieval Form**
 *
 * In a retrieval template, an embedded resource property accepts only a **nested resource
 * template**, a nested object validated against this shape and subject to the template
 * validator's `depth` budget. Bare IRI strings are not accepted, since an embedded resource
 * has no independent identifier of its own. See {@link index!validate | validate} for the full form comparison
 * and {@link reference!ReferenceShape} for the companion standalone form.
 *
 * **Property Mappings versus Foreign References**
 *
 * The {@link PropertyConstraints.forward | forward} and
 * {@link PropertyConstraints.reverse | reverse} mappings on a property control how property
 * values are persisted — both write actual property mappings. The
 * {@link reference!ReferenceConstraints.foreign | foreign} flag on a reference shape is an
 * independent concept: a read-only view over mappings owned by another property that does not
 * write any mappings on insert. During resource validation, foreign reference members are
 * rejected; during template validation they are accepted for data retrieval.
 *
 * **Embedded versus Captive Resources**
 *
 * **Embedded resources** have no independent identity or lifecycle and are always managed as part
 * of their parent. An embedded resource shape may not carry an {@link id} member: the rejection is
 * enforced during state validation rather than at shape construction, since an id-bearing embedded
 * range is indistinguishable from an expanded captive reference until a resource state is checked
 * against it. A {@link type} member is accepted and validated in both state and template retrieval.
 * Embedded resources are
 * defined by directly including a resource shape without a {@link reference!reference | reference}
 * wrapper.
 *
 * **Captive resources**, identified by the
 * {@link reference!ReferenceConstraints.captive | captive} flag, have independent identity and
 * lifecycle but cannot outlive the source resource and are automatically cascade-removed when it
 * is deleted.
 *
 * **Inheritance**
 *
 * Extend parent shapes to inherit members and constraints:
 *
 * ```typescript
 * import { required } from '@metreeca/blue/value';
 * import { string } from '@metreeca/blue/string';
 * import { integer } from '@metreeca/blue/number';
 * import { resource, id } from '@metreeca/blue/resource';
 *
 * const NamedEntity = resource({
 *   id: id(),
 *   name: required(string({ model: "name", minLength: 1 }))
 * });
 *
 * const Employee = resource(NamedEntity, {
 *   department: required(string()),
 *   salary: required(integer({ minInclusive: 0 }))
 * });
 * ```
 *
 * > [!IMPORTANT]
 * > Constraints are enforced **conjunctively**: when a child shape overrides an inherited
 * > property, values must satisfy both the child's constraints and all inherited constraints.
 * > Overrides can restrict inherited constraints but never relax them.
 *
 * **Refining nested targets**
 *
 * A slot holding a nested resource or a {@link reference!reference | reference} is refined by re-pointing it at a shape
 * extending the inherited target: the refinement declares only what it adds or narrows, as the refined target carries
 * the inherited definition through its own {@link ResourceShape.parents | parents}. Any other target, the
 * inherited target's own parent included, is rejected at the call site.
 *
 * **Narrowing union slots**
 *
 * When a parent declares a {@link union!union | union}-typed slot, an extending shape may drop variants and tighten the
 * variants it keeps, but never add new ones. Narrowing takes one of two forms:
 *
 * 1. **Single-variant narrowing** (Form 1) — the child supplies a non-union value shape that narrows exactly one of
 *    the parent's variants (by `kind`, only-tightening constraints, a matching `datatype` for `string` / `number`, and
 *    the variant's target shape or one extending it for `reference`, or a subtype `class` for `resource`). The merged
 *    slot becomes a bare value shape; consumers see the variant's plain model rather than the union's variant-keyed
 *    model.
 * 2. **Union subsetting** (Form 2) — the child supplies a smaller {@link union!union | union} whose variants each
 *    narrow a distinct parent variant. The pairing is order-independent and injective; surviving variants are merged
 *    and unpaired parent variants are dropped.
 *
 * ```typescript
 * import { required } from '@metreeca/blue/value';
 * import { union } from '@metreeca/blue/union';
 * import { string } from '@metreeca/blue/string';
 * import { integer } from '@metreeca/blue/number';
 * import { resource } from '@metreeca/blue/resource';
 *
 * const Entity = resource({
 *   code: required(union(string(), integer()))
 * });
 *
 * // Form 1 — narrows the slot to a bare string
 * const Vendor = resource(Entity, {
 *   code: required(string({ model: "ABC", pattern: "^[A-Z]" }))
 * });
 *
 * // Form 2 — keeps the union but drops the string variant wholesale
 * const Numbered = resource(Entity, {
 *   code: required(union(integer()))
 * });
 * ```
 *
 * The merged union's `model` re-indexes contiguously from `0`; consumers must key off the shape's own `model`,
 * not assume positional alignment with an ancestor. See {@link union!UnionShape | UnionShape} for the full
 * inheritance contract.
 *
 * **Polymorphic Properties**
 *
 * Use {@link union!union | union} for members accepting multiple value types. Variants are
 * supplied as positional arguments and act as mutually exclusive alternatives (`sh:xone`): a `state` value singles out
 * exactly one variant (`sh:xone`) on write, while a `model` placeholder matches at least one by kind (`sh:or`) on read.
 * Cardinality constraints belong on the enclosing
 * {@link SetShape}, not on individual variants. At runtime, values are stored directly with no
 * variant wrapping:
 *
 * ```typescript
 * import { optional, required } from '@metreeca/blue/value';
 * import { union } from '@metreeca/blue/union';
 * import { string } from '@metreeca/blue/string';
 * import { resource } from '@metreeca/blue/resource';
 * import { reference } from '@metreeca/blue/reference';
 *
 * const PostalAddress = resource({
 *   id: id(),
 *   street: required(string()),
 *   city: required(string())
 * });
 *
 * const Contact = resource({
 *   address: optional(union(
 *     string(),
 *     reference(PostalAddress)
 *   ))
 * });
 * ```
 *
 * Either variant is accepted at the same property position:
 *
 * ```json
 * { "address": "123 Main St" }
 *
 * { "address": "https://data.example.com/addresses/456" }
 * ```
 *
 * **Custom Validators**
 *
 * Implement custom resource-level constraints as {@link Validator | validators} reporting keyed {@link Trace} records,
 * or `undefined` when the resource passes:
 *
 * ```typescript
 * import type { Validator } from '@metreeca/blue';
 * import { optional } from '@metreeca/blue/value';
 * import { date } from '@metreeca/blue/string';
 * import { integer } from '@metreeca/blue/number';
 * import { resource } from '@metreeca/blue/resource';
 *
 * interface Product { minPrice?: number; maxPrice?: number; startDate?: string; endDate?: string }
 *
 * const checkProduct: Validator<Product> = value => {
 *
 *   const priceIssue = value.minPrice !== undefined && value.maxPrice !== undefined
 *       && value.minPrice > value.maxPrice;
 *
 *   const dateIssue = value.startDate !== undefined && value.endDate !== undefined
 *       && value.startDate > value.endDate;
 *
 *   return priceIssue || dateIssue ? {
 *       ...(priceIssue ? { minPrice: "minPrice must not exceed maxPrice" } : {}),
 *       ...(dateIssue ? { startDate: "startDate must not follow endDate" } : {})
 *   } : undefined;
 *
 * };
 *
 * const Product = resource({
 *   minPrice: optional(integer()),
 *   maxPrice: optional(integer()),
 *   startDate: optional(date()),
 *   endDate: optional(date())
 * }, {
 *   validators: [checkProduct]
 * });
 * ```
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/shacl/ SHACL - Shapes Constraint Language}
 * @see {@link https://www.w3.org/TR/shacl/#ClosedConstraintComponent SHACL § 4.8.1 sh:closed}
 */

import { assert, type Identifier, isFunction, isObject, isString, type Lazy } from "@metreeca/core";
import { createNamespace, type IRI, isIRI, type Namespace } from "@metreeca/core/resource";
import { immutable } from "@metreeca/core/structures";
import { type Trace, TraceError, type Validator } from "@metreeca/core/trace";
import { app } from "@metreeca/qest";
import type { Dictionary, Reference, Resource } from "@metreeca/qest/resource";
import type { Template } from "@metreeca/qest/template";
import { checkSingletons, flatten } from "./resource.core.js";
import { buildValues } from "./value.core.js";
import { eager, type Schema, type SetShape, type Shape, type State } from "./value.js";

export {
	getShapeClass,
	getShapeClasses,
	getShapeId,
	getShapeProperties,
	getShapeType
} from "./resource.core.js";


/**
 * Default application namespace for property IRI resolution (`app:/#`).
 *
 * Used as the fallback when neither {@link ResourceConstraints.space} nor any inherited
 * namespace is declared on a resource shape.
 *
 * @see {@link ResourceConstraints.space}
 */
export const defaultNamespace: Namespace = createNamespace("app:/#");


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Shape definition for linked data resources.
 *
 * Validates linked data resources with structural constraints including inheritance, property definitions, and
 * SHACL-aligned validation rules. Resource shapes define the expected structure of linked data resources and support
 * type inference for property values.
 *
 * > [!IMPORTANT]
 * > Resource shapes are **closed**: validated resources may only contain members explicitly defined in the shape.
 * > Any additional fields will cause validation to fail.
 *
 * **Inheritance**
 *
 * When a resource shape extends a parent via {@link ResourceShape.parents | parents}, fields are merged
 * according to the following rules. The *child* is the extending shape; the *parent* is the inherited shape.
 *
 * | Field         | Override Rule                                                                           |
 * | ------------- | --------------------------------------------------------------------------------------- |
 * | `kind`        | Cannot be overridden                                                                    |
 * | `model`       | Computed from members, not user-defined                                                 |
 * | `name`        | Always from child; not inherited                                                        |
 * | `description` | Always from child; not inherited                                                        |
 * | `classes`     | Computed from the `class` of the extended shapes, not user-defined                      |
 * | `parents`     | Structural; outside inheritance scope                                                   |
 * | `members`     | Union; clashing keys merged per property rules; `kind` mismatch is reported as an error  |
 * | `validators`  | Union of parent and child validators; all apply                                         |
 * | `virtual`     | Inherited; conflicting parents without child override are reported as an error          |
 * | `space`       | Inherited; conflicting parents without child override are reported as an error          |
 * | `class`       | Shape-specific target class; outside inheritance scope                                  |
 * | `pattern`     | Child may replace trailing `/*` wildcard with more specific segments                    |
 * | `in`          | Child narrows the parent set; a widened set is reported as an error                     |
 * | `hasValue`    | Union of parent and child required values; child must require all parent values         |
 *
 * **Refinement as a Nested Value**
 *
 * A shape embedded in a property slot is refined by an extending shape: on top of the rules above, the refining shape
 * must declare every {@link ResourceShape.class | class} the inherited shape declares, since a value of a different
 * class is not a value of the inherited shape. Extending the inherited shape satisfies this on its own, and carries
 * its definition along, so the refinement declares only what it adds or narrows.
 *
 * **Cross-Field Validation**
 *
 * - all merged `hasValue` values must belong to the merged `in` set (if defined)
 * - `forward` predicate IRIs must be unique across all members
 * - `reverse` predicate IRIs must be unique across all members
 * - `forward` and `reverse` are independent sets: the same IRI may appear in both
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.2 Node Shapes}
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
	 * Provides an immutable retrieval template matching this shape. When a shape extends parent shapes, inherited
	 * members are merged into the template; local definitions override inherited ones. Members whose cardinality
	 * admits absence are carried as optional keys, so a matching literal spells out only the members it supplies.
	 * The runtime state type may be recovered via {@link @metreeca/qest!Instance | Instance}.
	 *
	 * **Inheritance** — computed from members, not user-defined.
	 */
	readonly model: Template;


	/**
	 * Human-readable name for the shape.
	 *
	 * Always a localised map: a plain-text {@link ResourceConstraints.name | shorthand} handed to the factory is
	 * expanded to `{ en: <value> }`.
	 *
	 * **Inheritance** — always from child; not inherited.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 2.3.2.1 sh:name}
	 */
	readonly name?: Dictionary;

	/**
	 * Human-readable description of the shape.
	 *
	 * Always a localised map: a Markdown {@link ResourceConstraints.description | shorthand} handed to the factory is
	 * expanded to `{ en: <value> }`.
	 *
	 * **Inheritance** — always from child; not inherited.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 2.3.2.1 sh:description}
	 */
	readonly description?: Dictionary;


	/**
	 * Ancillary class constraints for resource instances.
	 *
	 * Lists the classes resource instances must conform to on top of their own
	 * {@link ResourceConstraints.class | class}: the {@link ResourceConstraints.class | class} declared by every shape
	 * reached through {@link parents}, transitively, deduplicated and in inheritance order. Read it to test a resource
	 * against a supertype without walking the inheritance chain.
	 *
	 * **Inheritance** — computed from the `class` of the extended shapes, not user-defined.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#ClassConstraintComponent SHACL § 4.1.1 sh:class}
	 */
	readonly classes?: readonly Reference[];

	/**
	 * Parent shapes this shape inherits from.
	 *
	 * Lists the shapes handed to the factory ahead of the member definitions, each possibly deferred to a
	 * {@link @metreeca/core!Lazy | lazy} factory. Inherited members and constraints are merged into the derived shape.
	 * When a child overrides an inherited property, constraints are enforced conjunctively: values must satisfy both
	 * the child's and all inherited constraints. This ensures overrides can only restrict, never relax, inherited
	 * definitions.
	 *
	 * > [!WARNING]
	 * > When inheriting from multiple shapes with different {@link ResourceConstraints.space | space} values, an
	 * > overriding namespace must be declared on the extending shape.
	 *
	 * **Inheritance** — structural; outside inheritance scope.
	 */
	readonly parents?: Parents;

	/**
	 * The {@link Member | members} constraining the resource.
	 *
	 * Each member constrains one field of the JSON-LD node object the shape describes: its `@id` (an {@link Id}), its
	 * `@type` (a {@link Type}), or a data or object {@link Property} keyed by a predicate IRI. At most one {@link Id}
	 * and one {@link Type} member are allowed, counted after inheritance merging: declarations sharing a property name
	 * collapse into a single member, so a marker reaching the shape through several parents or redeclared by the shape
	 * counts once, while markers of the same kind under distinct names are rejected.
	 *
	 * **Inheritance** — parent and child members are merged; clashing keys are merged per property rules.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#property-shapes SHACL § 2.3 Property Shapes}
	 */
	readonly members: { readonly [field: Identifier]: Member };


	/**
	 * Custom resource validators.
	 *
	 * When specified, all listed validators are applied during validation. Each validator reports violations as a
	 * {@link Trace}, returning `undefined` when the resource passes. Empty arrays are ignored.
	 *
	 * **Inheritance** — parent and child validators are merged; all apply.
	 *
	 * @remarks
	 *
	 * SHACL defines custom constraints via SPARQL; this library uses programmatic validators.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#constraints SHACL § 2.1.1 Constraint Components}
	 */
	readonly validators?: readonly Validator<Resource>[];

}

/**
 * Constraints for resource shape factories.
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.2 Node Shapes}
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
	 * **Inheritance** — child narrows the parent set; a widened set is reported as an error.
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
	 * A resource carries a single identifier, so a list of two or more values admits no resource at all.
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
 * Parent shapes accepted by the {@link resource} factory.
 *
 * Lists the shapes a resource inherits from, in the order they are declared ahead of the member definitions. Each
 * parent may be deferred to a {@link @metreeca/core!Lazy | lazy} factory, so mutually recursive shapes reference one
 * another without a definition cycle. An empty list describes a resource inheriting nothing.
 */
export type Parents = readonly Lazy<ResourceShape>[];

/**
 * Member definitions for a {@link ResourceShape} factory.
 *
 * Maps property names to their {@link Member} definitions. Property names must be valid
 * {@link @metreeca/core!Identifier | identifiers}; their effective IRIs are derived from the
 * enclosing shape's namespace unless explicit {@link PropertyConstraints.forward | forward} or
 * {@link PropertyConstraints.reverse | reverse} mappings are declared.
 */
export type Members = {

	readonly [member: Identifier]: Member

};

/**
 * A {@link ResourceShape} member.
 *
 * Constrains a single field of the JSON-LD node object the shape describes: its `@id` (an {@link Id}), its `@type`
 * (a {@link Type}), or a data or object {@link Property} identified by a predicate IRI. Accepted by the
 * {@link resource} factory, which tightens any {@link Namespace} `forward`/`reverse` mapping to an absolute IRI and
 * expands plain-string `name`/`description` labels to their localised form before storing it on the shape.
 */
export type Member =
	| Id
	| Type
	| Property;


/**
 * Shape definition for the resource identifier property.
 *
 * Tags a resource property as mapping to JSON-LD `@id`. Created by the {@link id} factory. At most one `id` member is
 * allowed per resource shape, counted after inheritance merging: declarations sharing a property name collapse into a
 * single member, so a marker reaching the shape through several parents or redeclared by the shape counts once, while
 * two `id` members under distinct names are rejected.
 *
 * > [!IMPORTANT]
 * > Rejected on embedded resource shapes during state validation, as embedded resources have no
 * > independent identity; the rejection surfaces when a nested resource state is checked, not at
 * > shape construction, since an id-bearing embedded range is indistinguishable from an expanded
 * > captive reference until then. A standalone {@link reference!reference | reference} target carries
 * > its own identifier and is unaffected.
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link ResourceShape.parents | parents},
 * identifier members are subject to the following rules.
 *
 * | Field    | Override Rule                                                                           |
 * | -------- | --------------------------------------------------------------------------------------- |
 * | `kind`   | Cannot be overridden                                                                    |
 * | `hidden` | Taken from the most derived declaration; among sibling parents, from the first declared |
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
	 * **Inheritance** — taken from the most derived declaration; among sibling parents, from the first declared.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly hidden?: boolean;

}

/**
 * Shape definition for the resource type property.
 *
 * Tags a resource property as mapping to JSON-LD `@type`. Created by the {@link type} factory. At most one `type`
 * member is allowed per resource shape, counted after inheritance merging: declarations sharing a property name
 * collapse into a single member, so a marker reaching the shape through several parents or redeclared by the shape
 * counts once, while two `type` members under distinct names are rejected.
 *
 * Unlike an {@link id} member, a `type` member is accepted on embedded resource shapes during both
 * state and template validation.
 *
 * > [!IMPORTANT]
 * > This property is system-managed: its value is derived from the
 * > {@link ResourceConstraints.class | class} constraint defined in the shape, and the member is active
 * > only on a shape declaring its own class. A class-less shape accepts the member but exposes no value
 * > through it, rejecting every supplied one. A shared supershape may therefore factor the member out for
 * > its descendants, each activating it by declaring a class of its own.
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link ResourceShape.parents | parents},
 * type members are subject to the following rules.
 *
 * | Field    | Override Rule                                                                           |
 * | -------- | --------------------------------------------------------------------------------------- |
 * | `kind`   | Cannot be overridden                                                                    |
 * | `hidden` | Taken from the most derived declaration; among sibling parents, from the first declared |
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
	 * **Inheritance** — taken from the most derived declaration; among sibling parents, from the first declared.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly hidden?: boolean;

}

/**
 * Shape definition for a resource property.
 *
 * Pairs a value range with optional IRI mappings, labels, and visibility flags. Created by the cardinality factories
 * ({@link required}, {@link optional}, {@link nonempty}, {@link multiple}) or by {@link property} for bounds they do
 * not cover.
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link ResourceShape.parents | parents},
 * members with matching keys are merged according to the following rules.
 *
 * | Field         | Override Rule                                                                          |
 * | ------------- | -------------------------------------------------------------------------------------- |
 * | `kind`        | Cannot be overridden                                                                   |
 * | `name`        | Cannot be overridden                                                                   |
 * | `description` | Cannot be overridden                                                                   |
 * | `forward`     | Cannot be overridden                                                                   |
 * | `reverse`     | Cannot be overridden                                                                   |
 * | `range`       | Delegated to {@link SetShape} merge rules                                              |
 * | `hidden`      | Inherited; conflicting parents without child override are reported as an error        |
 * | `computed`    | Inherited; conflicting parents without child override are reported as an error        |
 *
 * @typeParam R The value range type, defaulting to an unconstrained {@link SetShape}
 *
 * @see {@link https://www.w3.org/TR/shacl/#property-shapes SHACL § 2.3 Property Shapes}
 */
export interface Property<R extends SetShape = SetShape> extends PropertyConstraints<R> {

	/**
	 * Discriminator identifying this as a property shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "property";

	/**
	 * Human-readable name for the property.
	 *
	 * Always a localised map: a plain-text {@link PropertyConstraints.name | shorthand} handed to the factory is
	 * expanded to `{ en: <value> }`.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (no label)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 2.3.2.1 sh:name}
	 */
	readonly name?: Dictionary;

	/**
	 * Human-readable description of the property.
	 *
	 * Always a localised map: a Markdown {@link PropertyConstraints.description | shorthand} handed to the factory is
	 * expanded to `{ en: <value> }`.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (no description)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 2.3.2.1 sh:description}
	 */
	readonly description?: Dictionary;


	/**
	 * The absolute IRI identifying the property for direct mapping.
	 *
	 * > [!IMPORTANT]
	 * > Both `forward` and {@link reverse} mappings write actual property values. This is independent from
	 * > {@link reference!ReferenceConstraints.foreign | foreign}, which marks a reference as a read-only view over
	 * > mappings owned by another property.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @see {@link https://www.w3.org/TR/json-ld11/#iris JSON-LD 1.1 § 3.2 IRIs}
	 */
	readonly forward?: Reference;

	/**
	 * The absolute IRI identifying the property for inverse mapping.
	 *
	 * > [!IMPORTANT]
	 * > Both {@link forward} and `reverse` mappings write actual property values. This is independent from
	 * > {@link reference!ReferenceConstraints.foreign | foreign}, which marks a reference as a read-only view over
	 * > mappings owned by another property.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (no inverse mapping)
	 *
	 * @see {@link https://www.w3.org/TR/json-ld11/#reverse-properties JSON-LD 1.1 § 4.8 Reverse Properties}
	 */
	readonly reverse?: Reference;


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
 * 1. The shape's own {@link ResourceConstraints.space}
 * 2. The common inherited namespace from parent shapes
 * 3. The default {@link defaultNamespace} namespace
 *
 * @typeParam R The value range type threaded from the {@link property} factory, defaulting to an
 *   unconstrained {@link SetShape}
 *
 * @see {@link https://www.w3.org/TR/shacl/#property-shapes SHACL § 2.3 Property Shapes}
 */
export interface PropertyConstraints<R extends SetShape = SetShape> {

	/**
	 * Discriminator identifying the value produced by the property factories.
	 *
	 * Absent from a bare constraints argument; set to `"property"` on the factory's result, so that a property member
	 * is told apart from an {@link Id} or {@link Type} marker.
	 */
	readonly kind?: "property";

	/**
	 * Value range for this property.
	 *
	 * Absent from a bare constraints argument; carried on the factory's result to thread the range
	 * type. Computed by the {@link resource} factory from the member definitions. **Inheritance** —
	 * delegated to {@link SetShape} merge rules.
	 */
	readonly range?: R;

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
	 * > {@link reference!ReferenceConstraints.foreign | foreign}, which marks a reference as a read-only view over
	 * > mappings owned by another property.
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
	 * > {@link reference!ReferenceConstraints.foreign | foreign}, which marks a reference as a read-only view over
	 * > mappings owned by another property.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (no inverse mapping)
	 *
	 * @see {@link https://www.w3.org/TR/json-ld11/#reverse-properties JSON-LD 1.1 § 4.8 Reverse Properties}
	 */
	readonly reverse?: Reference | Namespace;

}


//// Factory Arguments /////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Property constraints admitting explicit cardinality bounds.
 *
 * Extends {@link PropertyConstraints} with the bounds the four named cardinality factories fix, so that
 * {@link property} states a cardinality they do not cover.
 */
export interface PropertyBounds extends PropertyConstraints {

	/**
	 * Minimum number of expected values.
	 *
	 * @defaultValue `undefined` (no minimum constraint, equivalent to 0)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinCountConstraintComponent SHACL § 4.2.1 sh:minCount}
	 */
	readonly minCount?: undefined | number;

	/**
	 * Maximum number of expected values.
	 *
	 * @defaultValue `undefined` (no maximum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxCountConstraintComponent SHACL § 4.2.2 sh:maxCount}
	 */
	readonly maxCount?: undefined | number;

}

/**
 * Resolves a cardinality bound from stated property constraints.
 *
 * Yields the bound where the constraints state one and `undefined` where they do not, so a property built from
 * constraints carries the bound it was given rather than the widest one.
 *
 * @typeParam C The stated constraints
 * @typeParam K The bound to resolve
 */
export type Bound<C extends PropertyBounds, K extends "minCount" | "maxCount"> =
	K extends keyof C
		? C[K] extends undefined | number ? C[K] : undefined
		: undefined;


//// Type Inference ////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Assembles the per-key template prototype backing a {@link ResourceShape.model | resource's model}.
 *
 * Maps every declared {@link Member} to its template-side {@link Slot} projection, producing the
 * complete template stored on the shape at runtime. Surfaces in the {@link resource} factory's
 * return type as the full, authoritative template.
 *
 * Members whose cardinality admits absence are {@link Relaxed | relaxed} to optional keys, so a value
 * literal may omit them; every other member stays a required key.
 *
 * @typeParam E The members record type
 */
export type Prototype<E extends Members> = Relaxed<{

	readonly [K in keyof E]: Slot<E[K]>

}>;

/**
 * Narrows locally-declared members against an inherited template, flagging incompatible overrides.
 *
 * Retains each member whose key is also inherited only when its {@link Slot} projection is assignable to the
 * {@link Narrowings} expansion of the inherited property type; a mismatch collapses to `never`, surfacing the
 * conflict at the {@link resource} call site as a type error on the offending member. Members with keys not present
 * on the parent pass through unchanged. Enforces the rule that overrides may restrict inherited constraints but never
 * relax them.
 *
 * For inherited union slots, {@link Narrowings} expands the comparison to also accept the new narrowing forms
 * permitted at extends-time: a non-union value shape that narrows a parent variant (Form 1 single-variant narrowing)
 * and a union whose variants each narrow a distinct parent variant (Form 2 subsetting). Type-level acceptance is
 * intentionally permissive: a child variant that narrows no parent variant, several, or the same parent as another
 * child variant compiles but throws at runtime.
 *
 * @typeParam E The local members record type
 * @typeParam I The inherited template model type produced by {@link Inheritance}
 */
export type Override<E extends Members, I> = {

	[K in keyof E]: K & string extends keyof I
		? Slot<E[K]> extends Narrowings<I[K & string]> ? E[K] : never
		: E[K]

};

/**
 * Expands an inherited slot type into the union of its valid narrowings.
 *
 * Used by {@link Override} on the *parent* side of the assignability check: the helper widens the inherited type so
 * that the new union-narrowing inheritance forms — {@link union!UnionShape | union}-derived indexed-record models
 * being subsetted (Form 2) or replaced by a single variant (Form 1) — pass the structural compatibility test that
 * gates resource extension.
 *
 * Indexed-record models projected from union slots are expanded into the disjunction of:
 *
 * - the exact record (Form 2 full retention);
 * - the partial record (Form 2 subsetting);
 * - each variant's value model (Form 1 single-variant narrowing).
 *
 * Tuple-wrapped indexed-record models (multi-valued ranges) are widened recursively through the singleton tuple. Any
 * other type passes through unchanged. Detection is purely structural (keys must all match `${number}`), so the
 * expansion only fires for indexed-union slots, leaving regular nested-resource and primitive slots intact.
 *
 * Type-level acceptance is intentionally permissive: kinds absent from the parent union are still rejected at compile
 * time, while a child variant narrowing no parent variant, several, or the same parent as another child variant
 * compiles but throws at runtime.
 *
 * The plural name denotes the resulting *set* of acceptable narrowings: any of the listed forms qualifies. From the
 * child author's perspective, the inheritance narrows the parent; from the type checker's perspective, the parent's
 * expansion accepts the child's slot.
 *
 * @typeParam T The inherited slot type to expand
 */
export type Narrowings<T> =
	T extends readonly [infer Inner]
		? readonly [Narrowings<Inner>]
		: keyof T extends never ? T
			: [keyof T] extends [`${number}`]
				? T | Partial<T> | T[keyof T & `${number}`]
				: T;

/**
 * Projects a {@link Member} to the template-side value type it contributes to {@link Prototype}.
 *
 * Routes {@link Id} and {@link Type} markers to {@link @metreeca/qest!Reference | Reference} and ranged members to
 * their range's template model, which already carries cardinality-driven optionality and the scalar-versus-tuple
 * distinction. Feeds both {@link Prototype} assembly (where the projection supplies the value type of the resource's
 * `model`, relaxed to an optional key when it admits absence) and {@link Override} assignability (where the inherited
 * side is expanded via {@link Narrowings} so the new union-narrowing inheritance forms are accepted).
 *
 * @typeParam E The member type
 */
export type Slot<E extends Member> =
	E extends Id | Type ? Reference
		: Range<E> extends SetShape ? Range<E>["model"]
			: never;

/**
 * Resolves the inherited template contributed by a resource's {@link Parents | parent shapes}.
 *
 * Reads each parent shape's complete template via {@link Schema}, merges the contributions
 * across multiple parents via {@link Intersected}, and strips index signatures via {@link Declared} so that
 * {@link Override} checks against concrete inherited members only. Yields `{}` when no parent is declared.
 *
 * @typeParam P The parent shapes to inspect
 */
export type Inheritance<P extends Parents> =
	P extends readonly [] ? {}
		: Declared<Intersected<Schema<P[number]>>>;

/**
 * Composes the resource model from local members and inherited template.
 *
 * Locally-redeclared keys are taken from {@link Prototype | Prototype<E>}: the child slot replaces the inherited
 * contribution wholesale; non-overridden inherited keys flow through from {@link Inheritance | Inheritance<P>}.
 * Mirrors at the type level the override semantics enforced by {@link resource} on the runtime side. The result is
 * {@link Merged | merged} into a single flat property list, so local and inherited members read alike and both keep
 * the optional keys {@link Relaxed} assigns to members admitting absence.
 *
 * @remarks
 *
 * Subtracting `keyof E` from the inherited side before intersection is required because TypeScript intersection is
 * order-insensitive: without the subtraction the parent's contribution is retained alongside the child's narrowing,
 * leaving residue such as `string & { readonly "0": string; readonly "1": Locales }` on slots narrowed via
 * single-variant {@link union!UnionShape | union} narrowing (Form 1).
 *
 * @typeParam E The local members record type
 * @typeParam P The parent shapes providing the inherited template via {@link Inheritance}
 */
export type Composition<E extends Members, P extends Parents> = Merged<
	& Prototype<E>
	& Omit<Inheritance<P>, keyof E>
>;

/**
 * Projects a {@link Member} to its state-side runtime value type.
 *
 * Routes {@link Id} and {@link Type} markers to {@link @metreeca/qest!Reference | Reference}
 * and ranged members to the range's value type conditioned on cardinality: a scalar when
 * `maxCount === 1`, a read-only array otherwise, unioned with `undefined` whenever `minCount`
 * admits absence.
 *
 * @typeParam E The member type
 */
export type Content<E extends Member> =
	E extends Id | Type ? Reference
		: Range<E> extends SetShape<infer S, infer L, infer U>
			? (L extends undefined | 0 ? undefined : never) | (U extends 1 ? State<S> : readonly State<S>[])
			: never;

/**
 * Extracts the {@link SetShape} range carried by a {@link Member}.
 *
 * Returns the declared range for {@link Property} members; resolves to `never` for marker members
 * ({@link Id}, {@link Type}), which carry no range.
 *
 * @typeParam E The member type
 */
export type Range<E extends Member> =
	E extends PropertyConstraints<infer R> ? R : never;


/**
 * Relaxes the keys of an object type into optional keys wherever the value type admits absence.
 *
 * Marks every key whose type includes `undefined` as an optional key and leaves the rest required,
 * so a value literal spells out only the entries it actually carries instead of padding absent ones
 * with `undefined`. Reading is unaffected: an omitted key still yields `undefined`.
 *
 * Used by {@link Prototype} to relax template members whose cardinality admits absence. The
 * modifiers are carried into {@link value!State | State} by {@link @metreeca/qest!Slots | Slots},
 * which preserves them as it projects the template, so nested and inherited members relax alongside
 * local ones.
 *
 * @remarks
 *
 * Apply to an already projected template rather than folding the `undefined` test into the
 * projection itself: repeating the projection inside the key filter multiplies its instantiation
 * depth and exhausts the compiler's recursion budget on deeply nested shapes.
 *
 * @typeParam P The object type to relax
 */
export type Relaxed<P> = Merged<
	& { [K in keyof P as undefined extends P[K] ? never : K]: P[K] }
	& { [K in keyof P as undefined extends P[K] ? K : never]?: P[K] }
>;

/**
 * Strips index signatures from a record type, keeping only explicitly declared entries.
 *
 * Retains entries with literal string or symbol keys and drops broad `string` or `number` index
 * signatures, isolating the concrete entries a type actually declares. Used by
 * {@link Inheritance} to expose only the inherited keys that {@link Override} is expected to
 * assign against.
 *
 * @typeParam T The type to strip
 */
export type Declared<T> = {

	[K in keyof T as string extends K ? never : number extends K ? never : K]: T[K]

};

/**
 * Collapses a union type into the intersection of its members.
 *
 * Uses contravariant function-parameter inference to turn `A | B | C` into `A & B & C`. Used
 * by {@link Inheritance} to merge the templates inferred from multiple parent shapes into a
 * single object carrying every inherited property.
 *
 * @typeParam U The union type to collapse
 */
export type Intersected<U> =
	(U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

/**
 * Collapses an intersection of object types into a single object type.
 *
 * Re-maps every key of the intersection onto one object, so the composed type is seen and hovered
 * as a single property list rather than as an `A & B` spelling. Presents every key as `readonly`,
 * preserving the optional key modifiers assigned by {@link Relaxed}. Used by {@link Relaxed} and
 * {@link Composition} to present their assembled templates as flat models.
 *
 * @remarks
 *
 * The `readonly` modifier is restated rather than inherited: mapping over an intersection drops
 * the source modifiers, so a homomorphic re-map alone would yield a mutable model.
 *
 * @typeParam T The intersection type to merge
 */
export type Merged<T> = {

	readonly [K in keyof T]: T[K]

};


//// Factories /////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Argument accepted by the {@link resource} factory.
 *
 * Covers the three positional roles the factory reads: a leading parent shape, the member definitions, and the
 * trailing shape constraints.
 */
type Argument =
	| Lazy<ResourceShape>
	| Members
	| ResourceConstraints;

/**
 * Creates a resource shape from parent shapes and property definitions.
 *
 * Accepts {@link Member} values: {@link Property} definitions produced by the cardinality factories or by
 * {@link property}, and {@link Id}/{@link Type} markers. Parent shapes are declared
 * ahead of the definitions, each possibly deferred to a {@link @metreeca/core!Lazy | lazy} factory; property IRIs are
 * resolved against {@link defaultNamespace} unless a parent declares a namespace. Use the constraints overload to
 * declare a different default namespace, a target class, identifier patterns, or resource-level validators.
 *
 * > [!TIP]
 * > `name: required(string())` is equivalent to `name: property(required(string()))`.
 *
 * > [!TIP]
 * > Parent shapes are recursively flattened and merged into the returned shape. Consumers can work with the result
 * > directly without traversing the inheritance chain. The parent list is retained on
 * > {@link ResourceShape.parents | parents} for reference, but all inherited constraints are already resolved.
 *
 * > [!NOTE]
 * > This function is idempotent: the returned shape is branded and won't be re-flattened if used
 * > as a parent in another shape.
 *
 * @typeParam P The parent shapes, used to infer the inherited model
 * @typeParam E The members record type
 *
 * @param args The parent shapes to inherit from, followed by the definitions mapping property names to members
 *
 * @returns An immutable resource shape with inherited members flattened and merged
 *
 * @throws {TraceError} If member definitions are invalid (for example, duplicate `id`/`type` markers) or inherited
 * constraints are incompatible
 *
 * @example
 *
 * ```typescript
 * // without inheritance
 * const Person = resource({
 *   name: required(string()),
 *   age: optional(integer(), { hidden: true })
 * });
 *
 * // with inheritance
 * const Employee = resource(Person, {
 *   department: required(string())
 * });
 * ```
 */
export function resource<const P extends Parents, E extends Members>(
	...args: [ ...parents: P, entries: E & Override<E, Inheritance<P>> ]
): Omit<ResourceShape, "model"> & { readonly model: Composition<E, P> };

/**
 * Creates a resource shape from parent shapes, property definitions and constraints.
 *
 * Behaves as the bare overload, with a trailing `constraints` argument declaring a custom namespace, a target class,
 * identifier patterns, or resource-level validators. Validators are typed against the composed model, so a validator
 * reads inherited members alongside local ones.
 *
 * @typeParam P The parent shapes, used to infer the inherited model
 * @typeParam E The members record type
 *
 * @param args The parent shapes to inherit from, followed by the member definitions and the shape constraints
 *
 * @returns An immutable resource shape with inherited constraints and members flattened and merged
 *
 * @throws {TraceError} If member definitions are invalid or inherited constraints are incompatible
 *
 * @example
 *
 * ```typescript
 * // without inheritance
 * const Person = resource({
 *   name: required(string())
 * }, {
 *   space: schema
 * });
 *
 * // with inheritance
 * const Employee = resource(Person, {
 *   department: required(string())
 * }, {
 *   class: "https://schema.org/Employee"
 * });
 * ```
 */
export function resource<const P extends Parents, E extends Members>(
	...args: [ ...parents: P, entries: E & Override<E, Inheritance<P>>, constraints: ResourceConstraints & {
		readonly validators?: readonly Validator<Composition<E, P>>[]
	} ]
): Omit<ResourceShape, "model"> & { readonly model: Composition<E, P> };

/**
 * Creates resource shapes.
 */
export function resource(...args: readonly Argument[]): ResourceShape {

	type Sources = { readonly [entry: Identifier]: Id | Type | PropertyConstraints };
	type Properties = { readonly [member: Identifier]: Member };


	const parents = args.filter(isParent);
	const [ members, constraints = {} ] = args.filter(isDeclaration);

	if ( members === undefined || !isMembers(members) ) {
		throw new TypeError(`malformed member definitions <${JSON.stringify(members)}>`);
	}

	if ( !isConstraints(constraints) ) {
		throw new TypeError(`malformed shape constraints <${JSON.stringify(constraints)}>`);
	}

	const { name, description, ...labelless } = constraints;

	const namespace = locate(parents, constraints.space);
	const resolved = resolve(normalize(members, parents), namespace);

	return flatten({

		kind: "resource",
		model: build(resolved, parents),

		...labelless,

		...parents.length > 0 && { parents },

		...name !== undefined && { name: localize(name) },
		...description !== undefined && { description: localize(description) },

		members: resolved

	});


	/**
	 * Checks that an argument declares a parent shape.
	 *
	 * @param argument The factory argument to inspect
	 *
	 * @returns `true` if `argument` is a resource shape or a factory deferring one; `false` otherwise
	 */
	function isParent(argument: Argument): argument is Lazy<ResourceShape> {
		return isFunction(argument) || "kind" in argument && argument.kind === "resource";
	}

	/**
	 * Checks that an argument declares members or constraints rather than a parent shape.
	 *
	 * @param argument The factory argument to inspect
	 *
	 * @returns `true` unless `argument` is a parent shape
	 */
	function isDeclaration(argument: Argument): argument is Members | ResourceConstraints {
		return !isParent(argument);
	}

	/**
	 * Checks that a declaration lists resource members.
	 *
	 * @param declaration The declaration to inspect
	 *
	 * @returns `true` if every value of `declaration` is a {@link Member}; `false` otherwise
	 */
	function isMembers(declaration: Members | ResourceConstraints): declaration is Members {
		return Object.values(declaration).every(isMember);
	}

	/**
	 * Checks that a declaration lists shape constraints.
	 *
	 * @param declaration The declaration to inspect
	 *
	 * @returns `true` if no value of `declaration` is a {@link Member}; `false` otherwise
	 */
	function isConstraints(declaration: Members | ResourceConstraints): declaration is ResourceConstraints {
		return !Object.values(declaration).some(isMember);
	}

	/**
	 * Checks that a value defines a resource member.
	 *
	 * @param value The value to inspect
	 *
	 * @returns `true` if `value` is a marker or a property definition; `false` otherwise
	 */
	function isMember(value: unknown): value is Member {
		return isObject(value) && "kind" in value
			&& (value.kind === "id" || value.kind === "type" || value.kind === "property" || value.kind === "set");
	}


	/**
	 * Expands a localisable label to its dictionary form.
	 *
	 * @param label The declared label, either a localised dictionary or a string taken as English content
	 *
	 * @returns `label` unchanged when already a dictionary; `{ en: label }` otherwise
	 */
	function localize(label: string | Dictionary): Dictionary {
		return isString(label) ? { en: label } : label;
	}

	/**
	 * Identifies the effective namespace for property IRI resolution.
	 *
	 * @param parents The parent shapes the namespace may be inherited from
	 * @param space The namespace declared by the shape, if any
	 *
	 * @returns The effective namespace, resolved in order: declared → inherited → app
	 */
	function locate(parents: Parents, space: undefined | Namespace): Namespace {

		if ( space !== undefined ) {

			return space;

		} else {

			// conflicts validated later by flatten() using flattened parent namespaces

			return parents.map(parent => eager(parent).space)[0] ?? defaultNamespace;

		}

	}

	/**
	 * Completes members with the predicate mappings they inherit.
	 *
	 * A property declaring neither `forward` nor `reverse` takes the mapping of the member it overrides, so an
	 * override restates the range alone and keeps pointing at the inherited predicate. Singleton markers are counted
	 * over the inherited and local members collapsed by property name: a marker reaching the child under the same
	 * name through several parents, or redeclared by the child over the inherited one, counts once. Override
	 * compatibility is settled elsewhere: `narrowsResource` rejects an overriding member that changes the inherited
	 * kind.
	 *
	 * @param entries The member definitions to normalise
	 * @param parents The parent shapes for inheritance-aware duplicate detection
	 *
	 * @returns Members carrying their inherited predicate mappings
	 *
	 * @throws {TraceError} If two markers of the same kind are declared under distinct property names
	 */
	function normalize(entries: Members, parents: Parents): Sources {

		const bases: Properties[] = parents.map(parent => eager(parent).members);

		const merged: Members = [...bases, entries].reduce((collapsed, source) => ({ ...collapsed, ...source }), {});

		const trace = checkSingletons(Object.values(merged));

		if ( trace !== undefined ) {
			throw new TraceError("duplicate singleton entries", trace);
		}

		return Object.fromEntries(Object.entries(entries).map(([name, entry]) => {

			const base = bases.reduce<Member | undefined>((found, b) => found ?? b[name], undefined);

			if ( entry.kind === "property"
				&& entry.forward === undefined && entry.reverse === undefined
				&& base !== undefined && base.kind === "property"
				&& (base.forward !== undefined || base.reverse !== undefined)
			) {

				return [name, immutable({

					...entry,

					...base.forward !== undefined && { forward: base.forward },
					...base.reverse !== undefined && { reverse: base.reverse }

				})];

			} else {

				return [name, entry];

			}

		}));
	}

	/**
	 * Resolves namespace functions to concrete IRIs for property mappings and expands shorthand labels.
	 *
	 * When neither `forward` nor `reverse` is defined, generates a default forward IRI using the effective namespace.
	 *
	 * @param properties The members to resolve
	 * @param namespace The effective namespace for default forward resolution
	 *
	 * @returns Properties with `forward` and `reverse` resolved to IRIs and `name` and `description` in dictionary form
	 */
	function resolve(properties: Sources, namespace: Namespace): Properties {

		return Object.fromEntries(Object.entries(properties).map(([name, property]) => {

			if ( property.kind === "id" || property.kind === "type" ) {

				return [name, property];

			} else {

				const forward = isString(property.forward) ? assert(property.forward, isIRI) // IRI
					: property.forward ? assert(property.forward[name], isIRI) // namespace
						: undefined;

				const reverse = isString(property.reverse) ? assert(property.reverse, isIRI) // IRI
					: property.reverse ? assert(property.reverse[name], isIRI) // namespace
						: undefined;


				return [name, {

					...property,

					...property.name !== undefined && { name: localize(property.name) },
					...property.description !== undefined && { description: localize(property.description) },

					// generate default forward when neither forward nor reverse is defined

					forward: forward === undefined && reverse === undefined
						? assert(namespace[name], isIRI)
						: forward,

					reverse

				}];

			}

		})) as Properties;
	}

	/**
	 * Builds a representative model value from property definitions.
	 *
	 * Constructs an immutable object where each property contains a model value derived from its range:
	 * scalar if `maxCount === 1`, array otherwise; unions produce records mapping each variant's index to its model.
	 *
	 * When parent shapes are provided, their models are merged before applying local members, so local
	 * definitions override inherited ones. Parent models already contain transitive inherited members.
	 *
	 * @param properties The resolved property definitions
	 * @param parents The parent shapes whose models should be inherited
	 *
	 * @returns An immutable resource model
	 */
	function build(properties: Properties, parents: Parents): Template {

		const inherited = parents
			.map(parent => eager(parent).model)
			.reduce((inherited, model) => ({ ...model, ...inherited }), {});

		return immutable({
			...inherited,
			...Object.fromEntries(Object.entries(properties).map(([name, property]) =>
				[name, property.kind === "id" || property.kind === "type" ? app : property.range.model]
			))
		});

	}

}


/**
 * Creates a marker for the resource identifier property.
 *
 * Tags the enclosing property as mapping to JSON-LD `@id`. At most one `id` marker is allowed per resource shape,
 * counted after inheritance merging: markers sharing a property name collapse into a single member, so a marker
 * reaching the shape through several parents or redeclared by the shape counts once, while two `id` markers under
 * distinct property names are rejected. The resulting property has implicit `0..1` cardinality and accepts a single
 * absolute IRI value.
 *
 * @param constraints The identifier property constraints
 * @param constraints.hidden Excludes the property from default serialisation
 *
 * @returns An immutable {@link Id} marker for the resource identifier property
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
 * Creates a marker for the resource type property.
 *
 * Tags the enclosing property as mapping to JSON-LD `@type`. At most one `type` marker is allowed per resource shape,
 * counted after inheritance merging: markers sharing a property name collapse into a single member, so a marker
 * reaching the shape through several parents or redeclared by the shape counts once, while two `type` markers under
 * distinct property names are rejected. The resulting property has implicit `0..1` cardinality and is system-managed:
 * its value is derived from the {@link ResourceConstraints.class | class} constraint, so the marker is active only on
 * a shape declaring its own class and a class-less shape rejects every supplied value. A shared supershape may thus
 * factor the marker out for its descendants, each activating it by declaring a class of its own.
 *
 * @param constraints The type property constraints
 * @param constraints.hidden Excludes the property from default serialisation
 *
 * @returns An immutable {@link Type} marker for the resource type property
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
 * Creates a property accepting any number of values (0..*).
 *
 * Admits zero or more values, projecting the range model to an optional array (`undefined | readonly V[]`).
 *
 * > [!WARNING]
 * > For {@link dictionary!DictionaryShape | dictionary} ranges, each tag in the map holds a string array.
 * > `minCount`/`maxCount` apply **per tag**, not as an aggregate across all tags. This differs from vanilla SHACL
 * > aggregate counting, though expressible via per-tag property shapes.
 *
 * @typeParam R The value range shape
 * @typeParam C The stated property constraints
 *
 * @param range The value range for this property
 * @param constraints Property constraints including IRI mappings, labels, and visibility flags
 *
 * @returns An immutable {@link Property} admitting any number of values of `range`
 */
export function multiple<R extends Lazy<Shape>, const C extends PropertyConstraints = {}>(
	range: R,
	constraints?: C
): NoInfer<C> & Property<SetShape<R, undefined, undefined>> {

	return build(range, constraints, undefined, undefined);

}

/**
 * Creates a property requiring at least one value (1..*).
 *
 * Requires one or more values, projecting the range model to a non-empty array (`readonly [V, ...V[]]`).
 *
 * > [!WARNING]
 * > For {@link dictionary!DictionaryShape | dictionary} ranges, each tag in the map holds a non-empty string array
 * > and the map must contain at least one tag. `minCount`/`maxCount` apply **per tag**, not as an aggregate across
 * > all tags. This differs from vanilla SHACL aggregate counting, though expressible via per-tag property shapes.
 *
 * @typeParam R The value range shape
 * @typeParam C The stated property constraints
 *
 * @param range The value range for this property
 * @param constraints Property constraints including IRI mappings, labels, and visibility flags
 *
 * @returns An immutable {@link Property} requiring at least one value of `range`
 */
export function nonempty<R extends Lazy<Shape>, const C extends PropertyConstraints = {}>(
	range: R,
	constraints?: C
): NoInfer<C> & Property<SetShape<R, 1, undefined>> {

	return build(range, constraints, 1, undefined);

}

/**
 * Creates a property accepting at most one value (0..1).
 *
 * Admits zero or one value, projecting the range model to an optional scalar (`undefined | V`).
 *
 * > [!WARNING]
 * > For {@link dictionary!DictionaryShape | dictionary} ranges, each tag in the map holds a single string.
 * > `minCount`/`maxCount` apply **per tag**, not as an aggregate across all tags. This differs from vanilla SHACL
 * > aggregate counting, though expressible via per-tag property shapes.
 *
 * @typeParam R The value range shape
 * @typeParam C The stated property constraints
 *
 * @param range The value range for this property
 * @param constraints Property constraints including IRI mappings, labels, and visibility flags
 *
 * @returns An immutable {@link Property} admitting at most one value of `range`
 */
export function optional<R extends Lazy<Shape>, const C extends PropertyConstraints = {}>(
	range: R,
	constraints?: C
): NoInfer<C> & Property<SetShape<R, undefined, 1>> {

	return build(range, constraints, undefined, 1);

}

/**
 * Creates a property requiring exactly one value (1..1).
 *
 * Requires exactly one value, projecting the range model to a required scalar (`V`).
 *
 * > [!WARNING]
 * > For {@link dictionary!DictionaryShape | dictionary} ranges, each tag in the map holds exactly one string and the
 * > map must contain at least one tag. `minCount`/`maxCount` apply **per tag**, not as an aggregate across all tags.
 * > This differs from vanilla SHACL aggregate counting, though expressible via per-tag property shapes.
 *
 * @typeParam R The value range shape
 * @typeParam C The stated property constraints
 *
 * @param range The value range for this property
 * @param constraints Property constraints including IRI mappings, labels, and visibility flags
 *
 * @returns An immutable {@link Property} requiring exactly one value of `range`
 */
export function required<R extends Lazy<Shape>, const C extends PropertyConstraints = {}>(
	range: R,
	constraints?: C
): NoInfer<C> & Property<SetShape<R, 1, 1>> {

	return build(range, constraints, 1, 1);

}

/**
 * Creates a property with stated cardinality bounds.
 *
 * Reads the cardinality off {@link PropertyBounds.minCount | minCount} and
 * {@link PropertyBounds.maxCount | maxCount}, for the bounds the four named factories do not cover; an unstated
 * bound leaves that end unconstrained. The property's forward IRI is generated by the enclosing {@link resource}
 * factory by resolving the property name against the effective namespace.
 *
 * @remarks
 *
 * The `forward` and `reverse` fields accept plain strings for convenience; they are converted to {@link IRI} values
 * internally. Likewise, `name` and `description` accept plain strings as a shorthand for English-only labels; both
 * reach their localised form only once the enclosing {@link resource} factory resolves the property.
 *
 * @typeParam R The value range shape
 * @typeParam C The stated property constraints and cardinality bounds
 *
 * @param range The value range for this property
 * @param constraints Property constraints including cardinality bounds, IRI mappings, and labels
 *
 * @returns An immutable {@link Property} admitting the stated number of values of `range`
 *
 * @throws {@link !TypeError TypeError} If `minCount` or `maxCount` is negative, or if `minCount` exceeds `maxCount`
 *
 * @example
 *
 * ```typescript
 * const Product = resource({
 *   tags: property(string(), { minCount: 2, maxCount: 5 })
 * });
 * ```
 */
export function property<R extends Lazy<Shape>, const C extends PropertyBounds = {}>(
	range: R,
	constraints?: C
): NoInfer<C> & Property<SetShape<R, Bound<C, "minCount">, Bound<C, "maxCount">>> {

	return build(range, constraints, constraints?.minCount, constraints?.maxCount);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Assembles a property from a range, its constraints and its cardinality bounds.
 *
 * @typeParam P The property type the factory states
 *
 * @param range The value range for the property
 * @param constraints The stated property constraints, less the cardinality bounds
 * @param lower Minimum number of expected values
 * @param upper Maximum number of expected values
 *
 * @returns An immutable property over `range`, carrying `constraints` and the given bounds
 *
 * @throws {@link !TypeError TypeError} If `lower` or `upper` is negative, or if `lower` exceeds `upper`
 */
function build<P>(
	range: Lazy<Shape>,
	constraints: undefined | PropertyBounds,
	lower: undefined | number,
	upper: undefined | number
): P {

	const { minCount, maxCount, ...stated } = constraints ?? {};

	return immutable({

		kind: "property",

		...stated,

		range: buildValues(range, lower, upper)

	}) as P; // ;(cast) the overloads fix the property type each factory states

}
