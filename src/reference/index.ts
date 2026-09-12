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
 * Reference shape types and operations.
 *
 * Defines the shape linking a resource to another **standalone resource**, named by an absolute IRI, and provides the
 * {@link reference} factory stating it and the accessor reading its target. The factory pairs the IRI with the
 * {@link resource!ResourceShape | shape} describing the resource it points at, deferred where a definition cycle
 * requires it, so a member pointing at a resource carries the identifier alone and leaves the resource to be retrieved
 * in its own right.
 *
 * **Defining reference members**
 *
 * Wrap a target resource shape with {@link reference} and give it a cardinality:
 *
 * ```typescript
 * import { id, multiple, required, resource } from '@metreeca/blue/resource';
 * import { reference } from '@metreeca/blue/reference';
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
 * **Standalone and embedded resources**
 *
 * A reference links to a **standalone resource**, identified and managed in its own right. A resource shape included
 * directly, without the wrapper, describes an **embedded resource**: a nested value with no identity of its own,
 * created and managed together with the resource carrying it.
 *
 * Ownership and lifecycle are stated on the member rather than on the reference: see
 * {@link resource!PropertyConstraints.foreign | foreign} and {@link resource!PropertyConstraints.captive | captive}.
 *
 * **Reading a target off a shape**
 *
 * {@link getShapeTarget} resolves the resource shape a shape points at, crossing a link and taking a resource carried
 * inline to itself, so that a caller reaching for what lies behind a shape needs not tell the two apart.
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.2 Node Shapes}
 */

import type { Lazy } from "@metreeca/core";
import { assemble } from "./assembler.js";
import type { ResourceShape } from "../resource/index.js";

export { getShapeTarget } from "./accessors.js";


/**
 * Describes a link to a standalone resource.
 *
 * Admits the absolute IRI naming the resource the link points at, so that a member pointing at a resource carries the
 * identifier alone and leaves the resource itself to be retrieved in its own right. The shape states what the target
 * is, so the constraints the target puts on its own identifiers bound the link as well.
 *
 * **Inheritance**
 *
 * Where a {@link resource!ResourceShape} extends the shapes it lists as `parents`, reference-valued members are merged
 * according to the following rules. The *child* is the extending shape; the *parent* is the inherited one.
 *
 * | Field    | Override Rule                                                |
 * | -------- | ------------------------------------------------------------ |
 * | `kind`   | Cannot be overridden                                         |
 * | `target` | May be re-pointed at a shape extending the inherited target  |
 *
 * @typeParam T The shape the reference points at, possibly deferred to break definition cycles
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes SHACL § 2.2 Node Shapes}
 */
export type ReferenceShape<T extends Lazy<ResourceShape> = Lazy<ResourceShape>> = {

	/**
	 * Discriminator identifying this as a reference shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "reference"

	/**
	 * Shape describing the resource the reference points at, possibly deferred to break definition cycles.
	 *
	 * **Inheritance** — may be re-pointed at a shape that lists the inherited target among its `parents`, directly or
	 * transitively, so an extending shape refines what a link admits by naming the narrower target alone; the inherited
	 * definition reaches the refined target through its own inheritance chain and is never restated. Any other target
	 * is rejected.
	 */
	readonly target: T

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Assembles a reference shape.
 *
 * @typeParam T The shape the reference points at
 *
 * @param target The shape describing the resource the reference points at, possibly deferred to break definition
 *     cycles
 *
 * @returns An immutable shape admitting the IRIs naming resources of the stated target shape
 *
 * @example
 *
 * ```typescript
 * const vendor = required(reference(Vendor));
 * const children = multiple(reference(Target), { foreign: true });
 * const parts = multiple(reference(Part), { captive: true });
 * ```
 */
export function reference<T extends Lazy<ResourceShape>>(target: T): ReferenceShape<T> {

	return assemble<T>(target);

}
