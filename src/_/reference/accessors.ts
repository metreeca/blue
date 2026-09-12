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
 * Reference shape accessors.
 *
 * Reads off a range the resource shape it reaches, crossing a link and taking a resource to itself, so that a caller
 * needs not tell a link from a resource carried inline.
 *
 * @module
 */

import { type Lazy, map } from "@metreeca/core";
import { eager } from "../index.core.js";
import type { Shape } from "../value/index.js";
import type { ResourceShape } from "../resource/index.js";


/**
 * Resolves the resource shape a range points at.
 *
 * Crosses a reference to the shape it points at and takes a resource shape to itself, so that a caller reaching for
 * the members behind a range needs not tell a link from a resource carried inline. A range describing a plain or
 * localised value points at no resource and yields nothing.
 *
 * @param shape The range to resolve, possibly deferred to break definition cycles
 *
 * @returns The resource shape `shape` points at, or `undefined` where it points at none
 */
export function getShapeTarget(shape: Lazy<Shape>): undefined | ResourceShape {

	return map(eager(shape), resolved =>
		resolved.kind === "resource" ? resolved
			: resolved.kind === "reference" ? eager(resolved.target)
				: undefined
	);

}
