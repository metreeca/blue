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

import { type Lazy, map } from "@metreeca/core";
import { equals, immutable } from "@metreeca/core/structures";
import { isIRI } from "@metreeca/core/resource";
import { isReference } from "@metreeca/qest";
import { all, array, domain, test, type Trace, TraceError, type, values as contains } from "@metreeca/core/trace";
import { type Scope } from "./index.core.js";
import type { ReferenceShape } from "./reference.js";
import { match } from "./resource.core.js";
import type { ResourceShape } from "./resource.js";
import { eager, type Shape } from "./value.js";


/**
 * Reports whether an overriding reference shape narrows an inherited base shape.
 *
 * Tests the override relation without building the merged shape: a reference carries no tightenable constraints, so
 * `target` narrows `source` exactly when their `model` matches, the non-overridable fields (`foreign`, `captive`) are
 * not redefined, and the target shapes are equal. Returns a {@link Trace} describing the obstacles otherwise.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns A trace of narrowing obstacles, or `undefined` when `target` narrows `source`
 */
export function narrowsReference(target: ReferenceShape, source: ReferenceShape): undefined | Trace {

	return all<ReferenceShape>(
		test(({ model }) => {

			return model === source.model || [
				`{model} mismatched types <${model}> and <${source.model}>`
			];

		}),
		test(({ foreign }) => {

			return foreign === undefined || foreign === source.foreign || [
				`{foreign} unexpected <foreign> redefinition`
			];

		}),
		test(({ captive }) => {

			return captive === undefined || captive === source.captive || [
				`{captive} unexpected <captive> redefinition`
			];

		}),
		test(({ shape }) => {

			return equals(eager(shape), eager(source.shape)) || [
				`{shape} unexpected <shape> redefinition`
			];

		})
	)(target);

}

/**
 * Merges an overriding reference shape with an inherited base shape.
 *
 * Validates `model` strict equality and rejects redefinition of non-overridable fields (`foreign`, `captive`, `shape`).
 * Non-overridable fields are inherited from the source; `kind` and `model` are structural.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns The merged shape with combined constraints
 *
 * @throws {TraceError} On incompatible overrides
 */
export function mergeReference(target: ReferenceShape, source: ReferenceShape): ReferenceShape {

	const trace = narrowsReference(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible reference shape override", trace);
	}

	return immutable({

		kind: target.kind,
		model: target.model,

		...source.foreign !== undefined && { foreign: source.foreign },
		...source.captive !== undefined && { captive: source.captive },

		shape: source.shape

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a {@link ReferenceShape}.
 *
 * Reports each non-reference value as a `{kind}` violation, then enforces the reference value-domain constraints on
 * the matching values, keying every element violation by its index. Membership over the whole set (`hasValue`) is
 * reported as a leading bare message.
 *
 * @param values The values to validate
 * @param shape The reference shape defining validation constraints
 * @param opts Validation options
 * @param opts.scope The validation scope: `"state"` enforces every constraint; `"bound"` keeps the target IRI
 *     `pattern` (the syntactic discriminator) but skips the `in` and `hasValue` value-domain constraints; `"model"`
 *     skips every target constraint, matches by kind alone, and admits the full IRI-reference production (empty,
 *     relative, root-relative, and absolute forms) rather than the absolute-only instance form. Defaults to `"state"`
 *
 * @returns A trace of validation violations, or `undefined` if all values are valid
 */
export function validateReference(values: readonly unknown[], shape: ReferenceShape, {

	scope = "state"

}: {

	scope?: Scope

} = {}): undefined | Trace {

	const target = eager(shape.shape);

	switch ( scope ) {

		case "state":

			return state(target)(values);

		case "bound":

			return bound(target)(values);

		case "model":

			return model(target)(values);

	}


	function state({ pattern, in: allowed, hasValue: required }: typeof target) {

		return array(
			type(isReference,
				all(
					pattern !== undefined && test(value =>
						match(value, pattern) || [`{format} expected IRI matching pattern <${pattern}>`]
					),
					domain(allowed)
				)
			),
			contains(required)
		);

	}

	function bound({ pattern }: typeof target) {

		return array(
			type(isReference,
				all(
					pattern !== undefined && test(value =>
						match(value, pattern) || [`{format} expected IRI matching pattern <${pattern}>`])
				)
			)
		);

	}

	function model({}: typeof target) {

		return array(
			type(isIRI)
		);

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves a reference range to its target {@link ResourceShape | resource shape}.
 *
 * Crosses a reference range to its eagerly-resolved target, and takes a resource range to itself, generalising a
 * resource shape as an already-resolved reference. Yields `undefined` for any range that admits no entries
 * (scalar, localised). It takes a single variant: flatten a union range through {@link union!getShapeVariants} first,
 * so colliding variant property names stay distinct rather than merging.
 *
 * @param shape One of the range {@link union!getShapeVariants | variants}
 *
 * @returns The target resource shape, or `undefined` when `shape` admits no entries
 */
export function getShapeTarget(shape: Lazy<Shape>): undefined | ResourceShape {
	return map(eager(shape), shape =>
		shape.kind === "resource" ? shape
			: shape.kind === "reference" ? eager(shape.shape)
				: undefined
	);
}
