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
 * Core validation utilities and type guards.
 *
 * Provides internal validation infrastructure including trace and shape type guards, lazy value materialisation with
 * caching, trace collection utilities, and the central value validation dispatcher.
 *
 * @module
 */

import {
	type Identifier,
	isArray,
	isBoolean,
	isFunction,
	isIdentifier,
	isNumber,
	isObject,
	isString,
	type Lazy
} from "@metreeca/core";
import { immutable } from "@metreeca/core/nested";
import { isLocal, isLocals, isReference, isResource, type Value } from "@metreeca/qest/state";
import { isBooleanShape, validateBoolean } from "./boolean.core.js";
import type { Trace, Validator, ValueShape } from "./index.js";
import { isLocalShape, isLocalsShape, validateLocal, validateLocals } from "./local.core.js";
import { isNumberShape, validateNumber } from "./number.core.js";
import { isReferenceShape, isResourceShape, validateReference, validateResource } from "./resource.core.js";
import { isStringShape, validateString } from "./string.core.js";


/**
 * Cache for materialized values from factory functions.
 *
 * Uses WeakMap so factories with unstable identity (local functions, lambdas)
 * can be garbage collected when they go out of scope.
 */
const cache = new WeakMap<() => unknown, unknown>();


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks whether a value is a valid {@link Trace}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` is an array of strings or nested trace dictionaries; false otherwise
 */
export function isTrace(value: unknown): value is Trace {
	return isArray(value, v => isString(v) || isObject(v, (v, k) =>
			isIdentifier(k) && isTrace(v)
		)
	);
}

/**
 * Checks whether a value is a valid {@link Validator}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` is a function; false otherwise
 */
export function isValidator(value: unknown): value is Validator {
	return isFunction(value);
}

/**
 * Checks whether a value is a valid {@link ValueShape}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` is any concrete shape type (boolean, number, string, local, locals, reference, or
 *     resource); false otherwise
 */
export function isValueShape(value: unknown): value is ValueShape {
	return isBooleanShape(value)
		|| isNumberShape(value)
		|| isStringShape(value)
		|| isLocalShape(value)
		|| isLocalsShape(value)
		|| isReferenceShape(value)
		|| isResourceShape(value);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a shape, dispatching to the appropriate type-specific validator.
 *
 * @param values The values to validate
 * @param shape The shape defining validation constraints
 *
 * @returns A trace of validation errors, empty if all values are valid
 */
export function validateValue(values: readonly Value[], shape: ValueShape): Trace {

	switch ( shape.kind ) {

		case "boolean":

			return [
				...values.flatMap(v => isBoolean(v) ? [] : [`expected boolean values`]),
				...validateBoolean(values.filter(isBoolean), shape)
			];

		case "number":

			return [
				...values.flatMap(v => isNumber(v) ? [] : [`expected number values`]),
				...validateNumber(values.filter(isNumber), shape)
			];

		case "string":

			return [
				...values.flatMap(v => isString(v) ? [] : [`expected string values`]),
				...validateString(values.filter(isString), shape)
			];

		case "local":

			return [
				...values.flatMap(v => isLocal(v) ? [] : [`expected local values`]),
				...validateLocal(values.filter(isLocal), shape)
			];

		case "locals":

			return [
				...values.flatMap(v => isLocals(v) ? [] : [`expected locals values`]),
				...validateLocals(values.filter(isLocals), shape)
			];

		case "reference":

			return [
				...values.flatMap(v => isReference(v) ? [] : [`expected reference values`]),
				...validateReference(values.filter(isReference), shape)
			];

		case "resource":

			return [
				...values.flatMap(v => isResource(v) ? [] : [`expected resource values`]),
				...validateResource(values.filter(isResource), shape)
			];

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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

/**
 * Collects multiple validation traces into a single canonical trace.
 *
 * Returns traces in canonical form: all messages first, followed by a single merged property dictionary (if any).
 * Input traces may contain messages and dictionaries in any order; the output normalises this structure.
 *
 * - Empty input yields an empty trace
 * - Messages deduplicated, empty strings removed, encounter order preserved
 * - Dictionaries merged, empty ones removed, key order preserved, overlapping keys recursively merged
 *
 * @param traces The traces to collect
 *
 * @returns An immutable canonical trace with messages followed by a merged key dictionary
 *
 * @throws {TypeError} If `traces` or any of its elements is not a valid {@link Trace}
 */
export function collect(traces: readonly Trace[]): Trace {

	// inline validation (mirrors isTrace but avoids double traversal on recursion)

	if ( !isArray(traces) ) {
		throw new TypeError(`invalid trace array <type ${typeof traces}>`);
	}


	// reduce traces: validate incrementally, collect issues, merge records

	const { issues, records } = traces.reduce((accumulator, trace) => {

		if ( !isArray(trace) ) {
			throw new TypeError(`invalid trace object <type ${typeof trace}>`);
		}

		trace.forEach(entry => {

			if ( isString(entry) ) {

				if ( entry ) { accumulator.issues.set(entry, (accumulator.issues.get(entry) ?? 0)+1); }

			} else if ( isObject(entry) ) {

				Object.entries(entry).forEach(([key, trace]) => {

					if ( !isIdentifier(key) ) {
						throw new TypeError(`invalid nested trace key <${key}>`);
					}

					accumulator.records[key] = accumulator.records[key] === undefined
						? collect([trace as Trace]) // merge singleton to validate
						: collect([accumulator.records[key], trace as Trace]);
				});

			} else {

				throw new TypeError(`invalid nested trace <type ${typeof trace}>`);

			}

		});

		return accumulator;

	}, {

		issues: new Map<string, number>(),
		records: {}

	} as {

		readonly issues: Map<string, number>;
		readonly records: Record<Identifier, Trace>

	});

	// combine: messages first, merged dictionary at end (if non-empty)

	const deduplicated = [...issues].map(([issue, count]) => count > 1 ? `${issue} (${count})` : issue);

	return immutable(
		Object.keys(records).length > 0 ? [...deduplicated, records] : [...deduplicated],
		isTrace
	);

}
