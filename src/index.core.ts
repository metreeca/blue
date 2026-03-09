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
 * Value shape operators.
 *
 * @module
 */

import { type Identifier, isFunction, isObject, type Lazy } from "@metreeca/core";
import { error as report } from "@metreeca/core/error";
import { immutable } from "@metreeca/core/nested";
import { type Probe, type Transform } from "@metreeca/qest/model";
import { mergeBoolean, validateBoolean } from "./boolean.core.js";
import type { BooleanShape } from "./boolean.js";
import type { ValueShape } from "./index.js";
import { mergeLocal, mergeLocals, validateLocal, validateLocals } from "./local.core.js";
import type { LocalShape, LocalsShape } from "./local.js";
import { mergeNumber, validateNumber } from "./number.core.js";
import type { NumberShape } from "./number.js";
import { decimal, integer } from "./number.js";
import { flatten, mergeReference, mergeResource, validateReference, validateResource } from "./resource.core.js";
import type { Range, ReferenceShape, ResourceShape, Union } from "./resource.js";
import { mergeString, validateString } from "./string.core.js";
import { date, duration, instant, iri, string, type StringShape, time, timestamp, year } from "./string.js";
import type { Trace } from "./trace.js";


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

	readonly accepts: "any" | "numeric" | "temporal" | "string",
	readonly returns: "same" | "integer" | "decimal" | "string"

}> = immutable({

	count: { aggregate: true, accepts: "any", returns: "integer" },
	min: { aggregate: true, accepts: "any", returns: "same" },
	max: { aggregate: true, accepts: "any", returns: "same" },
	sum: { aggregate: true, accepts: "numeric", returns: "same" },
	avg: { aggregate: true, accepts: "numeric", returns: "decimal" },

	abs: { aggregate: false, accepts: "numeric", returns: "same" },
	floor: { aggregate: false, accepts: "numeric", returns: "same" },
	ceil: { aggregate: false, accepts: "numeric", returns: "same" },
	round: { aggregate: false, accepts: "numeric", returns: "same" },

	lower: { aggregate: false, accepts: "string", returns: "same" },
	upper: { aggregate: false, accepts: "string", returns: "same" },
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


/**
 * Cache for materialized values from factory functions.
 *
 * Uses WeakMap so factories with unstable identity (local functions, lambdas)
 * can be garbage collected when they go out of scope.
 */
const cache = new WeakMap<() => unknown, unknown>();


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a shape, dispatching to the appropriate type-specific validator.
 *
 * @param values The values to validate
 * @param shape The shape defining validation constraints
 *
 * @returns A keyed trace of validation errors, or `undefined` if all values are valid
 */
export function validateValue(values: readonly unknown[], shape: ValueShape): undefined | Trace {

	switch ( shape.kind ) {

		case "boolean":

			return validateBoolean(values, shape);

		case "number":

			return validateNumber(values, shape);

		case "string":

			return validateString(values, shape);

		case "local":

			return validateLocal(values, shape);

		case "locals":

			return validateLocals(values, shape);

		case "reference":

			return validateReference(values, shape);

		case "resource":

			return validateResource(values, shape);

	}

}

/**
 * Merges an overriding value shape with an inherited base shape.
 *
 * Dispatches to the appropriate shape-specific merge function based on the `kind` discriminator.
 * Both shapes must have the same `kind`; a mismatch throws a `RangeError`.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns The merged shape
 *
 * @throws {RangeError} On kind mismatch or incompatible overrides
 */
export function mergeValue<T extends ValueShape>(target: T, source: T): T {

	switch ( target.kind ) {

		case "boolean":

			return mergeBoolean(target, source as BooleanShape) as T;

		case "number":

			return mergeNumber(target, source as NumberShape) as T;

		case "string":

			return mergeString(target, source as StringShape) as T;

		case "local":

			return mergeLocal(target, source as LocalShape) as T;

		case "locals":

			return mergeLocals(target, source as LocalsShape) as T;

		case "reference":

			return mergeReference(target, source as ReferenceShape) as T;

		case "resource":

			return mergeResource(target, source as ResourceShape) as T;

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Applies a probe to a value shape, resolving the effective output {@link Range}.
 *
 * **Shape dispatch** — dispatches on the input shape kind:
 *
 * - {@link ResourceShape}: traverses path segments through nested properties as detailed below
 * - {@link ReferenceShape}: materialises the lazy target shape and proceeds as for {@link ResourceShape}
 * - Other shapes: returns `undefined` for any non-empty path since leaf shapes have no traversable properties,
 *   then applies the transform pipe and returns the resolved {@link Range}
 *
 * **Path traversal** — traverses the probe's `path` segments through nested resource properties, flattening
 * inheritance at each step. If a step references an unknown property, the path resolves to `undefined` at runtime.
 * At {@link Union} boundaries, variants that lack the property are skipped; only if no variant defines it does the
 * path resolve to `undefined`.
 *
 * **Pipe application** — applies the probe's `pipe` transforms to the shape resolved by path traversal. A domain
 * violation, that is a transform applied outside its declared domain, resolves to `undefined` at runtime. An invalid
 * composition (aggregate after aggregate) is rejected.
 *
 * **Path cardinality** — accumulated product of the cardinality constraints at each traversed step:
 *
 * - `maxCount` is the product of `maxCount` at each step; if any step has `maxCount` undefined, the result is undefined
 * - `minCount` is the product of `minCount` at each step; if any step has `minCount` undefined or `0`, the result is
 *   undefined
 * - {@link Union} steps do not introduce additional cardinality; the cardinality of the property containing the union
 *   applies to all branches collectively
 *
 * **Pipe cardinality** — applied after path cardinality:
 *
 * - all transforms set `minCount` to undefined
 * - scalar transforms preserve `maxCount` from the path
 * - aggregate transforms set `maxCount` to `1`
 *
 * @param probe The probe containing path and transform pipe
 *
 * @param shape The input value shape to resolve
 * @returns An immutable output {@link Range} with accumulated cardinality, or `undefined` when the probe is
 *     demonstrated to never produce a valid value at runtime
 *
 * @see {@link https://metreeca.github.io/qest/documents/model.Model_Design.html Model Design}
 */
export function apply(probe: Probe, shape: ValueShape): undefined | Range {

	type Focus = {

		readonly minCount?: number
		readonly maxCount?: number

		readonly variants: readonly ValueShape[]

	}


	const { pipe, path } = probe;


	return transform(traverse(
		shape.kind === "reference" // materialise reference shapes to their target resource shape
			? materialize(shape.shape)
			: shape
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

		const resolved = shape.kind === "resource" ? flatten(shape)
			: shape.kind === "reference" ? flatten(materialize(shape.shape))
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
	 * Apply the transform pipe to each variant, adjusting cardinality and assembling the output range.
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

				const accepted = localised ? (transform.accepts === "string" && transform.returns === "same")
					: transform.accepts === "any" ? true
						: transform.accepts === "numeric" ? isNumeric(state.shape)
							: transform.accepts === "string" ? isTextual(state.shape)
								: transform.accepts === "temporal" ? isTemporal(state.shape)
									: false;

				return !accepted || (transform.aggregate && state.aggregate) ? undefined : {

					aggregate: state.aggregate || transform.aggregate,

					shape: transform.returns === "same" ? state.shape
						: transform.returns === "integer" ? integer()
							: transform.returns === "decimal" ? decimal()
								: transform.returns === "string" ? (localised ? state.shape : string())
									: report<ValueShape>(`unsupported transform output type '${transform.returns}'`)

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
	 * Convert a focus to an output range, wrapping multiple variants into a union.
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

/**
 * Resolves a lazy value, caching factory results for idempotent materialisation.
 *
 * When given a factory function, returns the cached result if available, otherwise calls the factory, caches the
 * result, and returns it. Direct values are returned unchanged.
 *
 * @param lazy A value or factory function returning a value
 *
 * @returns The resolved value
 */
export function materialize<T>(lazy: Lazy<T>): T {

	if ( isFunction(lazy) ) {

		const cached = cache.get(lazy);

		if ( cached === undefined ) {

			const resolved = lazy();

			cache.set(lazy, resolved);

			return resolved;

		} else {

			return cached as T;

		}

	} else {

		return lazy;

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks whether a value carries all symbol-keyed properties with the expected payloads.
 *
 * Supports idempotency patterns where repeated operations can be skipped on already-processed values.
 * Keys mapped to `undefined` act as wildcards, checking only for key presence without comparing payloads.
 *
 * @param value The value to check
 * @param tags Map of symbol keys to expected payloads; all entries must match. `undefined` values match any payload
 *
 * @returns `true` if `value` is an object carrying all specified symbol-keyed properties with matching payloads;
 *     `false` otherwise
 */
export function branded<T extends Record<symbol, unknown>>(value: unknown, tags: T): value is Record<keyof T, unknown> {

	if ( isObject(value) ) {

		return Object.getOwnPropertySymbols(tags).every(symbol =>
			symbol in value && (tags[symbol] === undefined || tags[symbol] === value[symbol])
		);

	} else {

		return false;

	}

}

/**
 * Attaches symbol-keyed properties to a value, returning an immutable copy.
 *
 * Supports idempotency patterns where repeated operations can be skipped on already-processed values.
 * Non-object values are returned unchanged.
 *
 * @typeParam V The value type
 *
 * @param value The value to brand
 * @param tags Map of symbol keys to payloads to attach
 *
 * @returns An immutable copy of the value with all symbol-keyed properties attached; non-object values are returned
 *     unchanged
 */
export function brand<V>(value: V, tags: { readonly [key: symbol]: unknown }): V {

	if ( isObject(value) ) {

		return immutable(Object.getOwnPropertySymbols(tags).reduce(
			(copy, symbol) => Object.defineProperty(copy, symbol, {

				enumerable: false,
				configurable: true,

				value: tags[symbol]

			}),
			Object.isExtensible(value) ? value : { ...value }
		));

	} else {

		return value;

	}

}
