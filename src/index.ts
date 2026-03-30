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
 * Linked data validation API.
 *
 * Provides validation for linked data {@link Resource | resources} and retrieval {@link Template | templates} against
 * {@link https://www.w3.org/TR/shacl/ | SHACL}-derived {@link ResourceShape | shapes}.
 *
 * **Defining Shapes**
 *
 * Define resource shapes with property constraints and cardinality ranges from the {@link value} module:
 *
 * ```typescript
 * import { required, optional, repeatable } from '@metreeca/blue/value';
 * import { boolean } from '@metreeca/blue/boolean';
 * import { integer } from '@metreeca/blue/number';
 * import { string, date } from '@metreeca/blue/string';
 * import { resource, id } from '@metreeca/blue/resource';
 *
 * const Product = resource({
 *   id: id(),
 *   name: required(string({ minLength: 1, maxLength: 100 })),
 *   price: required(integer({ minInclusive: 0 })),
 *   available: optional(boolean()),
 *   tags: repeatable(string()),
 *   releaseDate: optional(date())
 * });
 * ```
 *
 * **Validating Resources**
 *
 * Validate resources using {@link validate}, pattern matching on the {@link Relay} result:
 *
 * ```typescript
 * import { validate } from '@metreeca/blue';
 *
 * validate(data, { shape: Product })({
 *   value: product => console.log(product.name),
 *   trace: trace => console.error(trace)
 * });
 * ```
 *
 * **Validating Templates**
 *
 * Validate retrieval {@link Template | templates} using {@link validate} with `fetch: true`:
 *
 * ```typescript
 * validate(data, { fetch: true, shape: Product });
 * validate(data, { fetch: true, shape: Product, plain: true });
 * validate(data, { fetch: true, shape: Product, depth: 0 });
 * ```
 *
 * > [!CAUTION]
 * > By default, templates support the full query language, including aggregate transforms and nested expansion.
 * > When exposing endpoints to untrusted clients, restrict query complexity as required by setting `plain`
 * > to `true` and/or `depth` to `0` or a positive value.
 *
 * @module index
 *
 * @see {@link https://www.w3.org/TR/shacl/ | SHACL - Shapes Constraint Language}
 */

import { type Lazy } from "@metreeca/core";
import { seal } from "@metreeca/core/deep";
import { createRelay, type Relay } from "@metreeca/core/relay";
import { type Reference } from "@metreeca/qest";
import type { Resource } from "@metreeca/qest/resource";
import type { Template } from "@metreeca/qest/template";
import { TraceError } from "./index.core.js";
import type { ReferenceShape } from "./reference.js";
import { validateResource, validateTemplate } from "./resource.core.js";
import type { ResourceShape } from "./resource.js";
import { materialize } from "./value.core.js";

export { TraceError };


/**
 * Seal tag for idempotent validation.
 *
 * Marks a value as already validated by {@link validate}, enabling the function to skip re-validation
 * when the same shape and options are presented again.
 */
const Validated: unique symbol = Symbol("Validated");


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
 * Validates a resource against a shape.
 *
 * Enforces all shape constraints including type, cardinality, closed-shape checks, and custom validators.
 * Unknown and missing properties are both rejected; all declared properties are required unless marked optional
 * by the shape.
 *
 * > [!TIP]
 * > The function is idempotent on a specific shape: on re-validation against the same shape, the previous
 * > association is trusted without repeating the validation process, so that you can safely re-validate defensively.
 *
 * @typeParam T The {@link Resource} type inferred from `shape`
 *
 * @param value The value to validate as a resource
 * @param opts Validation options
 * @param opts.shape The {@link Lazy} {@link ResourceShape} defining validation constraints
 * @param opts.entry Expected {@link Reference} for the resource's {@link resource!Id | id} entry; if provided and the
 *     resource contains an `id` property, the `id` value must match this reference exactly; ignored if the resource
 *     has no `id` entry
 *
 * @returns A {@link Relay} resolving to either `{ value }` on success or `{ trace }` on failure; on success, the
 *     value is an immutable copy validated against a verified and flattened copy of the shape
 *     (see {@link resource!resource | resource}); on failure, the trace describes
 *     constraint violations
 *
 * @throws {TraceError} If the shape is malformed (see {@link resource!resource | resource})
 */
export function validate<T extends Resource>(value: unknown, opts: {

	readonly fetch?: false

	readonly shape: Lazy<ResourceShape & { model: T }>

	readonly entry?: Reference

}): Relay<{

	readonly value: T,
	readonly trace: Trace

}>;

/**
 * Validates a template against a shape.
 *
 * Enforces type and structural constraints; value constraints are skipped as query values are placeholders.
 * Cardinality is checked for shape consistency (scalar if `maxCount` is 1, singleton tuple otherwise);
 * missing properties are accepted as not requested and unknown properties in expression paths are silently ignored.
 *
 * > [!CAUTION]
 * > By default, templates support the full query language, including aggregate transforms and nested expansion.
 * > When exposing endpoints to untrusted clients, restrict query complexity as required by setting `plain`
 * > to `true` and/or `depth` to `0` or a positive value.
 *
 * > [!TIP]
 * > Wherever a property specifies a {@link ReferenceShape}, the query may be either an IRI {@link Reference}
 * > (retrieving just the id) or a nested {@link Template} (retrieving a projection of the referenced resource,
 * > validated against its target shape).
 *
 * > [!TIP]
 * > The function is idempotent on a specific shape: on re-validation against the same shape, the previous
 * > association is trusted without repeating the validation process, so that you can safely re-validate defensively.
 *
 * @typeParam T The {@link Template} type inferred from `shape`
 *
 * @param value The value to validate as a template
 * @param opts Validation options
 * @param opts.fetch Must be `true` to select template validation mode
 * @param opts.shape The {@link Lazy} {@link ResourceShape} defining the expected structure
 * @param opts.plain Whether to reject aggregate transforms (count, sum, min, max, avg); `true` rejects
 *     any binding containing aggregate transforms; defaults to `false`
 * @param opts.depth Maximum nesting depth for {@link Reference} and embedded {@link Resource} expansion;
 *     `0` rejects any nested {@link Template} while still accepting IRI references; defaults to unlimited
 *
 * @returns A {@link Relay} resolving to either `{ value }` on success or `{ trace }` on failure; on success, the
 *     value is an immutable copy validated against a verified and flattened copy of the shape
 *     (see {@link resource!resource | resource}); on failure, the trace describes constraint violations
 *
 * @throws {TraceError} If the shape is malformed (see {@link resource!resource | resource})
 */
export function validate<T extends Template>(value: unknown, opts: {

	readonly fetch: true
	readonly shape: Lazy<ResourceShape>

	readonly plain?: boolean
	readonly depth?: number

}): Relay<{

	readonly value: T,
	readonly trace: Trace

}>;

/**
 * Validates resources and templates against shapes.
 */
export function validate(value: unknown, {

	fetch,
	shape,

	entry,

	plain,
	depth

}: {

	readonly fetch?: boolean
	readonly shape: Lazy<ResourceShape>

	readonly entry?: Reference

	readonly plain?: boolean
	readonly depth?: number

}): Relay<{

	readonly value: unknown,
	readonly trace: Trace

}> {

	const materialized = materialize(shape);

	if ( fetch ) {

		const sealed = seal<{

			readonly fetch: boolean
			readonly shape: ResourceShape

			readonly plain?: boolean
			readonly depth?: number

		}>(value, Validated);

		if ( sealed !== undefined && sealed.fetch
			&& materialized === sealed.shape
			&& (!plain || sealed.plain)
			&& (depth === undefined || (!(sealed.depth === undefined || sealed.depth > depth)))
		) {

			return createRelay({ value });

		} else {

			const trace = validateTemplate([value], materialized, { depth, plain });

			return trace === undefined
				? createRelay({
					value: seal(value, Validated, { fetch: true, shape: materialized, plain, depth })
				})
				: createRelay({ trace });

		}

	} else {

		const sealed = seal<{

			readonly fetch: boolean
			readonly shape: ResourceShape

			readonly entry?: Reference

		}>(value, Validated);

		if ( sealed !== undefined && !sealed.fetch
			&& materialized === sealed.shape
			&& (entry === undefined || sealed.entry === entry)
		) {

			return createRelay({ value });

		} else {

			const trace = validateResource([value], materialized, { entry });

			return trace === undefined
				? createRelay({ value: seal(value, Validated, { fetch: false, shape: materialized, entry }) })
				: createRelay({ trace });

		}

	}

}
