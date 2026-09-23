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
 * String shape assembly.
 *
 * Builds the shape a factory states into the form its consumers read, and combines it with the one it overrides: a
 * shape admitting no value at all is rejected as it is built rather than when a value is first matched against it, and
 * an extension is held to the shape it refines before either is committed to.
 *
 * @module
 */

import { isRegExp, type Optional } from "@metreeca/core";
import { immutable } from "@metreeca/core/values";
import { all, test, type Trace } from "@metreeca/core/trace";
import { checkDomain, intersect, narrowsDatatype, narrowsDomain, reject, unite } from "../value/assembler.js";
import { type StringConstraints, type StringShape } from "./index.js";


/**
 * Assembles a string shape.
 *
 * Backs every factory the {@link string!} module exposes, fixing what they share: a stated `pattern` is normalised to
 * its source, so that a built shape carries the lexical constraint in the single form {@link StringShape} states, and
 * contradictory constraints are rejected as the shape is built, so that a shape that exists admits at least one value.
 *
 * @typeParam V The values the shape admits, as stated by the signature of the calling factory
 *
 * @param constraints The stated shape {@link StringConstraints constraints}
 *
 * @returns An immutable shape admitting the strings the constraints bound
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where the stated constraints contradict one another
 */
export function assemble<V extends string>(constraints: StringConstraints): StringShape<V> {

	const shape = immutable({

		kind: "string",

		...constraints,

		pattern: isRegExp(constraints.pattern) ? constraints.pattern.source : constraints.pattern

	}) as StringShape<V>; // ;(cast) the factory signatures fix the admitted values to the enumerated ones

	reject("inconsistent string shape constraints", checkString(shape));

	return shape;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks a set of textual constraints for internal consistency.
 *
 * Reports the contradictions that would leave a shape admitting no value at all, so that a shape is rejected as it is
 * built rather than when a value is first matched against it.
 *
 * @param constraints The constraints to check
 *
 * @returns A trace of the inconsistencies found, or `undefined` where the constraints admit at least one value
 */
export function checkString(constraints: Partial<StringShape>): Optional<Trace> {

	return all<typeof constraints>(
		test(({ minLength, maxLength }) => {

			return minLength === undefined || maxLength === undefined || minLength <= maxLength || [
				`{minLength/maxLength} inconsistent bounds <${minLength}> > <${maxLength}>`
			];

		}),
		checkDomain()
	)(constraints);

}

/**
 * Reports whether a string shape narrows an inherited one.
 *
 * Tests the override relation without building the merged shape, so that an incompatible extension is told apart from
 * a legitimate refinement before either is committed to: a shape narrows the inherited one where it matches its
 * `datatype` and `pattern`, leaves neither length bound wider, keeps at least one of its admitted values, requires
 * every value it requires, and yields a consistent set of merged constraints.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns A trace of the obstacles to the override, or `undefined` where `target` narrows `source`
 */
export function narrowsString(target: StringShape, source: StringShape): Optional<Trace> {

	return all<StringShape>(
		narrowsDatatype(source),
		test(({ pattern }) => {

			return pattern === undefined || source.pattern === undefined || pattern === source.pattern || [
				`{pattern} mismatched patterns <${pattern}> and <${source.pattern}>`
			];

		}),
		test(({ minLength }) => {

			return minLength === undefined || source.minLength === undefined || minLength >= source.minLength || [
				`{minLength} widened limit <${minLength}> beyond <${source.minLength}>`
			];

		}),
		test(({ maxLength }) => {

			return maxLength === undefined || source.maxLength === undefined || maxLength <= source.maxLength || [
				`{maxLength} widened limit <${maxLength}> beyond <${source.maxLength}>`
			];

		}),
		narrowsDomain(source),
		() => checkString(merge(target, source)) // post-merge constraint consistency
	)(target);

}

/**
 * Merges a string shape with an inherited one.
 *
 * Yields the single shape an extending member is validated against, combining the inherited constraints with the
 * overriding ones: length bounds and `hasValue` requirements accumulate, the admitted values intersect, and `datatype`
 * and `pattern` carry through from whichever shape states them.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns An immutable shape admitting the values both `target` and `source` admit
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `target` doesn't narrow `source`
 */
export function mergeString(target: StringShape, source: StringShape): StringShape {

	reject("incompatible string shape override", narrowsString(target, source));

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
function merge(target: StringShape, source: StringShape): Omit<StringShape, "kind"> {

	return {

		// structural: datatype, pattern — equal where both are stated

		datatype: target.datatype ?? source.datatype,
		pattern: target.pattern ?? source.pattern,

		// conjunctive: lengths — the tighter bound

		minLength: target.minLength ?? source.minLength,
		maxLength: target.maxLength ?? source.maxLength,

		// conjunctive: in — intersection; hasValue — union

		in: intersect(target.in, source.in),
		hasValue: unite(target.hasValue, source.hasValue)

	};

}
