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
 * Union alternative inference.
 *
 * Resolves the alternatives a union describes: {@link Branch} yields every branch at once, so that the value of a
 * union is resolved by resolving each branch in turn.
 *
 * @module
 */

import type { Eager, Lazy } from "@metreeca/core";
import type { Shape } from "../index.js";
import type { UnionShape } from "./index.js";

/**
 * Resolves the alternatives a union describes.
 *
 * Yields every branch at once, each as declared, so that a value of the union is resolved by resolving each branch in
 * turn, as {@link _!Instance} and {@link _!Compound} do; a shape that is not a union has no branch at all.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Branch<S extends Lazy<Shape>> =
	Eager<S> extends UnionShape<infer B> ? B[number] : never
