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
 * Reference shape operators.
 *
 * @module
 */

import { type Lazy, map, type Optional } from "@metreeca/core";
import { isIRI } from "@metreeca/core/resource";
import { equals, immutable } from "@metreeca/core/structures";
import { all, array, domain, test, type Trace, TraceError, type, values as contains } from "@metreeca/core/trace";
import { isReference } from "@metreeca/qest/resource";
import type { Shape } from "./index.js";
import { eager, type Scope } from "./index.core.js";
import type { ReferenceShape } from "./reference.js";
import { match } from "./value/validator.js";
import type { ResourceShape } from "./resource/index.js";


/**
 * Creates a reference shape.
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
export function create<T extends Lazy<ResourceShape>>(target: T): ReferenceShape<T> {

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
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns A trace of the obstacles to the override, or `undefined` where `target` narrows `source`
 */
export function narrowsReference(target: ReferenceShape, source: ReferenceShape): Optional<Trace> {

	return test<ReferenceShape>(({ target: pointed }) => {

		const inherited = eager(source.target);

		return lineage(eager(pointed)).some(ancestor => equals(ancestor, inherited)) || [
			`{target} incompatible <target> override`
		];

	})(target);


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
 * inherited definition through its own inheritance chain.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns An immutable shape pointing at the narrower of the two targets
 *
 * @throws {TraceError} Where `target` doesn't narrow `source`
 */
export function mergeReference(target: ReferenceShape, source: ReferenceShape): ReferenceShape {

	const trace = narrowsReference(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible reference shape override", trace);
	}

	return create(target.target);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a reference shape.
 *
 * Reports each value that is not an IRI naming a resource as a `{type}` violation and each IRI the target refuses
 * under its own facet, keying every element violation by its index, so that a caller may tell which link failed and
 * why; membership over the whole set (`hasValue`) is reported as a leading bare message. A reference states no
 * constraint of its own, so the ones enforced are the ones the target puts on its own identifiers.
 *
 * @param values The values to validate
 * @param shape The shape the values are matched against
 * @param opts Validation options
 * @param opts.scope The {@link Scope | strictness} the shape is enforced at, defaulting to `"state"`. A `"bound"` keeps
 *     the target's IRI `pattern`, the syntactic discriminator, and skips its value-domain constraints; a `"model"`
 *     skips every target constraint and admits any IRI reference, relative and empty forms included, as a placeholder
 *     names nothing yet
 *
 * @returns A trace of the violations found, or `undefined` where every value matches `shape`
 */
export function validateReference(values: readonly unknown[], shape: ReferenceShape, {

	scope = "state"

}: {

	scope?: Scope

} = {}): Optional<Trace> {

	const target = eager(shape.target);

	switch ( scope ) {

		case "state":

			return state(target)(values);

		case "bound":

			return bound(target)(values);

		case "model":

			return model(target)(values);

	}


	function state({ pattern, in: allowed, hasValue: required }: ResourceShape) {

		return array(
			type(isReference,
				all(
					matches(pattern),
					domain(allowed)
				)
			),
			contains(required)
		);

	}

	function bound({ pattern }: ResourceShape) {

		return array(
			type(isReference,
				all(
					matches(pattern)
				)
			)
		);

	}

	function model({}: ResourceShape) {

		return array(
			type(isIRI)
		);

	}

	function matches(pattern: undefined | string) {

		return pattern !== undefined && test<string>(value =>
			match(value, pattern) || [`{format} expected IRI matching pattern <${pattern}>`]
		);

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
