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
 * Reference shape, constraints, and factory.
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.3.1 Node Shapes}
 */

import type { Lazy } from "@metreeca/core";
import { immutable } from "@metreeca/core/deep";
import type { Reference } from "@metreeca/qest";
import type { ResourceShape } from "./resource.js";


/**
 * Shape definition for resource references.
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link resource!ResourceConstraints.extends | extends},
 * reference-valued properties are merged according to the following rules. The *child* is the extending shape; the
 * *parent* is the inherited shape.
 *
 * | Field      | Override Rule                                                             |
 * | ---------- | ------------------------------------------------------------------------ |
 * | `kind`     | Cannot be overridden                                                     |
 * | `model`    | Must be strictly equal — mismatch signals incompatible shapes            |
 * | `foreign`  | Cannot be overridden                                                     |
 * | `captive`  | Cannot be overridden                                                     |
 * | `shape`    | Cannot be overridden                                                     |
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.3.1 Node Shapes}
 */
export interface ReferenceShape extends ReferenceConstraints {

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
	 * Target {@link ResourceShape resource shape} for the referenced resource.
	 *
	 * Accepts a lazy value to support circular and self-referential definitions.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly shape: Lazy<ResourceShape>;

}

/**
 * Constraints for the {@link reference} shape factory.
 *
 * The `foreign` and `captive` flags are independent and may be combined. Their interaction determines how insert and
 * remove operations behave on properties backed by the reference shape:
 *
 * | `foreign` | `captive` | Insert                                     | Remove
 *                                                               |
 * |:---------:|:---------:|--------------------------------------------|-------------------------------------------------------------------------------------------------------------|
 * |     —     |     —     | Writes data via forward/reverse predicates | Deletes data via forward/reverse predicates
 *                                                               |
 * |     ✓     |           | No-op (read-only view)                     | Deletes data via forward/reverse predicates
 *                                                               |
 * |           |     ✓     | Writes data via forward/reverse predicates | Deletes data via forward/reverse predicates
 * and cascade-removes referenced resource with the same semantics |
 * |     ✓     |     ✓     | No-op (read-only view)                     | Deletes data via forward/reverse predicates
 * and cascade-removes referenced resource with the same semantics |
 *
 * The {@link resource!PropertyConstraints.forward | forward} and
 * {@link resource!PropertyConstraints.reverse | reverse} mappings on the enclosing
 * {@link resource!PropertyConstraints | property} determine which property mappings are written and deleted by these
 * operations.
 */
export interface ReferenceConstraints {

	/**
	 * Marks the reference as managed by the target resource.
	 *
	 * Foreign references are read-only from the source resource perspective: included in retrieval templates but
	 * rejected during resource validation. The link is owned by the target resource, not by the source resource
	 * declaring the foreign reference.
	 *
	 * During resource validation, properties backed by a foreign reference shape are rejected if present in the input.
	 * During template validation, foreign properties are accepted normally, since templates describe data retrieval
	 * rather than state updates.
	 *
	 * > [!IMPORTANT]
	 * > Foreign references are independent from {@link resource!PropertyConstraints.reverse | reverse} mappings.
	 * > A `reverse` mapping on a {@link resource!PropertyConstraints | property} writes an actual inverse property
	 * > mapping; a `foreign` reference is a read-only view over mappings owned by another property and does not write
	 * > any mappings on insert.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly foreign?: boolean;

	/**
	 * Marks the referenced resource as unable to outlive the source resource.
	 *
	 * Captive resources have independent identity and lifecycle: they can be created, updated, and deleted
	 * independently of the referencing resource. However, they are existentially dependent on the source resource:
	 * they cannot outlive it and are automatically cascade-removed when it is deleted.
	 *
	 * > [!IMPORTANT]
	 * > Captive resources are independent from {@link resource!resource | embedded resources}. Embedded resources have
	 * > no independent identity or lifecycle ({@link resource!id | id} / {@link resource!type | type} rejected) and
	 * > are always managed as part of their parent; captive resources have both and can be managed independently, but
	 * > are cascade-deleted with the source resource.
	 *
	 * **Inheritance** — cannot be overridden.
	 *
	 * @defaultValue `undefined` (`false`)
	 */
	readonly captive?: boolean;

}


//// Factories /////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a reference shape for the given target {@link ResourceShape resource shape}.
 *
 * > [!WARNING]
 * > The target shape must include an {@link resource!Id | Id} property. This constraint is checked at runtime but not
 * > at compile time due to limitations with recursive type inference.
 *
 * > [!TIP]
 * > Always dereference {@link ReferenceShape.shape} through {@link resource | resource()} rather than calling the
 * > factory directly, to ensure the resulting shape is fully flattened.
 *
 * @param shape The target resource shape, either directly or as a lazy function to support circular and
 *     self-referential definitions
 * @param constraints Optional {@link ReferenceConstraints constraints} controlling link ownership and lifecycle
 *
 * @returns An immutable {@link ReferenceShape} for validating resource references
 *
 * @throws {TypeError} If `shape` is not a valid {@link ResourceShape}
 *
 * @example
 *
 * ```typescript
 * const vendor = required(reference(Vendor));
 * const children = multiple(reference(Target, { foreign: true }));
 * const parts = multiple(reference(Part, { captive: true }));
 * ```
 */
export function reference(shape: Lazy<ResourceShape>, constraints?: ReferenceConstraints): ReferenceShape {

	return immutable({

		kind: "reference",
		model: "app:/",

		...constraints,

		shape

	});

}
