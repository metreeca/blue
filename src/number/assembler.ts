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
 * Number shape assembly.
 *
 * Builds the shape a factory states into the form its consumers read, and combines it with the one it overrides: a
 * shape admitting no value at all is rejected as it is built rather than when a value is first matched against it, and
 * an extension is held to the shape it refines before either is committed to.
 *
 * @module
 */

import { type Optional } from "@metreeca/core";
import { union } from "@metreeca/core/arrays";
import { immutable } from "@metreeca/core/structures";
import { all, test, type Trace, TraceError } from "@metreeca/core/trace";
import { type NumberConstraints, type NumberShape } from "./index.js";


/**
 * Assembles a number shape.
 *
 * Backs every factory the {@link number!} module exposes, fixing what they share: contradictory constraints are
 * rejected as the shape is built, so that a shape that exists admits at least one value.
 *
 * @typeParam V The values the shape admits, as stated by the signature of the calling factory
 *
 * @param constraints The stated shape {@link NumberConstraints constraints}
 *
 * @returns An immutable shape admitting the numbers the constraints bound
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where the stated constraints contradict one another
 */
export function assemble<V extends number>(constraints: NumberConstraints): NumberShape<V> {

	const shape = immutable({

		kind: "number",

		...constraints

	}) as NumberShape<V>; // ;(cast) the factory signatures fix the admitted values to the enumerated ones

	const trace = checkNumber(shape);

	if ( trace !== undefined ) {
		throw new TraceError("inconsistent number shape constraints", trace);
	}

	return shape;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks a set of numeric constraints for internal consistency.
 *
 * Reports the contradictions that would leave a shape admitting no value at all, bounds crossing one another and an
 * integral range enclosing no integer among them, so that a shape is rejected as it is built rather than when a value
 * is first matched against it.
 *
 * @param constraints The constraints to check
 *
 * @returns A trace of the inconsistencies found, or `undefined` where the constraints admit at least one value
 */
export function checkNumber(constraints: Partial<NumberShape>): Optional<Trace> {

	return all<typeof constraints>(
		test(({ minExclusive, maxExclusive }) => {

			return minExclusive === undefined || maxExclusive === undefined || minExclusive < maxExclusive || [
				`{minExclusive/maxExclusive} inconsistent bounds <${minExclusive}> >= <${maxExclusive}>`
			];

		}),
		test(({ minInclusive, maxInclusive }) => {

			return minInclusive === undefined || maxInclusive === undefined || minInclusive <= maxInclusive || [
				`{minInclusive/maxInclusive} inconsistent bounds <${minInclusive}> > <${maxInclusive}>`
			];

		}),
		test(({ minExclusive, maxInclusive }) => {

			return minExclusive === undefined || maxInclusive === undefined || minExclusive < maxInclusive || [
				`{minExclusive/maxInclusive} inconsistent bounds <${minExclusive}> >= <${maxInclusive}>`
			];

		}),
		test(({ minInclusive, maxExclusive }) => {

			return minInclusive === undefined || maxExclusive === undefined || minInclusive < maxExclusive || [
				`{minInclusive/maxExclusive} inconsistent bounds <${minInclusive}> >= <${maxExclusive}>`
			];

		}),
		test(({ in: allowed, hasValue }) => {

			return hasValue === undefined || allowed === undefined || hasValue.every(v => allowed.includes(v)) || [
				`{hasValue/in} required values <${hasValue.filter(v => !allowed.includes(v))}> not in allowed set`
			];

		}),
		test(({ integral, minExclusive }) => {

			return !integral || minExclusive === undefined || Number.isInteger(minExclusive) || [
				`{minExclusive} fractional bound <${minExclusive}> on integral shape`
			];

		}),
		test(({ integral, maxExclusive }) => {

			return !integral || maxExclusive === undefined || Number.isInteger(maxExclusive) || [
				`{maxExclusive} fractional bound <${maxExclusive}> on integral shape`
			];

		}),
		test(({ integral, minInclusive }) => {

			return !integral || minInclusive === undefined || Number.isInteger(minInclusive) || [
				`{minInclusive} fractional bound <${minInclusive}> on integral shape`
			];

		}),
		test(({ integral, maxInclusive }) => {

			return !integral || maxInclusive === undefined || Number.isInteger(maxInclusive) || [
				`{maxInclusive} fractional bound <${maxInclusive}> on integral shape`
			];

		}),
		test(({ integral, in: allowed }) => {

			return !integral || allowed === undefined || allowed.every(v => Number.isInteger(v)) || [
				`{in} fractional values [${allowed.filter(v => !Number.isInteger(v))}] on integral shape`
			];

		}),
		test(({ integral, hasValue }) => {

			return !integral || hasValue === undefined || hasValue.every(v => Number.isInteger(v)) || [
				`{hasValue} fractional values [${hasValue.filter(v => !Number.isInteger(v))}] on integral shape`
			];

		}),
		test(({ integral, minInclusive, minExclusive, maxInclusive, maxExclusive }) => {

			const lower = Math.max(
				minInclusive !== undefined ? Math.ceil(minInclusive) : -Infinity,
				minExclusive !== undefined ? Math.floor(minExclusive)+1 : -Infinity
			);

			const upper = Math.min(
				maxInclusive !== undefined ? Math.floor(maxInclusive) : Infinity,
				maxExclusive !== undefined ? Math.ceil(maxExclusive)-1 : Infinity
			);

			return !integral || lower <= upper || [
				`{range} no integer within bounds <[${lower}, ${upper}]>`
			];

		})
	)(constraints);

}

/**
 * Reports whether a number shape narrows an inherited one.
 *
 * Tests the override relation without building the merged shape, so that an incompatible extension is told apart from
 * a legitimate refinement before either is committed to: a shape narrows the inherited one where it matches its
 * `datatype`, keeps its integrality, leaves no bound wider, keeps at least one of its admitted values, requires every
 * value it requires, and yields a consistent set of merged constraints.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns A trace of the obstacles to the override, or `undefined` where `target` narrows `source`
 */
export function narrowsNumber(target: NumberShape, source: NumberShape): Optional<Trace> {

	const { in: allowed, hasValue: required } = source;

	return all<NumberShape>(
		test(({ datatype }) => {

			return datatype === undefined || source.datatype === undefined || datatype === source.datatype || [
				`{datatype} mismatched datatypes <${datatype}> and <${source.datatype}>`
			];

		}),
		test(({ integral }) => {

			return integral !== false || source.integral !== true || [
				`{integral} dropped integral constraint`
			];

		}),
		test(({ minExclusive }) => {

			return minExclusive === undefined
				|| source.minExclusive === undefined
				|| minExclusive >= source.minExclusive
				|| [
					`{minExclusive} widened limit <${minExclusive}> beyond <${source.minExclusive}>`
				];

		}),
		test(({ maxExclusive }) => {

			return maxExclusive === undefined
				|| source.maxExclusive === undefined
				|| maxExclusive <= source.maxExclusive
				|| [
					`{maxExclusive} widened limit <${maxExclusive}> beyond <${source.maxExclusive}>`
				];

		}),
		test(({ minInclusive }) => {

			return minInclusive === undefined
				|| source.minInclusive === undefined
				|| minInclusive >= source.minInclusive
				|| [
					`{minInclusive} widened limit <${minInclusive}> beyond <${source.minInclusive}>`
				];

		}),
		test(({ maxInclusive }) => {

			return maxInclusive === undefined
				|| source.maxInclusive === undefined
				|| maxInclusive <= source.maxInclusive
				|| [
					`{maxInclusive} widened limit <${maxInclusive}> beyond <${source.maxInclusive}>`
				];

		}),
		test(({ in: values }) => {

			// a child listing a value the parent omits would be intersected away, leaving the state wider than
			// the shape admits, so a widened set is rejected outright as with the bounds

			return values === undefined || allowed === undefined || values.every(v => allowed.includes(v)) || [
				`{in} unexpected values [${values.filter(v => !allowed.includes(v))}]`
			];

		}),
		test(({ hasValue }) => {

			// hasValue floors the value set, so a required value the child omits would be unioned back in,
			// leaving the child stating a weaker requirement than it enforces

			return hasValue === undefined || required === undefined || required.every(v => hasValue.includes(v)) || [
				`{hasValue} missing required values [${required.filter(v => !hasValue.includes(v))}]`
			];

		}),
		() => checkNumber(merge(target, source)) // post-merge constraint consistency
	)(target);

}

/**
 * Merges a number shape with an inherited one.
 *
 * Yields the single shape an extending member is validated against, combining the inherited constraints with the
 * overriding ones: bounds and `hasValue` requirements accumulate, the admitted values intersect, and `datatype` and
 * `integral` carry through from whichever shape states them. Inclusive and exclusive bounds accumulate independently,
 * so a child may narrow a range through the bound of its choice without dropping the inherited one.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns An immutable shape admitting the values both `target` and `source` admit
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `target` doesn't narrow `source`
 */
export function mergeNumber(target: NumberShape, source: NumberShape): NumberShape {

	const trace = narrowsNumber(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible number shape override", trace);
	}

	return immutable({

		kind: target.kind,

		...merge(target, source)

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Combines the constraints of an overriding shape with the inherited ones.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns The merged constraints, as they stand before they are checked for consistency
 */
function merge(target: NumberShape, source: NumberShape): Omit<NumberShape, "kind"> {

	const { in: allowed, hasValue: required } = source;

	return {

		// structural: datatype — equal where both are stated

		datatype: target.datatype ?? source.datatype,

		// conjunctive: integral — added but never dropped

		integral: target.integral ?? source.integral,

		// conjunctive: bounds — the tighter limit, each pair merged independently

		minExclusive: target.minExclusive ?? source.minExclusive,
		maxExclusive: target.maxExclusive ?? source.maxExclusive,
		minInclusive: target.minInclusive ?? source.minInclusive,
		maxInclusive: target.maxInclusive ?? source.maxInclusive,

		// conjunctive: in — intersection; hasValue — union

		in: target.in !== undefined && allowed !== undefined
			? target.in.filter(v => allowed.includes(v))
			: target.in ?? allowed,

		hasValue: target.hasValue !== undefined && required !== undefined
			? union<number>([target.hasValue, required])
			: target.hasValue ?? required

	};

}
