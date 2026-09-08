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
 * String shape operators.
 *
 * @module
 */

import { isString } from "@metreeca/core";
import { union } from "@metreeca/core/arrays";
import { immutable } from "@metreeca/core/structures";
import {
	all,
	array,
	domain,
	length,
	pass,
	test,
	type Trace,
	TraceError,
	type,
	type Validator,
	values as contains
} from "@metreeca/core/trace";
import { type Scope } from "./index.core.js";
import type { StringShape } from "./string.js";


/**
 * Checks internal consistency of string shape constraints.
 *
 * @param constraints The constraint fields to validate
 *
 * @returns A trace of consistency violations, or `undefined` if all constraints are consistent
 */
export function checkString(constraints: Partial<StringShape>): undefined | Trace {

	return all<typeof constraints>(
		test(({ minLength, maxLength }) => {

			return minLength === undefined || maxLength === undefined || minLength <= maxLength || [
				`{minLength/maxLength} inconsistent bounds <${minLength}> > <${maxLength}>`
			];

		}),
		test(({ in: allowed, hasValue }) => {

			return hasValue === undefined || allowed === undefined || hasValue.every(v => allowed.includes(v)) || [
				`{hasValue/in} required values <${hasValue.filter(v => !allowed.includes(v))}> not in allowed set`
			];

		})
	)(constraints);

}

/**
 * Reports whether an overriding string shape narrows an inherited base shape.
 *
 * Tests the override relation without building the merged shape: returns `undefined` when `target` only tightens
 * `source` (matching `datatype` and `pattern`, lengths not widened, `in` intersection non-empty, merged
 * constraints consistent), or a {@link Trace} describing the obstacles otherwise.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns A trace of narrowing obstacles, or `undefined` when `target` narrows `source`
 */
export function narrowsString(target: StringShape, source: StringShape): undefined | Trace {

	return all<StringShape>(
		test(({ datatype }) => {

			return datatype === undefined || source.datatype === undefined || datatype === source.datatype || [
				`{datatype} mismatched datatypes <${datatype}> and <${source.datatype}>`
			];

		}),
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
		test(({ in: values }) => {

			return values === undefined || source.in === undefined || values.some(v => source.in!.includes(v)) || [
				`{in} disjoint sets [${values}] and [${source.in}]`
			];

		}),
		() => checkString({ // post-merge constraint consistency

			minLength: target.minLength ?? source.minLength,
			maxLength: target.maxLength ?? source.maxLength,

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
 * Merges an overriding string shape with an inherited base shape.
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
export function mergeString(target: StringShape, source: StringShape): StringShape {

	const trace = narrowsString(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible string shape override", trace);
	}

	// structural: pattern — equal when both defined (enforced by narrowsString)

	const pattern = target.pattern ?? source.pattern;

	// conjunctive: in — intersection

	const allowed = target.in !== undefined && source.in !== undefined
		? target.in.filter(v => source.in!.includes(v))
		: target.in ?? source.in;

	// conjunctive: hasValue — union

	const hasValue = target.hasValue !== undefined && source.hasValue !== undefined
		? union<string>([target.hasValue, source.hasValue])
		: target.hasValue ?? source.hasValue;

	// merged constraints

	const minLength = target.minLength ?? source.minLength;
	const maxLength = target.maxLength ?? source.maxLength;

	// build shape — casts are safe: non-emptiness validated above

	return immutable({

		kind: target.kind,
		model: target.model,
		datatype: target.datatype ?? source.datatype,

		pattern,
		minLength,
		maxLength,

		in: allowed,
		hasValue

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a string shape.
 *
 * Reports each non-string value as a `{kind}` violation, then enforces the string value-domain constraints on the
 * matching values, keying every element violation by its index. Membership over the whole set (`hasValue`) is reported
 * as a leading bare message.
 *
 * @param values The values to validate
 * @param shape The string shape defining validation constraints
 * @param opts Validation options
 * @param opts.scope The validation scope: `"state"` enforces every constraint; `"bound"` keeps `pattern` (the syntactic
 *     discriminator over an open datatype set) but skips the value-domain magnitude constraints (length, `in`,
 *     `hasValue`); `"model"` skips every constraint and matches by kind alone. Defaults to `"state"`
 *
 * @returns A trace of validation violations, or `undefined` if all values are valid
 */
export function validateString(values: readonly unknown[], shape: StringShape, {

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

		minLength,
		maxLength,

		pattern,

		in: allowed,
		hasValue: required

	}: StringShape) {

		return array(
			type(isString,
				all(
					length(minLength, maxLength),
					domain(allowed),
					format(pattern)
				)
			),
			contains(required)
		);

	}

	function bound({

		pattern

	}: StringShape) {

		return array(
			type(isString,
				format(pattern)
			)
		);

	}

	function model({}: StringShape) {

		return array(
			type(isString)
		);

	}

	function format(pattern: undefined | string): Validator<string> {

		if ( pattern === undefined ) {

			return pass;

		} else {

			const regex = new RegExp(pattern);
			const mismatched = [`{format} expected string matching </${pattern}/>`];

			return test(value => regex.test(value) || mismatched);

		}

	}

}
