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
