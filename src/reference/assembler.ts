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
 * Reference shape assembly.
 *
 * Builds the shape the factory states into the form its consumers read, and combines it with the one it overrides: an
 * extension is held to the shape it refines, narrowing exactly when its target is the inherited target or extends it,
 * with a target deferred to break a definition cycle held to the same rule as the link is first crossed.
 *
 * @module
 */

import { isFunction, type Lazy, type Optional } from "@metreeca/core";
import { equals, immutable } from "@metreeca/core/structures";
import { test, type Trace, TraceError } from "@metreeca/core/trace";
import { eager } from "../value/index.js";
import type { ReferenceShape } from "./index.js";
import type { ResourceShape } from "../resource/index.js";


/**
 * Assembles a reference shape.
 *
 * Backs the factory the {@link reference!} module exposes. The target is kept as it was stated, deferred or not, so
 * that a cycle among definitions is broken by whichever end defers.
 *
 * @typeParam T The shape the reference points at
 *
 * @param target The shape describing the resource the reference points at
 *
 * @returns An immutable shape admitting the IRIs naming resources of the stated target shape
 */
export function assemble<T extends Lazy<ResourceShape>>(target: T): ReferenceShape<T> {

	return immutable({

		kind: "reference",

		target

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Reports whether a reference shape narrows an inherited one.
 *
 * Tests the override relation without building the merged shape. A reference states nothing of its own beyond the
 * shape it points at, so it narrows the inherited one exactly when its target is the inherited target or extends it,
 * directly or transitively.
 *
 * A deferred target is admitted unread: a link is deferred exactly so that a definition may reach itself, so resolving
 * one here would state a definition the shape being built is part of, which is what a deferral withholds. The
 * obligation is not waived but carried by {@link mergeReference} to the link itself, which holds the target to the
 * inherited chain when it is first crossed.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns A trace of the obstacles to the override, or `undefined` where `target` narrows `source` or defers the
 *     shape it points at
 */
export function narrowsReference(target: ReferenceShape, source: ReferenceShape): Optional<Trace> {

	return test<ReferenceShape>(({ target: pointed }) => {

		return isFunction(pointed) || extended(eager(pointed), eager(source.target)) || [
			`{target} incompatible <target> override`
		];

	})(target);


	/**
	 * Reports whether a target is an inherited one or extends it, directly or transitively.
	 */
	function extended(pointed: ResourceShape, inherited: ResourceShape): boolean {
		return lineage(pointed).some(ancestor => equals(ancestor, inherited));
	}


	/**
	 * Lists a resource shape and the shapes it extends.
	 *
	 * @param shape The shape to walk
	 *
	 * @returns `shape` followed by every shape it extends, directly or transitively
	 */
	function lineage(shape: ResourceShape): readonly ResourceShape[] {
		return [shape, ...shape.parents.flatMap(parent => lineage(eager(parent)))];
	}

}

/**
 * Merges a reference shape with an inherited one.
 *
 * Yields the single shape an extending member is validated against: the overriding target, which already carries the
 * inherited definition through its own inheritance chain. A target stated outright is held to that chain at once; a
 * deferred one is held to it as the link is first crossed, its chain standing only then, so that a shape re-pointed at
 * one extending it merges whatever order the definitions happen to be built in.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns An immutable shape pointing at the narrower of the two targets, deferred where `target` defers it
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `target` states a shape that doesn't narrow `source`;
 *     where it defers one, the same report is raised as the link is crossed
 */
export function mergeReference(target: ReferenceShape, source: ReferenceShape): ReferenceShape {

	const { target: pointed } = target;

	return assemble(isFunction(pointed) ? () => narrowed(eager(pointed)) : narrowed(pointed));


	/**
	 * Holds a stated target to the inherited chain.
	 */
	function narrowed(shape: ResourceShape): ResourceShape {

		const trace = narrowsReference(assemble(shape), source);

		if ( trace !== undefined ) {
			throw new TraceError("incompatible reference shape override", trace);
		}

		return shape;

	}

}
