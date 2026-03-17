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
 * Probe resolution engine.
 *
 * Resolves {@link Probe} descriptors against shape trees, traversing property paths through nested resources and
 * applying transform pipes to derive the effective {@link Range} with accumulated cardinality.
 *
 * @module
 *
 * @see {@link https://metreeca.github.io/qest/documents/model.Model_Design.html | Model Design}
 */

import type { Identifier, Lazy } from "@metreeca/core";
import type { Probe, Transform } from "@metreeca/qest/model";
import type { ValueShape } from "../index.js";
import { decimal, integer } from "../number.js";
import type { Range, ReferenceShape, ResourceShape, UnionShape } from "../resource.js";
import { date, duration, instant, iri, string, time, timestamp, year } from "../string.js";
import { materialize } from "./cache.js";
import { immutable } from "@metreeca/core/nested";
import { error } from "@metreeca/core/error";


/**
 * Registry of transforms mapped to their shape-level type metadata.
 */
const Transforms: Record<Transform, {

	/**
	 * Whether the transform is an aggregate.
	 *
	 * Aggregate transforms set `maxCount` to `1`; scalar transforms preserve `maxCount` from the path. All
	 * transforms set `minCount` to undefined.
	 */
	readonly aggregate: boolean,

	readonly accepts: "*" | "numeric" | "temporal" | "string",
	readonly returns: "*" | "integer" | "decimal" | "string"

}> = immutable({

	count: { aggregate: true, accepts: "*", returns: "integer" },
	min: { aggregate: true, accepts: "*", returns: "*" },
	max: { aggregate: true, accepts: "*", returns: "*" },
	sum: { aggregate: true, accepts: "numeric", returns: "*" },
	avg: { aggregate: true, accepts: "numeric", returns: "decimal" },

	abs: { aggregate: false, accepts: "numeric", returns: "*" },
	floor: { aggregate: false, accepts: "numeric", returns: "*" },
	ceil: { aggregate: false, accepts: "numeric", returns: "*" },
	round: { aggregate: false, accepts: "numeric", returns: "*" },

	lower: { aggregate: false, accepts: "string", returns: "*" },
	upper: { aggregate: false, accepts: "string", returns: "*" },
	length: { aggregate: false, accepts: "string", returns: "integer" },

	year: { aggregate: false, accepts: "temporal", returns: "integer" },
	month: { aggregate: false, accepts: "temporal", returns: "integer" },
	day: { aggregate: false, accepts: "temporal", returns: "integer" },
	hours: { aggregate: false, accepts: "temporal", returns: "integer" },
	minutes: { aggregate: false, accepts: "temporal", returns: "integer" },
	seconds: { aggregate: false, accepts: "temporal", returns: "decimal" }

});

/**
 * Known temporal string shape models.
 *
 * Closed set of all model values produced by temporal string shape factories. Used by {@link apply}
 * to distinguish temporal strings from plain strings when checking transform compatibility.
 */

const Temporal: ReadonlySet<string> = new Set([

	year,
	date,
	time,
	instant,
	timestamp,
	duration

].map(factory =>
	factory().model
));


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Apply a {@link Probe} to a shape, resolving the effective {@link Range}.
 *
 * Traverses the {@link Probe.path} segments through nested resource properties to locate the target shape, then applies
 * the {@link Probe.pipe} transforms to compute the effective range with accumulated cardinality.
 *
 * **Shape dispatch:**
 *
 * - {@link ResourceShape}: traverses path segments through nested properties
 * - {@link ReferenceShape}: materialises the lazy target shape, then proceeds as for {@link ResourceShape}
 * - Other shapes: returns `undefined` for any non-empty path, otherwise applies the transform pipe directly
 *
 * **Path traversal** — at each step, flattens inheritance and looks up the next property. Unknown properties resolve
 * to `undefined`. At {@link UnionShape} boundaries, variants lacking the property are skipped; the path resolves to
 * `undefined` only when no variant defines it.
 *
 * **Pipe application** — applies transforms to the shape resolved by path traversal. Domain violations (a transform
 * applied outside its declared domain) and invalid compositions (aggregate after aggregate) resolve to `undefined`.
 *
 * **Cardinality** — the effective cardinality is the accumulated product of per-step constraints:
 *
 * - `minCount`: product across steps; `undefined` if any step has `minCount` undefined or `0`
 * - `maxCount`: product across steps; `undefined` if any step has `maxCount` undefined
 * - {@link UnionShape} steps do not introduce additional cardinality
 * - All transforms set `minCount` to `undefined`; scalar transforms preserve `maxCount`; aggregate transforms set
 *   `maxCount` to `1`
 *
 * @param probe The probe containing property path and transform pipe
 * @param shape The value shape to inspect
 *
 * @returns An immutable {@link Range} with accumulated cardinality, or `undefined` when the probe is
 *     demonstrated to never produce a valid value at runtime
 *
 * @see {@link https://metreeca.github.io/qest/documents/model.Model_Design.html Model Design}
 */
export function apply({ pipe, path }: Probe, shape: Lazy<ValueShape>): undefined | Range {

	type Focus = {

		readonly minCount?: number
		readonly maxCount?: number

		readonly variants: readonly ValueShape[]

	}


	const materialized = materialize(shape);

	return transform(traverse(
		materialized.kind === "reference" // materialise reference shapes to their target resource shape
			? materialize(materialized.shape)
			: materialized
	));


	/**
	 * Traverse the property path, accumulating cardinality and collecting resolved variants.
	 */
	function traverse(shape: ValueShape): Focus | undefined {

		return path.reduce<Focus | undefined>((accumulated, segment) => {

			return accumulated?.variants.reduce<Focus | undefined>((merged, variant) => {

				const resolved = resolve(variant, segment);

				if ( resolved === undefined ) { // skip variants that lack the property

					return merged;

				} else if ( merged === undefined ) { // seed with accumulated cardinality

					return {

						minCount: multiply(accumulated.minCount, resolved.minCount),
						maxCount: multiply(accumulated.maxCount, resolved.maxCount),

						variants: resolved.variants

					};

				} else { // merge variants

					return {

						minCount: merged.minCount,
						maxCount: merged.maxCount,

						variants: [...merged.variants, ...resolved.variants]
					};

				}

			}, undefined);

		}, {

			minCount: 1,
			maxCount: 1,

			variants: [shape]
		});

	}

	/**
	 * Resolve a single property step, returning its cardinality and value shape variants.
	 */
	function resolve(shape: ValueShape, property: Identifier): Focus | undefined {

		const resolved = shape.kind === "resource" ? shape
			: shape.kind === "reference" ? materialize(shape.shape)
				: undefined;

		const properties = resolved !== undefined
			? resolved.properties
			: undefined;

		if ( properties === undefined ) {

			return undefined; // non-traversable leaf type: skip in union context

		} else {

			const entry = properties[property];

			if ( entry === undefined ) {

				return undefined; // undefined property: resolution fails

			} else if ( entry.kind === "id" ) {

				return {

					minCount: 1,
					maxCount: 1,

					variants: [iri({ variant: "absolute" })]

				};

			} else if ( entry.kind === "type" ) {

				return {

					maxCount: 1,

					variants: [iri({ variant: "absolute" })]

				};

			} else {

				const { range } = entry;

				return {

					minCount: range.minCount,
					maxCount: range.maxCount,

					variants: range.shape.kind === "union"
						? Object.values(range.shape.variants)
						: [range.shape]

				};

			}

		}

	}

	/**
	 * Multiply optional cardinalities, propagating undefined.
	 */
	function multiply(a: number | undefined, b: number | undefined): number | undefined {

		if ( a === undefined || b === undefined ) {
			return undefined;
		} else {
			return a*b === 0 ? undefined : a*b;
		}

	}


	/**
	 * Apply the transform pipe to each variant, adjusting cardinality and assembling the effective range.
	 */
	function transform(focus: Focus | undefined): Range | undefined {

		if ( focus === undefined ) { return undefined; } else {

			const successes = focus.variants
				.map(reduce)
				.filter(r => r !== undefined);

			if ( successes.length === 0 ) {

				return undefined;

			} else {

				const piped = pipe.length > 0;
				const aggregate = pipe.some(name => Transforms[name].aggregate);

				return toRange({

					minCount: piped ? undefined : focus.minCount,
					maxCount: aggregate ? 1 : focus.maxCount,

					variants: successes

				});

			}
		}
	}

	/**
	 * Apply the transform pipe to a single shape, returning undefined on type incompatibility.
	 */
	function reduce(shape: ValueShape): ValueShape | undefined {

		return pipe.reduce<{ shape: ValueShape; aggregate: boolean } | undefined>((state, name) => {

			if ( state === undefined ) { return undefined; } else {

				const localised = isLocalised(state.shape);
				const transform = Transforms[name];

				const accepted = localised ? (transform.accepts === "string" && transform.returns === "*")
					: transform.accepts === "*" ? true
						: transform.accepts === "numeric" ? isNumeric(state.shape)
							: transform.accepts === "string" ? isTextual(state.shape)
								: transform.accepts === "temporal" ? isTemporal(state.shape)
									: false;

				return !accepted || (transform.aggregate && state.aggregate) ? undefined : {

					aggregate: state.aggregate || transform.aggregate,

					shape: transform.returns === "*" ? state.shape
						: transform.returns === "integer" ? integer()
							: transform.returns === "decimal" ? decimal()
								: transform.returns === "string" ? (localised ? state.shape : string())
									: error<ValueShape>(`unsupported transform output type '${transform.returns}'`)

				};

			}

		}, {

			aggregate: false,
			shape

		})?.shape;

	}


	function isNumeric(shape: ValueShape) {
		return shape.kind === "number";
	}

	function isTextual(shape: ValueShape) {
		return shape.kind === "string" && !Temporal.has(shape.model);
	}

	function isTemporal(shape: ValueShape) {
		return shape.kind === "string" && Temporal.has(shape.model);
	}

	function isLocalised(shape: ValueShape) {
		return shape.kind === "local" || shape.kind === "locals";
	}


	/**
	 * Convert a focus to range, wrapping multiple variants into a union.
	 */
	function toRange({ minCount, maxCount, variants }: Focus): Range {

		return immutable({

			kind: "range",

			minCount,
			maxCount,

			shape: variants.length === 1 ? variants[0] : {

				kind: "union",

				model: Object.fromEntries(variants.map((s, i) => [s.kind+"#"+i, s.model])),
				variants: Object.fromEntries(variants.map((s, i) => [s.kind+"#"+i, s]))

			}

		});

	}

}
