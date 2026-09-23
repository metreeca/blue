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
import { immutable } from "@metreeca/core/values";
import { all, test, type Trace } from "@metreeca/core/trace";
import { checkDomain, intersect, narrowsDatatype, narrowsDomain, reject, unite } from "../value/assembler.js";
import { type NumberConstraints, type NumberShape } from "./index.js";


/**
 * The facet a numeric range is bounded by at one end.
 */
type Bound =
	| "minExclusive"
	| "maxExclusive"
	| "minInclusive"
	| "maxInclusive"

/**
 * Every bound a range states, in the order they are reported in.
 */
const Bounds: readonly Bound[] = [
	"minExclusive",
	"maxExclusive",
	"minInclusive",
	"maxInclusive"
];

/**
 * The bound pairs enclosing a range, each with whether the lower bound must fall strictly below the upper one.
 */
const Ranges: readonly (readonly [Bound, Bound, boolean])[] = [
	["minExclusive", "maxExclusive", true],
	["minInclusive", "maxInclusive", false],
	["minExclusive", "maxInclusive", true],
	["minInclusive", "maxExclusive", true]
];

/**
 * The bounds an override may only tighten, each with the relation holding it to the inherited limit.
 */
const Limits: readonly (readonly [Bound, (limit: number, inherited: number) => boolean])[] = [
	["minExclusive", (limit, inherited) => limit >= inherited],
	["maxExclusive", (limit, inherited) => limit <= inherited],
	["minInclusive", (limit, inherited) => limit >= inherited],
	["maxInclusive", (limit, inherited) => limit <= inherited]
];


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

	reject("inconsistent number shape constraints", checkNumber(shape));

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
		test(constraints => {

			const crossed = Ranges.flatMap(([min, max, strict]) => {

				const lower = constraints[min];
				const upper = constraints[max];

				return lower === undefined || upper === undefined || (strict ? lower < upper : lower <= upper) ? []
					: [`{${min}/${max}} inconsistent bounds <${lower}> ${strict ? ">=" : ">"} <${upper}>`];

			});

			return crossed.length === 0 || crossed;

		}),
		checkDomain(),
		test(constraints => {

			const fractional = !constraints.integral ? [] : Bounds.flatMap(bound => {

				const limit = constraints[bound];

				return limit === undefined || Number.isInteger(limit) ? []
					: [`{${bound}} fractional bound <${limit}> on integral shape`];

			});

			return fractional.length === 0 || fractional;

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

	return all<NumberShape>(
		narrowsDatatype(source),
		test(({ integral }) => {

			return integral !== false || source.integral !== true || [
				`{integral} dropped integral constraint`
			];

		}),
		test(target => {

			const widened = Limits.flatMap(([bound, narrows]) => {

				const limit = target[bound];
				const inherited = source[bound];

				return limit === undefined || inherited === undefined || narrows(limit, inherited) ? []
					: [`{${bound}} widened limit <${limit}> beyond <${inherited}>`];

			});

			return widened.length === 0 || widened;

		}),
		narrowsDomain(source),
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

	reject("incompatible number shape override", narrowsNumber(target, source));

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

		in: intersect(target.in, source.in),
		hasValue: unite(target.hasValue, source.hasValue)

	};

}
