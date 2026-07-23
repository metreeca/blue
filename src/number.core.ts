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
 * Number shape operators.
 *
 * @module
 */

import { isNumber } from "@metreeca/core";
import { union } from "@metreeca/core/combo";
import { immutable } from "@metreeca/core/deep";
import {
	all,
	array,
	domain,
	gt,
	gte,
	integer,
	lt,
	lte,
	test,
	type Trace,
	TraceError,
	type,
	values as contains
} from "@metreeca/core/trace";
import { type Scope } from "./index.core.js";
import type { NumberShape } from "./number.js";


/**
 * Checks internal consistency of number shape constraints.
 *
 * @param constraints The constraint fields to validate
 *
 * @returns A trace of consistency violations, or `undefined` if all constraints are consistent
 */
export function checkNumber(constraints: Partial<NumberShape>): undefined | Trace {

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
		test(({ integral }) => {

			const lower = Math.max(
				constraints.minInclusive !== undefined ? Math.ceil(constraints.minInclusive) : -Infinity,
				constraints.minExclusive !== undefined ? Math.floor(constraints.minExclusive)+1 : -Infinity
			);

			const upper = Math.min(
				constraints.maxInclusive !== undefined ? Math.floor(constraints.maxInclusive) : Infinity,
				constraints.maxExclusive !== undefined ? Math.ceil(constraints.maxExclusive)-1 : Infinity
			);

			return !integral || lower <= upper || [
				`{range} no integer within bounds <[${lower}, ${upper}]>`
			];

		})
	)(constraints);

}


/**
 * Reports whether an overriding number shape narrows an inherited base shape.
 *
 * Tests the override relation without building the merged shape: returns `undefined` when `target` only tightens
 * `source` (matching `datatype`, not dropping `integral`, bounds not widened, `in` intersection non-empty,
 * merged constraints consistent), or a {@link Trace} describing the obstacles otherwise.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns A trace of narrowing obstacles, or `undefined` when `target` narrows `source`
 */
export function narrowsNumber(target: NumberShape, source: NumberShape): undefined | Trace {

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

			return values === undefined || source.in === undefined || values.some(v => source.in!.includes(v)) || [
				`{in} disjoint sets [${values}] and [${source.in}]`
			];

		}),
		() => checkNumber({ // post-merge constraint consistency

			integral: target.integral ?? source.integral,

			minExclusive: target.minExclusive ?? source.minExclusive,
			maxExclusive: target.maxExclusive ?? source.maxExclusive,
			minInclusive: target.minInclusive ?? source.minInclusive,
			maxInclusive: target.maxInclusive ?? source.maxInclusive,

			in: target.in !== undefined && source.in !== undefined
				? target.in.filter(v => source.in!.includes(v))
				: target.in ?? source.in,

			hasValue: target.hasValue !== undefined && source.hasValue !== undefined
				? union([target.hasValue, source.hasValue])
				: target.hasValue ?? source.hasValue

		})
	)(target);

}

/**
 * Merges an overriding number shape with an inherited base shape.
 *
 * Combines constraints from `source` into `target`, enforcing that overrides only narrow inherited definitions.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns The merged shape with combined constraints
 *
 * @throws {TraceError} On incompatible overrides
 */
export function mergeNumber(target: NumberShape, source: NumberShape): NumberShape {

	const trace = narrowsNumber(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible number shape override", trace);
	}

	// conjunctive: in — intersection

	const allowed = target.in !== undefined && source.in !== undefined
		? target.in.filter(v => source.in!.includes(v))
		: target.in ?? source.in;

	// conjunctive: hasValue — union

	const hasValue = target.hasValue !== undefined && source.hasValue !== undefined
		? union([target.hasValue, source.hasValue])
		: target.hasValue ?? source.hasValue;

	// merged constraints

	const minExclusive = target.minExclusive ?? source.minExclusive;
	const maxExclusive = target.maxExclusive ?? source.maxExclusive;
	const minInclusive = target.minInclusive ?? source.minInclusive;
	const maxInclusive = target.maxInclusive ?? source.maxInclusive;

	// build shape — casts are safe: non-emptiness validated above

	return immutable({

		kind: target.kind,
		model: target.model,
		datatype: target.datatype ?? source.datatype,

		integral: target.integral ?? source.integral,

		minExclusive,
		maxExclusive,
		minInclusive,
		maxInclusive,

		in: allowed,
		hasValue

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a number shape.
 *
 * Reports each non-numeric value as a `{kind}` violation, then enforces the numeric value-domain constraints on the
 * matching values, keying every element violation by its index. Membership over the whole set (`hasValue`) is reported
 * as a leading bare message.
 *
 * @param values The values to validate
 * @param shape The number shape defining validation constraints
 * @param opts Validation options
 * @param opts.scope The validation scope: `"state"` enforces every constraint, while `"bound"` and `"model"` skip the
 *     value-domain constraints and match by kind alone, so the value need not be legal. A number carries no `pattern`,
 *     so `"bound"` coincides with `"model"` here. Defaults to `"state"`
 *
 * @returns A trace of validation violations, or `undefined` if all values are valid
 */
export function validateNumber(values: readonly unknown[], shape: NumberShape, {

	scope = "state"

}: {

	scope?: Scope

} = {}): undefined | Trace {

	switch ( scope ) {

		case "state":

			return state(shape)(values);

		case "bound":

			return bound(shape)(values);

		case "model":

			return model(shape)(values);

	}


	function state({

		minExclusive,
		maxExclusive,
		minInclusive,
		maxInclusive,

		integral,

		in: allowed,
		hasValue: required

	}: NumberShape) {

		return array(
			type(isNumber,
				all(
					integral && integer(),
					gt(minExclusive),
					lt(maxExclusive),
					gte(minInclusive),
					lte(maxInclusive),
					domain(allowed)
				)
			),
			contains(required)
		);

	}

	function bound({}: NumberShape) {

		return array(
			type(isNumber)
		);

	}

	function model({}: NumberShape) {

		return array(
			type(isNumber)
		);

	}

}
