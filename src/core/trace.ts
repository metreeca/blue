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
 * Trace construction utilities.
 *
 * Provides helpers for building keyed {@link Trace} reports ({@link collect}, {@link every}, {@link group})
 * and normalising raw validation results ({@link normalise}).
 *
 * @module
 */

import { isObject, isString } from "@metreeca/core";
import type { Trace, Validator } from "../index.js";


/**
 * Builds a keyed {@link Trace} from named entries.
 *
 * Filters out `undefined` and empty entries, returning `undefined` when no failures remain.
 *
 * @param entries A record mapping constraint or property names to their individual traces
 *
 * @returns A keyed trace of failures, or `undefined` if all entries pass
 */
export function collect(entries: Record<string, undefined | true | Trace>): undefined | Trace {

	const valid = Object.entries(entries).filter((entry): entry is [string, Trace] =>
		normalise(entry[1]) !== undefined
	);

	return valid.length === 0
		? undefined
		: Object.fromEntries(valid);

}

/**
 * Validates each value individually against a {@link Validator}.
 *
 * When multiple values fail, the result is prefixed with a failure count in the form `(failed/total)`.
 *
 * @typeParam T The value type being validated
 *
 * @param values The values to validate
 * @param validator The per-value validator
 *
 * @returns A violation message with optional count prefix, or `undefined` if all values pass
 */
export function every<T>(values: readonly T[], validator: Validator<T>): undefined | Trace {

	const results = values
		.map((v, i): [number, undefined | Trace] => [i, normalise(validator(v))]);

	const failed = results
		.filter((entry): entry is [number, Trace] => entry[1] !== undefined);

	if ( failed.length === 0 ) {

		return undefined;

	} else if ( values.length <= 1 ) {

		return failed[0][1];

	} else if ( failed.every(([, t]) => isString(t)) ) {

		return `${failed.length > 1 ? `(${failed.length}/${values.length}) ` : ""}${failed[0][1]}`;

	} else {

		return collect(Object.fromEntries(
			failed.map(([i, t]) => [`${i}`, t])
		));

	}

}

/**
 * Validates a collection of values as a whole against a {@link Validator}.
 *
 * Unlike {@link every}, the validator receives the entire collection rather than individual values, enabling
 * set-level constraints such as `hasValue`.
 *
 * @typeParam T The element type of the collection
 *
 * @param values The collection to validate
 * @param validator The set-level validator
 *
 * @returns A violation trace, or `undefined` if the collection passes
 */
export function group<T>(values: readonly T[], validator: Validator<readonly T[]>): undefined | Trace {

	return normalise(validator(values));

}

/**
 * Normalises a validation result to `undefined | {@link Trace}`.
 *
 * Collapses `undefined`, `true`, empty strings, and empty objects to `undefined`; passes through non-empty traces
 * unchanged.
 *
 * @param trace The raw validation result to normalise
 *
 * @returns The non-empty trace, or `undefined` if the result represents success
 */
export function normalise(trace: undefined | true | Trace): undefined | Trace {
	return trace === undefined || trace === true ? undefined
		: isString(trace) ? (trace.length > 0 ? trace : undefined)
			: isObject(trace) && Object.keys(trace).length > 0 ? trace
				: undefined;
}

/**
 * Converts an optional {@link Trace} into a spreadable record.
 *
 * Returns the trace entries as-is when the trace is a keyed object; wraps bare string traces under a `"{}"` key;
 * returns an empty record for `undefined`.
 *
 * @param value The trace to convert
 *
 * @returns A record suitable for spreading into a {@link collect} entries argument
 */
export function wrap(value: undefined | Trace): Record<string, Trace> {
	return isString(value) ? { "{}": value } : value ?? {};
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Error carrying a structured validation {@link Trace}.
 *
 * Extends `RangeError` with a typed {@link Trace} as `cause` and includes a pretty-printed trace in the message
 * for visibility in stack traces and test output.
 */
export class TraceError extends RangeError {

	override readonly cause: Trace;

	constructor(message: string, cause: Trace) {

		super(`${message} <${JSON.stringify(cause, undefined, 2)}>`, { cause });

		this.cause = cause;
	}

}
