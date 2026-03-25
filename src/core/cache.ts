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
 * Lazy shape materialisation with caching.
 *
 * @module
 */

import { isFunction, type Lazy } from "@metreeca/core";
import type { UnionShape, ValuesShape } from "../index.js";
import { flatten } from "../resource.core.js";
import { TraceError } from "./trace.js";


/**
 * Cache for materialised shapes from lazy factories.
 *
 * Uses WeakMap so entries are automatically released when the factory function is no longer referenced.
 * A `null` entry signals a factory currently being resolved, enabling circular dependency detection.
 */
const cache = new WeakMap<() => ValuesShape | UnionShape, null | ValuesShape | UnionShape>();


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves a {@link Lazy} shape, caching factory results for idempotent materialisation.
 *
 * When given a factory function, returns the cached result if available, otherwise calls the factory, flattens
 * {@link ResourceShape} results through {@link flatten}, caches the result, and returns it.
 * Direct resource shapes are also flattened; other shapes are returned unchanged.
 *
 * @param shape A value shape or factory function returning one
 *
 * @returns The resolved and, for resource shapes, flattened shape
 */
export function materialize<T extends ValuesShape | UnionShape>(shape: Lazy<T>): T {

	if ( isFunction(shape) ) {

		const cached = cache.get(shape);

		if ( cached === null ) {

			throw new TraceError("circular extends chain", {
				[shape.name || "<anonymous>"]: "circular dependency"
			});

		} else if ( cached === undefined ) {

			cache.set(shape, null);

			try {

				const resolved = shape();
				const flattened = (resolved.kind === "resource" ? flatten(resolved) : resolved);

				cache.set(shape, flattened);

				return flattened as T;

			} catch ( error ) {

				cache.delete(shape);

				throw error;

			}

		} else {

			return cached as T;

		}

	} else {

		return (shape.kind === "resource" ? flatten(shape) : shape) as T;

	}

}
