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
 * Validation trace types.
 *
 * Defines the {@link Trace} and {@link Validator} types for the keyed trace validation model.
 *
 * @module
 */


/**
 * Validation trace.
 *
 * Represents the result of validating a resource against a shape as a recursive union of violation messages and keyed
 * reports. An `undefined` trace signals successful validation; a non-empty trace is always a failure.
 *
 * Key semantics shift by nesting depth:
 *
 * - **Collection level**: resource identifier values
 * - **Resource level**: property keys (`name`, `type`, …)
 * - **Property level**: SHACL-derived constraint names (`minLength`, `pattern`, `in`, …)
 * - **Leaf level**: human-readable error message
 *
 * @see {@link https://www.w3.org/TR/shacl/#validation-report | SHACL § 3.6 Validation Report}
 */
export type Trace =
	| string
	| { readonly [key: string]: Trace }

/**
 * Value validator.
 *
 * A function that examines a value and returns a {@link Trace} describing any constraint violations:
 *
 * - `undefined` or `true` signals successful validation with no issues
 * - A trace describes constraint failures as a keyed report or violation message
 *
 * @typeParam T The value type being validated
 */
export type Validator<T = unknown> =
	(value: T) => undefined | true | Trace;


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
