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
 * Resource shape accessors.
 *
 * Reads off a shape what the resources it describes are named, classified and made of, resolving a deferred shape and
 * following a link through to its target, so that a caller reaches a resource definition without walking the shape
 * itself. A shape pointing at no resource at all answers every accessor with nothing rather than failing.
 *
 * @module
 */

import type { Identifier, Lazy } from "@metreeca/core";
import type { Reference } from "@metreeca/qest/state";
import type { Shape } from "../value/index.js";
import { getShapeTarget } from "../reference/accessors.js";
import type { Members } from "./index.js";


/**
 * Resolves the class the resources a shape describes belong to.
 *
 * @param shape The shape to resolve, possibly deferred to break definition cycles
 *
 * @returns The class the target shape declares, or `undefined` where it declares none or `shape` points at no
 *     resource
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where a deferred definition reaches itself, or states a
 *     target that doesn't narrow the one the link it is reached through overrides
 */
export function getShapeClass(shape: Lazy<Shape>): undefined | Reference {

	return getShapeTarget(shape)?.class;

}

/**
 * Resolves the classes the resources a shape describes belong to on top of their own.
 *
 * @param shape The shape to resolve, possibly deferred to break definition cycles
 *
 * @returns The classes the target shape inherits, empty where it extends nothing stating one, or `undefined` where
 *     `shape` points at no resource
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where a deferred definition reaches itself, or states a
 *     target that doesn't narrow the one the link it is reached through overrides
 */
export function getShapeClasses(shape: Lazy<Shape>): undefined | readonly Reference[] {

	return getShapeTarget(shape)?.classes;

}

/**
 * Resolves the name of the member naming the resources a shape describes.
 *
 * @param shape The shape to resolve, possibly deferred to break definition cycles
 *
 * @returns The name the identifier is stated under, or `undefined` where the target states none or `shape` points at
 *     no resource
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where a deferred definition reaches itself, or states a
 *     target that doesn't narrow the one the link it is reached through overrides
 */
export function getShapeId(shape: Lazy<Shape>): undefined | Identifier {

	return named(shape, "id");

}

/**
 * Resolves the name of the member typing the resources a shape describes.
 *
 * @param shape The shape to resolve, possibly deferred to break definition cycles
 *
 * @returns The name the class is stated under, or `undefined` where the target states none or `shape` points at no
 *     resource
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where a deferred definition reaches itself, or states a
 *     target that doesn't narrow the one the link it is reached through overrides
 */
export function getShapeType(shape: Lazy<Shape>): undefined | Identifier {

	return named(shape, "type");

}

/**
 * Resolves the members the resources a shape describes carry.
 *
 * @param shape The shape to resolve, possibly deferred to break definition cycles
 *
 * @returns The members of the target shape, or no member at all where `shape` points at no resource
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where a deferred definition reaches itself, or states a
 *     target that doesn't narrow the one the link it is reached through overrides
 */
export function getShapeProperties(shape: Lazy<Shape>): Members {

	return getShapeTarget(shape)?.members ?? {};

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the name the marker of a given kind is stated under.
 */
function named(shape: Lazy<Shape>, kind: "id" | "type"): undefined | Identifier {

	return Object.entries(getShapeTarget(shape)?.members ?? {})
		.find(([, declared]) => declared.kind === kind)
		?.[0];

}
