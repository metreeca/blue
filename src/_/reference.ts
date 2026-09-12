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
 * Reference shape and factories.
 *
 * Defines {@link ReferenceShape} and the {@link reference} factory used to link a resource to
 * another **standalone resource** identified by an absolute IRI. References pair an IRI value
 * with a {@link ResourceShape} that describes the target resource, supporting circular and
 * self-referential definitions through lazy resolution.
 *
 * **Defining Reference Properties**
 *
 * Wrap a target resource shape with {@link reference} and apply a cardinality factory:
 *
 * ```typescript
 * import { required, multiple } from '@metreeca/blue/value';
 * import { reference } from '@metreeca/blue/reference';
 * import { resource, id } from '@metreeca/blue/resource';
 *
 * const Vendor = resource({
 *   id: id()
 * });
 *
 * const Product = resource({
 *   id: id(),
 *   vendor: required(reference(Vendor)),
 *   suppliers: multiple(reference(Vendor))
 * });
 * ```
 *
 * **Standalone vs Embedded Resources**
 *
 * A `reference()` wrapper links to a **standalone resource**, an independently identified
 * and managed entity. A direct shape inclusion (without the wrapper) defines an
 * **embedded resource**, a nested object with no independent identity, created and managed
 * together with its parent. See {@link resource | resource} for the embedded form.
 *
 * **Retrieval Forms**
 *
 * In a retrieval template, a reference-valued property accepts either form:
 *
 * 1. **IRI reference** — a bare IRI reference placeholder retrieves only the identifier of the
 *    linked resource, without inspecting any of its members. As a placeholder it is never
 *    resolved on decoding, so it admits any IRI reference: the empty string, a root-relative or
 *    relative reference, or an absolute IRI. Reference values proper (the operands of a selection)
 *    are resolved against the base IRI and absolute by validation time.
 * 2. **Nested resource template** — a nested template retrieves the requested subset of
 *    the linked resource, validated against its target shape and subject to the template
 *    validator's `depth` budget (if any).
 *
 * Setting the template validator's `depth` option to `0` disables form 2 while still
 * accepting form 1. See {@link index!validate | validate} for the full form comparison and
 * {@link resource!ResourceShape} for the companion embedded form.
 *
 * Link ownership and lifecycle are declared on the enclosing property rather than on the reference itself: see
 * {@link resource!PropertyConstraints.foreign | foreign} and {@link resource!PropertyConstraints.captive | captive}.
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.2 Node Shapes}
 */

import type { Lazy } from "@metreeca/core";
import { immutable } from "@metreeca/core/structures";
import { app } from "@metreeca/qest";
import type { Reference } from "@metreeca/qest/resource";
import type { ResourceShape } from "./resource.js";

export { getShapeTarget } from "./reference.core.js";


/**
 * Shape definition for resource references.
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link resource!ResourceShape.parents | parents},
 * reference-valued members are merged according to the following rules. The *child* is the extending shape; the
 * *parent* is the inherited shape.
 *
 * | Field      | Override Rule                                                             |
 * | ---------- | ------------------------------------------------------------------------ |
 * | `kind`     | Cannot be overridden                                                     |
 * | `model`    | Must be strictly equal — mismatch signals incompatible shapes            |
 * | `shape`    | May be re-pointed at a target extending the inherited target             |
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.2 Node Shapes}
 */
export interface ReferenceShape {

	/**
	 * Discriminator identifying this as a reference shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "reference";

	/**
	 * Placeholder prototype identifier.
	 *
	 * A retrieval placeholder matched by JSON type alone: its value is immaterial and need not be a legal identifier
	 * for the target, so the {@link reference} factory always stores the generic default base IRI (`app:/`) without
	 * resolving the target.
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
	 * **Inheritance** — may be re-pointed at a target that {@link resource!ResourceShape.parents | parents} the
	 * inherited target, so an extending shape refines what a reference admits by naming the narrower target alone; the
	 * inherited definition reaches the refined target through its own inheritance chain and is never restated. Any
	 * other target is rejected.
	 */
	readonly shape: Lazy<ResourceShape>;

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
 *
 * @returns An immutable {@link ReferenceShape} for validating resource references
 *
 * @example
 *
 * ```typescript
 * const vendor = required(reference(Vendor));
 * const children = multiple(reference(Target), { foreign: true });
 * const parts = multiple(reference(Part), { captive: true });
 * ```
 */
export function reference(shape: Lazy<ResourceShape>): ReferenceShape {

	return immutable({

		kind: "reference",
		model: app,

		shape

	});

}
