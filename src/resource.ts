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
 * > Resource shapes are **closed**: validated resources may only contain entries explicitly
 * > defined in the shape. Any additional entries will cause validation to fail.
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
 * import { required, optional, repeatable } from '@metreeca/blue/value';
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
 *   tags: repeatable(string())
 * });
 * ```
 *
 * **Properties and Ranges**
 *
 * Ranges define cardinality constraints for property values:
 *
 * ```typescript
 * import { required, optional, multiple, repeatable, cardinality } from '@metreeca/blue/value';
 * import { string } from '@metreeca/blue/string';
 * import { resource } from '@metreeca/blue/resource';
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
 * Naked ranges are automatically wrapped in a {@link property}; use the explicit {@link property}
 * factory when IRI mappings or labels are needed:
 *
 * ```typescript
 * import { required } from '@metreeca/blue/value';
 * import { string } from '@metreeca/blue/string';
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
 * Resource entries link to other resources in two ways. A
 * {@link reference!reference | reference} wrapper links to a **standalone resource**, an
 * independently identified and managed entity. A direct shape inclusion defines an
 * **embedded resource**, a nested object with no independent identity, created and managed
 * together with its parent.
 *
 * > [!NOTE]
 * > An embedded resource shape may not carry an {@link id} entry: embedded resources have no
 * > independent identity, so a nested resource state bearing an identifier is rejected during state
 * > validation rather than at shape construction, since an id-bearing embedded range is
 * > indistinguishable from an expanded captive reference until a state is checked against it. A
 * > {@link type} entry is accepted and validated in both state and template retrieval.
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
 * write any mappings on insert. During resource validation, foreign reference entries are
 * rejected; during template validation they are accepted for data retrieval.
 *
 * **Embedded versus Captive Resources**
 *
 * **Embedded resources** have no independent identity or lifecycle and are always managed as part
 * of their parent. An embedded resource shape may not carry an {@link id} entry: the rejection is
 * enforced during state validation rather than at shape construction, since an id-bearing embedded
 * range is indistinguishable from an expanded captive reference until a resource state is checked
 * against it. A {@link type} entry is accepted and validated in both state and template retrieval.
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
 * Extend parent shapes to inherit entries and constraints:
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
 * const Employee = resource({ extends: NamedEntity }, {
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
 * > [!WARNING]
 * > Constraints that can be expressed in the type system — such as non-empty set requirements on
 * > `in`, `hasValue`, `languageIn`, and `validators` — are enforced at compile time and not
 * > re-validated at runtime.
 *
 * **Narrowing union slots**
 *
 * When a parent declares a {@link union!union | union}-typed slot, an extending shape may drop variants and tighten the
 * variants it keeps, but never add new ones. Narrowing takes one of two forms:
 *
 * 1. **Single-variant narrowing** (Form 1) — the child supplies a non-union value shape that narrows exactly one of
 *    the parent's variants (by `kind`, only-tightening constraints, a matching `datatype` for `string` / `number`, and
 *    a matching target shape for `reference` or a subtype `class` for `resource`). The merged slot becomes a bare value
 *    shape; consumers see the variant's plain model rather than the union's variant-keyed model.
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
 * const Vendor = resource({ extends: Entity }, {
 *   code: required(string({ model: "ABC", pattern: "^[A-Z]" }))
 * });
 *
 * // Form 2 — keeps the union but drops the string variant wholesale
 * const Numbered = resource({ extends: Entity }, {
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
 * Use {@link union!union | union} for entries accepting multiple value types. Variants are
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
 * @see {@link https://www.w3.org/TR/shacl/ SHACL — Shapes Constraint Language}
 * @see {@link https://www.w3.org/TR/shacl/#ClosedConstraintComponent SHACL § 4.8.1 sh:closed}
 */

import { assert, type Identifier, isString, type Lazy } from "@metreeca/core";
import { createNamespace, type IRI, isIRI, type Namespace } from "@metreeca/core/resource";
import { immutable } from "@metreeca/core/structures";
import { type Trace, TraceError, type Validator } from "@metreeca/core/trace";
import { app } from "@metreeca/qest";
import type { Dictionary, Reference, Resource } from "@metreeca/qest/resource";
import type { Template } from "@metreeca/qest/template";
import { checkSingletons, flatten } from "./resource.core.js";
import { eager, type Schema, type SetShape, type State } from "./value.js";

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
 * Used as the fallback when neither {@link ResourceConstraints.namespace} nor any inherited
 * namespace is declared on a resource shape.
 *
 * @see {@link ResourceConstraints.namespace}
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
 * > Resource shapes are **closed**: validated resources may only contain entries explicitly defined in the shape.
 * > Any additional entries will cause validation to fail.
 *
 * **Inheritance**
 *
 * When a resource shape extends a parent via {@link ResourceConstraints.extends | extends}, fields are merged
 * according to the following rules. The *child* is the extending shape; the *parent* is the inherited shape.
 *
 * | Field         | Override Rule                                                                           |
 * | ------------- | --------------------------------------------------------------------------------------- |
 * | `kind`        | Cannot be overridden                                                                    |
 * | `model`       | Computed from entries, not user-defined                                              |
 * | `virtual`     | Inherited; conflicting parents without child override are reported as an error          |
 * | `name`        | Always from child; not inherited                                                        |
 * | `description` | Always from child; not inherited                                                        |
 * | `namespace`   | Inherited; conflicting parents without child override are reported as an error          |
 * | `extends`     | Structural; outside inheritance scope                                                   |
 * | `class`       | Shape-specific target class; outside inheritance scope                                  |
 * | `classes`     | Union of parent `class` and child/parent `classes`                                      |
 * | `pattern`     | Child may replace trailing `/*` wildcard with more specific segments                    |
 * | `in`          | Intersection of parent and child sets; empty result is reported as an error             |
 * | `hasValue`    | Union of parent and child required values; child must require all parent values         |
 * | `validators`  | Union of parent and child validators; all apply                                         |
 * | `entries`  | Union; clashing keys merged per property rules; `kind` mismatch is reported as an error |
 *
 * **Cross-Field Validation**
 *
 * - all merged `hasValue` entries must be members of the merged `in` set (if defined)
 * - `forward` predicate IRIs must be unique across all entries
 * - `reverse` predicate IRIs must be unique across all entries
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
	 * Provides an immutable retrieval template matching this shape. When a shape extends parent shapes, inherited
	 * entries are merged into the template; local definitions override inherited ones. Entries whose cardinality
	 * admits absence are carried as optional keys, so a matching literal spells out only the entries it supplies.
	 * The runtime state type may be recovered via {@link @metreeca/qest!Instance | Instance}.
	 *
	 * **Inheritance** — computed from entries, not user-defined.
	 */
	readonly model: Template;


	/**
	 * Custom resource validators.
	 *
	 * When specified, all validators are applied during validation. Must be non-empty. Each validator reports
	 * violations as a {@link Trace}, returning `undefined` if the resource passes.
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
	 * The {@link Entry | entries} constraining the resource.
	 *
	 * Each entry constrains one field of the JSON-LD node object the shape describes: its `@id` (an {@link Id}), its
	 * `@type` (a {@link Type}), or a data or object {@link Property} keyed by a predicate IRI. At most one {@link Id}
	 * and one {@link Type} entry are allowed, counted after inheritance merging: declarations sharing a property name
	 * collapse into a single entry, so a marker reaching the shape through several parents or redeclared by the shape
	 * counts once, while markers of the same kind under distinct names are rejected.
	 *
	 * **Inheritance** — parent and child entries are merged; clashing keys are merged per property rules.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#property-shapes SHACL § 2.3.2 Property Shapes}
	 */
	readonly entries: { readonly [entry: Identifier]: Entry };

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
	 * **Inheritance** — always from child; not inherited.
	 *
	 * @remarks
	 *
	 * SHACL defines sh:name only for property shapes; extended here to node shapes.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 6.1.1 sh:name}
	 */
	readonly name?: Dictionary;

	/**
	 * Human-readable description of the shape.
	 *
	 * **Inheritance** — always from child; not inherited.
	 *
	 * @remarks
	 *
	 * SHACL defines sh:description only for property shapes; extended here to node shapes.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 6.1.2 sh:description}
	 */
	readonly description?: Dictionary;


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
	 * Inherited entries and constraints are merged into the derived shape. When a child overrides an inherited
	 * property, constraints are enforced conjunctively: values must satisfy both the child's and all inherited
	 * constraints. This ensures overrides can only restrict, never relax, inherited definitions.
	 *
	 * > [!WARNING]
	 * > When inheriting from multiple shapes with different {@link namespace} values, an overriding namespace must be
	 * > declared in this shape.
	 *
	 * **Inheritance** — structural; outside inheritance scope.
	 */
	readonly extends?: Lazy<ResourceShape> | readonly Lazy<ResourceShape>[];


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
	readonly class?: Reference;

	/**
	 * Ancillary class constraints for resource instances.
	 *
	 * Additional class IRIs that resource instances must conform to. Empty arrays are ignored.
	 *
	 * **Inheritance** — union of parent `class` and child/parent `classes`.
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#ClassConstraintComponent SHACL § 4.2.1 sh:class}
	 */
	readonly classes?: readonly Reference[];


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
	 * @see {@link https://www.w3.org/TR/shacl/#InConstraintComponent SHACL § 4.5.1 sh:in}
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
	 * @see {@link https://www.w3.org/TR/shacl/#HasValueConstraintComponent SHACL § 4.5.2 sh:hasValue}
	 */
	readonly hasValue?: readonly Reference[];

}


/**
 * A {@link ResourceShape} entry.
 *
 * Constrains a single field of the JSON-LD node object the shape describes: its `@id` (an
 * {@link Id}), its `@type` (a {@link Type}), or a data or object {@link Property} identified by a
 * predicate IRI.
 */
export type Entry =
	| Id
	| Type
	| Property;

/**
 * Shape definition for the resource identifier property.
 *
 * Tags a resource property as mapping to JSON-LD `@id`. Created by the {@link id} factory. At most one `id` entry is
 * allowed per resource shape, counted after inheritance merging: declarations sharing a property name collapse into a
 * single entry, so an entry reaching the shape through several parents or redeclared by the shape counts once, while
 * two `id` entries under distinct names are rejected.
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
 * When a {@link ResourceShape} extends a parent via {@link ResourceConstraints.extends | extends},
 * identifier entries are subject to the following rules.
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
 * entry is allowed per resource shape, counted after inheritance merging: declarations sharing a property name
 * collapse into a single entry, so an entry reaching the shape through several parents or redeclared by the shape
 * counts once, while two `type` entries under distinct names are rejected.
 *
 * Unlike an {@link id} entry, a `type` entry is accepted on embedded resource shapes during both
 * state and template validation.
 *
 * > [!IMPORTANT]
 * > This property is system-managed: its value is derived from the
 * > {@link ResourceConstraints.class | class} constraint defined in the shape, defaulting to
 * > `rdfs:Resource` when no class is declared. Client-supplied values, for instance in state
 * > updates, are silently ignored.
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link ResourceConstraints.extends | extends},
 * type entries are subject to the following rules.
 *
 * | Field    | Override Rule                                                                           |
 * | -------- | --------------------------------------------------------------------------------------- |
 * | `kind`   | Cannot be overridden                                                                    |
 * | `hidden` | Taken from the most derived declaration; among sibling parents, from the first declared |
 *
 * @see {@link https://www.w3.org/TR/json-ld11/#specifying-the-type JSON-LD 1.1 § 3.5 Specifying the Type}
 * @see {@link https://www.w3.org/TR/rdf-schema/#ch_resource RDF Schema 1.1 § 2.1 rdfs:Resource}
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
 * Pairs a value range with optional IRI mappings, labels, and visibility flags. Created by the
 * {@link property} factory, either explicitly or implicitly when a naked {@link SetShape} entry is
 * passed to the {@link resource} factory.
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link ResourceConstraints.extends | extends},
 * entries with matching keys are merged according to the following rules.
 *
 * | Field         | Override Rule                                                                          |
 * | ------------- | -------------------------------------------------------------------------------------- |
 * | `kind`        | Cannot be overridden                                                                   |
 * | `range`       | Delegated to {@link SetShape} merge rules                                              |
 * | `hidden`      | Inherited; conflicting parents without child override are reported as an error        |
 * | `computed`    | Inherited; conflicting parents without child override are reported as an error        |
 * | `name`        | Cannot be overridden                                                                   |
 * | `description` | Cannot be overridden                                                                   |
 * | `forward`     | Cannot be overridden                                                                   |
 * | `reverse`     | Cannot be overridden                                                                   |
 *
 * @typeParam R The value range type, defaulting to an unconstrained {@link SetShape}
 *
 * @see {@link https://www.w3.org/TR/shacl/#property-shapes SHACL § 2.3.2 Property Shapes}
 */
export interface Property<R extends SetShape = SetShape> extends PropertyConstraints<R> {

	/**
	 * Discriminator identifying this as a property shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "property";


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
 * 1. The shape's own {@link ResourceConstraints.namespace}
 * 2. The common inherited namespace from parent shapes
 * 3. The default {@link defaultNamespace} namespace
 *
 * @typeParam R The value range type threaded from the {@link property} factory, defaulting to an
 *   unconstrained {@link SetShape}
 *
 * @see {@link https://www.w3.org/TR/shacl/#property-shapes SHACL § 2.3.2 Property Shapes}
 */
export interface PropertyConstraints<R extends SetShape = SetShape> {

	/**
	 * Discriminator identifying the value produced by the {@link property} factory.
	 *
	 * Absent from a bare constraints argument; set to `"property"` on the factory's result so
	 * {@link Range} can tell a property entry from a naked {@link SetShape}.
	 */
	readonly kind?: "property";

	/**
	 * Value range for this property.
	 *
	 * Absent from a bare constraints argument; carried on the factory's result to thread the range
	 * type. Computed by the {@link resource} factory from the entries. **Inheritance** — delegated
	 * to {@link SetShape} merge rules.
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
	 * > Computed entries are populated by the system and may be silently overwritten on mutation operations.
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
	readonly name?: Dictionary;

	/**
	 * Human-readable description of the property.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (no description)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#name SHACL § 6.1.2 sh:description}
	 */
	readonly description?: Dictionary;


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
 * Member definition accepted by the {@link resource} factory.
 *
 * Accepts {@link Id} and {@link Type} markers for the resource identifier and type entries,
 * naked {@link SetShape} values for the concise property syntax, or {@link PropertyConstraints}
 * produced by the {@link property} factory when additional constraints such as IRI mappings or
 * labels are needed. The factory resolves each into the stored {@link Entry} form, tightening any
 * {@link Namespace} `forward`/`reverse` mapping to an absolute IRI.
 */
export type Member =
	| Id
	| Type
	| SetShape
	| PropertyConstraints;


//// Type Inference ////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Assembles the per-key template prototype backing a {@link ResourceShape.model | resource's model}.
 *
 * Maps every declared {@link Member} to its template-side {@link Slot} projection, producing the
 * complete template stored on the shape at runtime. Surfaces in the {@link resource} factory's
 * return type as the full, authoritative template.
 *
 * Entries whose cardinality admits absence are {@link Relaxed | relaxed} to optional keys, so a value
 * literal may omit them; every other entry stays a required key.
 *
 * @typeParam E The entries record type
 */
export type Prototype<E extends Members> = Relaxed<{

	readonly [K in keyof E]: Slot<E[K]>

}>;

/**
 * Narrows locally-declared entries against an inherited template, flagging incompatible overrides.
 *
 * Retains each entry whose key is also inherited only when its {@link Slot} projection is assignable to the
 * {@link Narrowings} expansion of the inherited property type; a mismatch collapses to `never`, surfacing the
 * conflict at the {@link resource} call site as a type error on the offending entry. Entries with keys not present
 * on the parent pass through unchanged. Enforces the rule that overrides may restrict inherited constraints but never
 * relax them.
 *
 * For inherited union slots, {@link Narrowings} expands the comparison to also accept the new narrowing forms
 * permitted at extends-time: a non-union value shape that narrows a parent variant (Form 1 single-variant narrowing)
 * and a union whose variants each narrow a distinct parent variant (Form 2 subsetting). Type-level acceptance is
 * intentionally permissive: a child variant that narrows no parent variant, several, or the same parent as another
 * child variant compiles but throws at runtime.
 *
 * @typeParam E The local entries record type
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
 * Routes {@link Id} and {@link Type} markers to {@link @metreeca/qest!Reference | Reference} and ranged entries to
 * their range's template model, which already carries cardinality-driven optionality and the scalar-versus-tuple
 * distinction. Feeds both {@link Prototype} assembly (where the projection supplies the value type of the resource's
 * `model`, relaxed to an optional key when it admits absence) and {@link Override} assignability (where the inherited
 * side is expanded via {@link Narrowings} so the new union-narrowing inheritance forms are accepted).
 *
 * @typeParam E The entry type
 */
export type Slot<E extends Member> =
	E extends Id | Type ? Reference
		: Range<E> extends SetShape ? Range<E>["model"]
			: never;

/**
 * Resolves the inherited template contributed by a resource's {@link ResourceConstraints.extends | extends} clause.
 *
 * Reads each parent shape's complete template via {@link Schema}, merges the contributions
 * across multiple parents via {@link Intersected}, and strips index signatures via {@link Declared} so that
 * {@link Override} checks against concrete inherited entries only. Yields `{}` when
 * `extends` is not declared.
 *
 * @typeParam C The constraints type to inspect
 */
export type Inheritance<C> =
	C extends {
			readonly extends: infer E extends
				| Lazy<ResourceShape>
				| readonly [Lazy<ResourceShape>, ...Lazy<ResourceShape>[]]
		}
		? Declared<Intersected<Schema<E extends readonly (infer S)[] ? S : E>>>
		: {};

/**
 * Composes the resource model from local entries and inherited template.
 *
 * Locally-redeclared keys are taken from {@link Prototype | Prototype<E>}: the child slot replaces the inherited
 * contribution wholesale; non-overridden inherited keys flow through from {@link Inheritance | Inheritance<C>}.
 * Mirrors at the type level the override semantics enforced by {@link resource} on the runtime side. The result is
 * {@link Merged | merged} into a single flat property list, so local and inherited entries read alike and both keep
 * the optional keys {@link Relaxed} assigns to entries admitting absence.
 *
 * @remarks
 *
 * Subtracting `keyof E` from the inherited side before intersection is required because TypeScript intersection is
 * order-insensitive: without the subtraction the parent's contribution is retained alongside the child's narrowing,
 * leaving residue such as `string & { readonly "0": string; readonly "1": Locales }` on slots narrowed via
 * single-variant {@link union!UnionShape | union} narrowing (Form 1).
 *
 * @typeParam E The local entries record type
 * @typeParam C The constraints type providing the inherited template via {@link Inheritance}
 */
export type Composition<E extends Members, C> = Merged<
	& Prototype<E>
	& Omit<Inheritance<C>, keyof E>
>;

/**
 * Projects a {@link Member} to its state-side runtime value type.
 *
 * Routes {@link Id} and {@link Type} markers to {@link @metreeca/qest!Reference | Reference}
 * and ranged entries to the range's value type conditioned on cardinality: a scalar when
 * `maxCount === 1`, a read-only array otherwise, unioned with `undefined` whenever `minCount`
 * admits absence.
 *
 * @typeParam E The entry type
 */
export type Content<E extends Member> =
	E extends Id | Type ? Reference
		: Range<E> extends SetShape<infer S, infer L, infer U>
			? (L extends undefined | 0 ? undefined : never) | (U extends 1 ? State<S> : readonly State<S>[])
			: never;

/**
 * Extracts the {@link SetShape} range carried by a {@link Member}.
 *
 * Returns the declared range for {@link Property} entries and the shape itself for naked
 * {@link SetShape} entries; resolves to `never` for marker entries ({@link Id}, {@link Type}),
 * which carry no range.
 *
 * @typeParam E The entry type
 */
export type Range<E extends Member> =
	E extends PropertyConstraints<infer R> ? R
		: E extends SetShape ? E
			: never;


/**
 * Relaxes the keys of an object type into optional keys wherever the value type admits absence.
 *
 * Marks every key whose type includes `undefined` as an optional key and leaves the rest required,
 * so a value literal spells out only the entries it actually carries instead of padding absent ones
 * with `undefined`. Reading is unaffected: an omitted key still yields `undefined`.
 *
 * Used by {@link Prototype} to relax template entries whose cardinality admits absence. The
 * modifiers are carried into {@link value!State | State} by {@link @metreeca/qest!Slots | Slots},
 * which preserves them as it projects the template, so nested and inherited entries relax alongside
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
 * Creates a resource shape from property definitions.
 *
 * Accepts {@link Member} values including full {@link Property} definitions, naked
 * {@link SetShape} values for the concise syntax, and {@link Id}/{@link Type} markers. Property
 * IRIs are resolved against {@link defaultNamespace}; use the constraints overload to declare a
 * different default namespace or to inherit from parent shapes.
 *
 * > [!TIP]
 * > `name: required(string())` is equivalent to `name: property(required(string()))`.
 *
 * @typeParam E The entries record type
 *
 * @param entries The property definitions, mapping property names to entries
 *
 * @returns An immutable resource shape with the specified entries
 *
 * @throws {TraceError} If entry definitions are invalid (for example, duplicate `id`/`type` markers)
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
export function resource<E extends Members>(
	entries: E
): Omit<ResourceShape, "model"> & { readonly model: Prototype<E> };

/**
 * Creates a resource shape from constraints and property definitions.
 *
 * Accepts {@link Member} values including full {@link Property} definitions, naked
 * {@link SetShape} values for the concise syntax, and {@link Id}/{@link Type} markers. The
 * `constraints` argument may declare a custom namespace, target classes, identifier patterns,
 * resource-level validators, or parent shapes via {@link ResourceConstraints.extends | extends}.
 *
 * > [!TIP]
 * > When `constraints` includes `extends`, parent shapes are recursively flattened and merged
 * > into the returned shape. Consumers can work with the result directly without traversing the
 * > inheritance chain. The `extends` field is retained for reference, but all inherited
 * > constraints are already resolved.
 *
 * > [!NOTE]
 * > This function is idempotent: the returned shape is branded and won't be re-flattened if used
 * > as a parent in another shape.
 *
 * @typeParam C The constraints type, used to infer the inherited model
 * @typeParam E The entries record type
 * @typeParam M The composed model type, combining local entries with inherited entries
 *
 * @param constraints Shape constraints including namespace, name, validators, and optionally `extends`
 * @param entries The property definitions, mapping property names to entries
 *
 * @returns An immutable resource shape with inherited constraints and entries flattened and merged
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
	E extends Members,
	M extends Composition<E, C> = Composition<E, C>
>(
	constraints: C & {
		readonly validators?: readonly [(value: M) => undefined | Trace, ...((value: M) => undefined | Trace)[]]
	},
	entries: E & Override<E, Inheritance<C>>
): Omit<ResourceShape, "model"> & { readonly model: M };

/**
 * Creates resource shapes.
 */
export function resource(
	a: Members | ResourceConstraints,
	b?: Members
): ResourceShape {

	type Parents = ResourceConstraints["extends"];
	type Sources = { readonly [entry: Identifier]: Id | Type | PropertyConstraints };
	type Properties = { readonly [entry: Identifier]: Entry };


	if ( b === undefined ) {

		const properties = a as Members;
		const namespace = locate({});
		const resolved = resolve(normalize(properties), namespace);

		return flatten({

			kind: "resource",
			model: build(resolved),

			entries: resolved

		});

	} else {

		const constraints = a as ResourceConstraints;
		const properties = b;

		const namespace = locate(constraints);
		const resolved = resolve(normalize(properties, constraints.extends), namespace);

		return flatten({

			kind: "resource",
			model: build(resolved, constraints),

			...constraints,

			entries: resolved

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
				eager(parent).namespace
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
	 * Singleton markers are counted over the inherited and local entries collapsed by property name: a marker
	 * reaching the child under the same name through several parents, or redeclared by the child over the inherited
	 * one, counts once. Override compatibility is settled elsewhere: `narrowsResource` rejects an overriding entry
	 * that changes the inherited kind.
	 *
	 * @param entries The property definitions to normalise
	 * @param parents Optional parent shapes for inheritance-aware duplicate detection
	 *
	 * @returns Normalised entries with range wrapped
	 *
	 * @throws {TraceError} If two markers of the same kind are declared under distinct property names
	 */
	function normalize(entries: Members, parents?: Parents): Sources {

		const bases: Properties[] = parents === undefined ? []
			: (Array.isArray(parents) ? parents : [parents])
				.map(parent => eager(parent).entries);

		const merged: Members = [...bases, entries].reduce((collapsed, source) => ({ ...collapsed, ...source }), {});

		const trace = checkSingletons(Object.values(merged));

		if ( trace !== undefined ) {
			throw new TraceError("duplicate singleton entries", trace);
		}

		return Object.fromEntries(Object.entries(entries).map(([name, entry]) => {

			if ( entry.kind === "set" ) {

				// inherit forward/reverse from parent when wrapping naked range

				const base = bases.reduce<Member | undefined>((found, b) => found ?? b[name], undefined);

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

				return [name, entry];

			}

		}));
	}

	/**
	 * Resolves namespace functions to concrete IRIs for property mappings.
	 *
	 * When neither `forward` nor `reverse` is defined, generates a default forward IRI using the effective namespace.
	 *
	 * @param properties The entries to resolve
	 * @param namespace The effective namespace for default forward resolution
	 *
	 * @returns Properties with `forward` and `reverse` resolved to IRIs
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
	 * When parent shapes are provided, their models are merged before applying local entries, so local
	 * definitions override inherited ones. Parent models already contain transitive inherited entries.
	 *
	 * @param properties The resolved property definitions
	 * @param constraints Optional constraints containing parent shapes whose models should be inherited
	 *
	 * @returns An immutable resource model
	 */
	function build(properties: Properties, { extends: parents }: ResourceConstraints = {}): Template {

		const inherited = parents === undefined ? {} : (Array.isArray(parents) ? parents : [parents])
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
 * counted after inheritance merging: markers sharing a property name collapse into a single entry, so a marker
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
 * counted after inheritance merging: markers sharing a property name collapse into a single entry, so a marker
 * reaching the shape through several parents or redeclared by the shape counts once, while two `type` markers under
 * distinct property names are rejected. The resulting property has implicit `0..1` cardinality and is system-managed:
 * its value is derived from the {@link ResourceConstraints.class | class} constraint and client-supplied values are
 * silently ignored.
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
 * Creates a property shape from a value range.
 *
 * Wraps a {@link SetShape} into a {@link Property} with no additional constraints. The property's
 * forward IRI is generated by the enclosing {@link resource} factory by resolving the property
 * name against the effective namespace.
 *
 * @typeParam R The value range type
 *
 * @param range The value range for this property
 *
 * @returns An immutable {@link Property} wrapping the supplied range
 */
export function property<R extends SetShape>(
	range: R
): PropertyConstraints<R> & { readonly range: R };

/**
 * Creates a property shape with constraints from a value range.
 *
 * Wraps a {@link SetShape} into a {@link Property} carrying the supplied
 * {@link PropertyConstraints}. Use this overload when explicit IRI mappings, labels, or
 * visibility flags are required; otherwise prefer the bare-range overload or pass the range
 * directly to {@link resource}.
 *
 * @remarks
 *
 * The `forward` and `reverse` fields accept plain strings for convenience; they are converted
 * to {@link IRI} values internally.
 *
 * @typeParam R The value range type
 *
 * @param constraints Property constraints including IRI mappings and labels
 * @param range The value range for this property
 *
 * @returns An immutable {@link Property} wrapping the supplied range and constraints
 */
export function property<R extends SetShape>(
	constraints: PropertyConstraints,
	range: R
): PropertyConstraints<R> & { readonly range: R };

/**
 * Creates property shapes.
 */
export function property<R extends SetShape>(
	a: SetShape | PropertyConstraints,
	b?: SetShape
): PropertyConstraints<R> & { readonly range: R } {

	const constraints = (b !== undefined ? a : {}) as PropertyConstraints;
	const range = (b !== undefined ? b : a) as R;

	return immutable({
		kind: "property",
		...constraints,
		range
	});

}
