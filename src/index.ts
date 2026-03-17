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
 * Provides a type-safe DSL for defining resource shapes with validation constraints based on the
 * {@link https://www.w3.org/TR/shacl/ | Shapes Constraint Language} (SHACL). Shapes define both the expected
 * structure and validation rules for resources, enabling compile-time type inference and runtime validation.
 *
 * **Shape Types**
 *
 * {@link ValueShape} is a discriminated union of all concrete shape types:
 *
 * - {@link BooleanShape} - Booleans
 * - {@link NumberShape} - Numbers
 * - {@link StringShape} - Strings
 * - {@link LocalShape} - Single-valued language-tagged maps
 * - {@link LocalsShape} - Multi-valued language-tagged maps
 * - {@link ReferenceShape} - Resource IRI references
 * - {@link ResourceShape} - Resources
 *
 * **Defining Shapes**
 *
 * Define resource shapes with property constraints and value ranges:
 *
 * ```typescript
 * import { resource, id, required, optional, repeatable } from '@metreeca/blue';
 * import { string, integer, boolean, date } from '@metreeca/blue';
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
 * **Validating Values**
 *
 * Validate values against shapes using pattern matching on the {@link Relay} result:
 *
 * ```typescript
 * import { validate } from '@metreeca/blue';
 *
 * const name = validate(data, { scope: "value", shape: Product })({
 *   value: product => product.name
 * }); // undefined if validation fails
 * ```
 *
 * **Validating Entries**
 *
 * Validate only the `id` property of a value against a shape's identity constraints:
 *
 * ```typescript
 * validate(data, { scope: "entry", shape: Product });
 * ```
 *
 * **Validating Models**
 *
 * > [!WARNING]
 * > Model validation is safe against complexity attacks by default: aggregate transforms and nested model expansion
 * > are disabled. Enable `stats` and/or `depth` explicitly only when the additional complexity is required.
 *
 * Validate projection models specifying which properties to retrieve from a resource:
 *
 * ```typescript
 * // validate a projection model
 * validate(data, { scope: "model", shape: Product });
 *
 * // validate a projection model with aggregate transforms
 * validate(data, { scope: "model", shape: Product, stats: true });
 *
 * // validate a projection model with nesting depth
 * validate(data, { scope: "model", shape: Product, depth: 2 });
 * ```
 *
 * **Auditing Validated Data**
 *
 * {@link validate} associates validated data with a shape for a given scope. The scope tracks how
 * the association was established: `value`, `entry`, and `model` scopes are set by {@link validate} after successful
 * validation. Use {@link audit} to check whether a value or model was previously validated and retrieve the associated
 * shape.
 *
 * ```typescript
 * audit(validated, { scope: "value" }); // associated shape or undefined
 * audit(validated, { scope: "*" }); // matches both value and entry scopes
 * ```
 *
 * **Resource Metadata**
 *
 * Use {@link identify} and {@link classify} to get or set the `id` and `type` metadata of validated resources.
 * Both require the resource to have been previously {@link validate | validated}.
 *
 * ```typescript
 * identify(product); // resource identifier or undefined
 * identify(product, "https://example.com/products/99"); // copy with updated id
 *
 * classify(product); // resource type or undefined
 * classify(product, "https://example.com/types/Product"); // copy with updated type
 * classify(product, undefined); // copy with type removed
 * ```
 *
 * **Custom Validators**
 *
 * Implement custom resource-level constraints using {@link Validator} functions, returning keyed
 * {@link Trace} reports:
 *
 * ```typescript
 * import type { Validator } from '@metreeca/blue';
 *
 * interface Product { minPrice?: number; maxPrice?: number; startDate?: string; endDate?: string }
 *
 * const checkProduct: Validator<Product> = value => {
 *
 *   const priceIssue = value.minPrice !== undefined && value.maxPrice !== undefined
 *       && value.minPrice > value.maxPrice
 *       ? "minPrice must not exceed maxPrice" : undefined;
 *
 *   const dateIssue = value.startDate !== undefined && value.endDate !== undefined
 *       && value.startDate > value.endDate
 *       ? "startDate must not follow endDate" : undefined;
 *
 *   return priceIssue || dateIssue
 *       ? { minPrice: priceIssue, startDate: dateIssue } : undefined;
 *
 * };
 *
 * const Product = resource({ validators: [checkProduct] }, {
 *   minPrice: optional(integer()),
 *   maxPrice: optional(integer()),
 *   startDate: optional(date()),
 *   endDate: optional(date())
 * });
 * ```
 *
 * **Effective Shape Resolution**
 *
 * Use {@link apply} to resolve the effective shape after applying a probe to a value shape. Supports type-aware shape
 * inference in interactive UIs, resolving property paths through nested resources and deriving the effective type
 * through each transform pipe stage.
 *
 * @module index
 *
 * @see {@link https://www.w3.org/TR/shacl/ | SHACL - Shapes Constraint Language}
 */

import { type Lazy } from "@metreeca/core";
import { message } from "@metreeca/core/error";
import { createRelay, type Relay } from "@metreeca/core/relay";
import { isIRI } from "@metreeca/core/resource";
import type { Model } from "@metreeca/qest/model";
import type { Reference, Resource, Value } from "@metreeca/qest/state";
import type { BooleanShape } from "./boolean.js";
import { brand, branded } from "./core/brand.js";
import { materialize } from "./core/cache.js";
import { TraceError } from "./core/trace.js";
import { validateValue } from "./index.core.js";
import type { LocalShape, LocalsShape } from "./local.js";
import { type NumberShape } from "./number.js";
import { validateEntry, validateModel, validateResource } from "./resource.core.js";
import type { ReferenceShape, ResourceShape } from "./resource.js";
import { type StringShape } from "./string.js";
import { apply } from "./core/probe.js";

export { apply, TraceError };


/**
 * Symbol key for storing the validation scope on branded resources.
 */
const ValidationScope: unique symbol = Symbol("ValidationScope");

/**
 * Symbol key for storing the associated shape on branded resources.
 */
const ValidationShape: unique symbol = Symbol("ValidationShape");


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Discriminated union of all concrete shape types for validating individual node values.
 *
 * Each member carries its own `kind` discriminator and `model` type, enabling runtime type narrowing and
 * compile-time type inference without a shared base interface.
 *
 * @see {@link https://www.w3.org/TR/shacl/#node-shapes | SHACL § 2.3.1 Node Shapes}
 */
export type ValueShape =
	| BooleanShape
	| NumberShape
	| StringShape
	| LocalShape
	| LocalsShape
	| ReferenceShape
	| ResourceShape;


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


//// Shape Methods /////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks whether a value was validated with a given scope.
 *
 * @param value The value to inspect
 * @param opts Retrieval options
 * @param opts.scope The scope to check against; `"*"` matches both `"value"` and `"entry"`
 *
 * @returns The associated {@link ResourceShape}, or `undefined` if the value was not validated with the expected scope
 */
export function audit(value: Value, opts: {

	readonly scope: "*" | "value" | "entry"

}): undefined | ResourceShape;

/**
 * Checks whether a model was validated with a given scope.
 *
 * @param model The model to inspect
 * @param opts Retrieval options
 * @param opts.scope The scope to check against
 *
 * @returns The associated {@link ResourceShape}, or `undefined` if the model was not validated with the expected scope
 */
export function audit(model: Model, opts: {

	readonly scope: "model"

}): undefined | ResourceShape;

/**
 * Checks whether a value or model was validated with a given scope.
 */
export function audit(entry: Value | Model, {

	scope

}: {

	readonly scope: "*" | "value" | "entry" | "model"

}): undefined | ResourceShape {

	const actual = branded(entry, ValidationScope);

	if ( scope === "*" ? actual === "value" || actual === "entry" : actual === scope ) {

		return branded(entry, ValidationShape) as ResourceShape;

	} else {

		return undefined;

	}

}


/**
 * Validates a value against a shape with a value scope.
 *
 * Enforces all shape constraints including type, cardinality, closed-shape checks, and custom validators.
 * For {@link Resource} values, which are property maps describing the complete state of a linked data resource,
 * unknown and missing properties are both rejected; all declared properties are required unless marked optional
 * by the shape.
 *
 * > [!TIP]
 * > For {@link Resource} values, the function is idempotent on a specific scope/shape combination: on re-validation
 * > against the same scope and shape, the previous association is trusted without repeating the validation process,
 * > so that you can safely re-validate defensively.
 *
 * > [!TIP]
 * > Use {@link audit} to check whether a value was previously validated with the `value` scope and retrieve the
 * > associated shape.
 *
 * @typeParam T The {@link Value} type inferred from `opts.shape`
 *
 * @param value The value to validate
 * @param opts Validation options
 * @param opts.scope Selects value-level validation with full constraint enforcement
 * @param opts.shape The {@link Lazy} shape defining validation constraints
 *
 * @returns A {@link Relay} resolving to either `{ value }` on success or `{ trace }` on
 * failure; for
 * {@link Resource} values, on success, the value is an immutable copy associated with the `value` scope and a verified
 * and flattened copy of the shape (see {@link resource!resource | resource}), retrievable via {@link audit}
 *
 * @throws {TraceError} If the shape contains invalid or incompatible entry definitions (see
 *     {@link resource!resource | resource})
 */
export function validate<T extends Value>(value: unknown, opts: {

	readonly scope: "value"
	readonly shape: Lazy<ValueShape & { model: T }>

}): Relay<{

	readonly value: T,
	readonly trace: Trace

}>;

/**
 * Validates value identity against a shape with an entry scope.
 *
 * For {@link Resource} values, checks only the `id` property: if the shape declares an `id` property, the value must
 * contain an `id` field with a valid absolute IRI satisfying the shape's `pattern`, `in`, and `hasValue` constraints.
 * All other properties are ignored. If the shape declares no `id` property, the value passes validation unchanged.
 * All other value types are accepted as is.
 *
 * > [!TIP]
 * > For {@link Resource} values, the function is idempotent on a specific scope/shape combination: on re-validation
 * > against the same scope and shape, the previous association is trusted without repeating the validation process,
 * > so that you can safely re-validate defensively.
 *
 * > [!TIP]
 * > Use {@link audit} to check whether a value was previously validated with the `entry` scope and retrieve the
 * > associated shape.
 *
 * @typeParam T The {@link Value} type inferred from `opts.shape`
 *
 * @param value The value to validate
 * @param opts Validation options
 * @param opts.scope Selects identity-only validation checking just the `id` property
 * @param opts.shape The {@link Lazy} shape defining validation constraints
 *
 * @returns A {@link Relay} resolving to either `{ entry }` on success or `{ trace }` on
 * failure; for
 * {@link Resource} values, on success, the entry is an immutable copy associated with the `entry` scope and a verified
 * and flattened copy of the shape (see {@link resource!resource | resource}), retrievable via {@link audit}
 *
 * @throws {TraceError} If the shape contains invalid or incompatible entry definitions (see
 *     {@link resource!resource | resource})
 */
export function validate<T extends Value>(value: unknown, opts: {

	readonly scope: "entry"
	readonly shape: Lazy<ValueShape & { model: T }>

}): Relay<{

	readonly entry: T,
	readonly trace: Trace

}>;

/**
 * Validates a model against a shape with a model scope.
 *
 * A {@link Model} is a recursively nested property map specifying which properties to retrieve from a resource.
 * Shape constraints beyond type are skipped as model values are placeholders rather than actual
 * data; cardinality is checked only for shape consistency (scalar if `maxCount` is 1, singleton tuple otherwise);
 * missing properties are accepted as not requested and unknown properties in expression paths are silently ignored.
 *
 * > [!TIP]
 * > The function is idempotent on a specific scope/shape combination: on re-validation against the same scope and
 * > shape, the previous association is trusted without repeating the validation process, so that you can safely
 * > re-validate defensively.
 *
 * > [!TIP]
 * > Use {@link audit} to check whether a model was previously validated with the `model` scope and retrieve the
 * > associated shape.
 *
 * > [!TIP]
 * > Wherever a property specifies a {@link ReferenceShape}, the model may be either an IRI {@link Reference}
 * > (retrieving just the id) or a nested {@link Model} (retrieving a projection of the referenced resource, validated
 * > against its target shape). Nesting is subject to `depth` limits; set `depth` to the minimum required level to
 * > guard against possible complexity attacks from deeply nested models.
 *
 * > [!WARNING]
 * > Default options are safe against complexity attacks from client-defined models: aggregate transforms are rejected
 * > (`stats` defaults to `false`) and nested model expansion is disabled (`depth` defaults to `0`). Explicitly set
 * > `stats` to `true` and/or `depth` to a positive value or `null` only when the additional complexity is required
 * > and acceptable.
 *
 * @typeParam T The {@link Model} type
 *
 * @param model The model to validate
 * @param opts Validation options
 * @param opts.scope Selects model-level validation with structural checks
 * @param opts.shape The {@link Lazy} shape defining the expected structure
 * @param opts.stats Whether aggregate transforms (count, sum, min, max, avg) are accepted; `true` allows them;
 *     `false` rejects any binding containing aggregate transforms; defaults to `false`
 * @param opts.depth Maximum nesting depth for {@link Reference} and embedded {@link Resource} expansion; `0` rejects
 *     any nested {@link Model} while still accepting IRI references; `null` for unlimited; defaults to `0`
 *
 * @returns A {@link Relay} resolving to either `{ model }` on success or `{ trace }` on
 * failure; on success, the model is an immutable copy associated with the `model` scope and a verified and
 * flattened copy of the
 * shape (see {@link resource!resource | resource}), retrievable via {@link audit}
 *
 * @throws TypeError If the shape contains invalid entry definitions (see {@link resource!resource | resource})
 * @throws RangeError If the shape contains incompatible inherited constraints
 * (see {@link resource!resource | resource})
 */
export function validate<T extends Model>(model: unknown, opts: {

	readonly scope: "model"
	readonly shape: Lazy<ValueShape>

	readonly stats?: boolean
	readonly depth?: null | number

}): Relay<{

	readonly model: T,
	readonly trace: Trace

}>;

/**
 * Validates a value or model against a shape within the specified scope.
 */
export function validate(value: unknown, {

	scope,
	shape,

	stats = false,
	depth = 0

}: {

	readonly scope: "value" | "model" | "entry"
	readonly shape: Lazy<ValueShape>

	readonly stats?: boolean
	readonly depth?: null | number

}): Relay<{

	readonly value: Value
	readonly entry: Value
	readonly model: Value | Model
	readonly trace: Trace

}> {

	try {

		const materialized = materialize(shape);

		if ( materialized.kind === "resource" ) {

			if ( branded(value, ValidationScope) === scope && branded(value, ValidationShape) === materialized ) {

				return scope === "value" ? createRelay({ value })
					: scope === "entry" ? createRelay({ entry: value })
						: createRelay({ model: value });

			} else if ( scope === "value" ) {

				const trace = validateResource([value], materialized);

				return trace === undefined
					? createRelay({
						value: brand(value, {
							[ValidationScope]: "value",
							[ValidationShape]: materialized
						})
					})
					: createRelay({ trace });

			} else if ( scope === "entry" ) {

				const trace = validateEntry([value], materialized);

				return trace === undefined
					? createRelay({
						entry: brand(value, {
							[ValidationScope]: "entry",
							[ValidationShape]: materialized
						})
					})
					: createRelay({ trace });

			} else {

				const trace = validateModel([value], materialized, { depth, stats });

				return trace === undefined
					? createRelay({
						model: brand(value, {
							[ValidationScope]: "model",
							[ValidationShape]: materialized
						})
					})
					: createRelay({ trace });

			}

		} else {

			if ( scope === "entry" ) { // non-resource values accepted as-is

				return createRelay({ entry: value });

			} else if ( scope === "model" ) {

				const trace = validateValue([value], materialized);

				return trace === undefined
					? createRelay({ model: value })
					: createRelay({ trace });

			} else {

				const trace = validateValue([value], materialized);

				return trace === undefined
					? createRelay({ value: value as Value })
					: createRelay({ trace });

			}

		}

	} catch ( e ) {

		return createRelay({ trace: e instanceof TraceError ? e.cause : message(e) });

	}

}


//// Resource Metadata /////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Retrieves the identifier of a validated resource.
 *
 * @typeParam T The resource type
 *
 * @param resource The resource to inspect; must be already {@link validate | validated} with either `"value"` or
 *     `"entry"` scope
 *
 * @returns The resource identifier or `undefined` if the associated {@link ResourceShape} declares no
 *     {@link resource.Id | id} property
 *
 * @throws Error If `resource` was not previously validated with either `"value"` or `"entry"` scope
 */
export function identify<T extends Resource>(resource: T): undefined | Reference ;

/**
 * Configures the identifier of a validated resource.
 *
 * @typeParam T The resource type
 *
 * @param resource The resource to configure; must be already {@link validate | validated} with either `"value"` or
 *     `"entry"` scope
 * @param id The new identifier to assign
 *
 * @returns An immutable copy of `resource` with the identifier set to `id`, preserving validation tagging
 *
 * @throws Error If `resource` was not previously validated with either `"value"` or `"entry"` scope
 * @throws Error If the associated {@link ResourceShape} declares no {@link resource.Id | id} property
 * @throws Error If `id` is not an absolute IRI
 */
export function identify<T extends Resource>(resource: T, id: Reference): T ;

/**
 * Retrieves or configures the identifier of a validated resource.
 */
export function identify<T extends Resource>(resource: T, id?: Reference): undefined | Reference | T {

	const shape = audit(resource, { scope: "*" });

	if ( shape === undefined ) {
		throw new TypeError("unvalidated resource for <value> or <entry> scope");
	}

	// find the id property key in the shape

	const entry = Object.entries(shape.properties).find(([, p]) => p.kind === "id");

	if ( id === undefined ) { // getter

		return entry === undefined ? undefined : resource[entry[0]] as Reference;

	} else { // setter

		if ( entry === undefined ) {
			throw new RangeError("missing id property in shape");
		}

		if ( !isIRI(id, "absolute") ) {
			throw new TypeError("expected absolute IRI");
		}

		return brand({ ...resource, [entry[0]]: id }, {
			[ValidationScope]: branded(resource, ValidationScope),
			[ValidationShape]: branded(resource, ValidationShape)
		});

	}

}


/**
 * Retrieves the type of a validated resource.
 *
 * @typeParam T The resource type
 *
 * @param resource The resource to inspect; must be already {@link validate | validated} with `"value"` scope
 *
 * @returns The resource type or `undefined` if the associated {@link ResourceShape} declares no
 *     {@link resource.Type | type} property
 *
 * @throws Error If `resource` was not previously validated with `"value"` scope
 */
export function classify<T extends Resource>(resource: T): undefined | Reference ;

/**
 * Configures the type of a validated resource.
 *
 * @typeParam T The resource type
 *
 * @param resource The resource to configure; must be already {@link validate | validated} with `"value"` scope
 * @param type The new type to assign, or `undefined` to remove it
 *
 * @returns An immutable copy of `resource` with the type set to `type` or removed, preserving validation tagging
 *
 * @throws Error If `resource` was not previously validated with `"value"` scope
 * @throws Error If the associated {@link ResourceShape} declares no {@link resource.Type | type} property
 * @throws Error If `type` is defined and not an absolute IRI
 */
export function classify<T extends Resource>(resource: T, type: undefined | Reference): T ;

/**
 * Retrieves or configures the type of a validated resource.
 */
export function classify<T extends Resource>(resource: T, type?: Reference): undefined | Reference | T {

	const shape = audit(resource, { scope: "value" });

	if ( shape === undefined ) {
		throw new TypeError("unvalidated resource for <value> scope");
	}

	// find the type property key in the shape

	const entry = Object.entries(shape.properties).find(([, p]) => p.kind === "type");

	if ( arguments.length === 1 ) { // getter

		return entry === undefined ? undefined : resource[entry[0]] as Reference;

	} else { // setter

		if ( entry === undefined ) {
			throw new RangeError("missing type property in shape");
		}

		if ( type !== undefined && !isIRI(type, "absolute") ) {
			throw new TypeError("expected absolute IRI");
		}

		const updated = type !== undefined
			? { ...resource, [entry[0]]: type }
			: Object.fromEntries(Object.entries(resource).filter(([k]) => k !== entry[0]));

		return brand(updated as T, {
			[ValidationScope]: branded(resource, ValidationScope),
			[ValidationShape]: branded(resource, ValidationShape)
		});

	}

}
