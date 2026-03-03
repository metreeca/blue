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
 * - {@link boolean!BooleanShape | BooleanShape} - Booleans
 * - {@link number!NumberShape | NumberShape} - Numbers
 * - {@link string!StringShape | StringShape} - Strings
 * - {@link local!LocalShape | LocalShape} - Single-valued language-tagged maps
 * - {@link local!LocalsShape | LocalsShape} - Multi-valued language-tagged maps
 * - {@link resource!ReferenceShape | ReferenceShape} - Resource IRI references
 * - {@link resource!ResourceShape | ResourceShape} - Nested resources
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
 * **Validating Resources**
 *
 * Validate values against shapes using pattern matching on the {@link Relay} result:
 *
 * ```typescript
 * import { validate } from '@metreeca/blue';
 *
 * const name = validate(data, Product)({
 *   value: product => product.name
 * }); // undefined if validation fails
 * ```
 *
 * **Validation Modes**
 *
 * Beyond complete resource states, {@link validate} supports projections:
 *
 * ```typescript
 * // validate a complete resource state (default)
 * validate(data, Product);
 *
 * // validate a projection model
 * validate(data, Product, { mode: "model" });
 *
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
 * **Probe Resolution**
 *
 * Use {@link apply} to resolve the effective output shape after applying a probe to a value shape.
 * Supports type-aware shape inference in interactive UIs, resolving property paths through nested resources
 * and deriving the output type through each transform pipe stage.
 *
 * @module index
 *
 * @see {@link https://www.w3.org/TR/shacl/ | SHACL - Shapes Constraint Language}
 */

import { isNumber, isObject, type Lazy } from "@metreeca/core";
import { assert, error, message } from "@metreeca/core/error";
import { immutable } from "@metreeca/core/nested";
import { createRelay, type Relay } from "@metreeca/core/relay";
import { isModel, type Model } from "@metreeca/qest/model";
import { isResource, type Resource, type Value } from "@metreeca/qest/state";
import type { BooleanShape } from "./boolean.js";
import { apply, isValueShape, materialize, validateValue } from "./index.core.js";
import type { LocalShape, LocalsShape } from "./local.js";
import type { NumberShape } from "./number.js";
import { validateModel, validateResource } from "./resource.core.js";
import type { ReferenceShape, ResourceShape } from "./resource.js";
import type { StringShape } from "./string.js";
import { isTrace, isValidator } from "./trace.core.js";
import type { Trace, Validator } from "./trace.js";

export { apply, isTrace, isValidator, isValueShape, Trace, Validator };


/**
 * Mode-specific brand symbols for validated resources.
 *
 * Set by {@link brand} and checked by {@link branded} to skip redundant validation against the same shape.
 *
 * - `State` — brands resources validated in state mode
 * - `Model` — brands resources validated in model mode
 */
const Validated = immutable({

	State: Symbol("StateValidated"),
	Model: Symbol("ModelValidated")

});


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


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Infers the model type from a {@link Lazy} shape.
 *
 * Recursively resolves factory functions and extracts the `model` type from the underlying shape.
 *
 * @typeParam S The lazy shape type
 */
export type Infer<S extends Lazy<{ readonly model: unknown }>> =
	S extends () => infer R
		? R extends { readonly model: infer T } ? T
			: R extends Lazy<{ readonly model: unknown }> ? Infer<R> : never
		: S extends { readonly model: infer T } ? T
			: never;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates a {@link @metreeca/qest!Value | Value} against a shape.
 *
 * - **{@link ResourceShape}**: validates a {@link @metreeca/qest!Resource | Resource} state using {@link isResource},
 *   then enforces all shape constraints including cardinality, closed-shape checks, and custom validators — unknown
 *   and missing properties are both rejected
 * - **Other shapes**: validates the {@link @metreeca/qest!Value | Value} directly using the type-specific validator
 *
 * @typeParam T The {@link @metreeca/qest!Value | Value} type inferred from `shape`
 *
 * @param value The value to validate
 * @param shape The {@link ValueShape} defining validation constraints; may be a {@link Lazy} factory
 * @param opts Validation options
 * @param opts.mode Must be `"state"`
 *
 * @returns A {@link Relay} resolving to either `{ value }` on success or `{ trace }` on failure
 *
 * @remarks
 *
 * Idempotent for {@link @metreeca/qest!Resource | Resource} values: calling multiple times on the same branded
 * object with the same mode returns the same reference.
 */
export function validate<T extends Value>(value: unknown, shape: Lazy<ValueShape & { readonly model: T }>, opts?: {

	readonly mode: "state"

}): Relay<{

	readonly value: T,
	readonly trace: Trace

}>;

/**
 * Validates a {@link @metreeca/qest!Value | Value} as a projection model against a shape.
 *
 * - **{@link ResourceShape}**: validates a {@link @metreeca/qest!Model | Model} projection using {@link isModel};
 *   {@link @metreeca/qest!Value | Value} constraints and custom validators are skipped as a
 *   {@link @metreeca/qest!Model | Model} describes a projection shape rather than actual data; cardinality is
 *   checked only for shape consistency (scalar if `maxCount` is 1, singleton tuple otherwise); unknown properties
 *   are rejected, but missing properties are accepted as not requested
 * - **Other shapes**: validates the {@link @metreeca/qest!Value | Value} directly using the type-specific validator
 *   (shared with state validation)
 *
 * > [!NOTE]
 * > For {@link ResourceShape resource shapes}, wherever a property specifies a resource (either directly or via a
 * > {@link @metreeca/qest!Reference | Reference}), the value may be either a
 * > {@link @metreeca/qest!Reference | Reference} (retrieving just the id) or a nested
 * > {@link @metreeca/qest!Model | Model}, subject to `depth` limits.
 *
 * @typeParam T The {@link @metreeca/qest!Value | Value} type inferred from `shape`
 *
 * @param value The value to validate
 * @param shape The {@link ValueShape} defining validation constraints; may be a {@link Lazy} factory
 * @param opts Validation options
 * @param opts.mode Must be `"model"`
 * @param opts.depth Maximum nesting depth for {@link @metreeca/qest!Reference | Reference} and embedded
 *     {@link @metreeca/qest!Resource | Resource} expansion; `0` rejects any nested
 *     {@link @metreeca/qest!Model | Model} while still accepting IRI references; `null` for unlimited; defaults
 *     to `0`
 *
 * @returns A {@link Relay} resolving to either `{ value }` on success or `{ trace }` on failure
 *
 * @remarks
 *
 * Idempotent for {@link @metreeca/qest!Resource | Resource} values: calling multiple times on the same branded
 * object with the same mode returns the same reference.
 */
export function validate<T extends Value>(value: unknown, shape: Lazy<ValueShape & { readonly model: T }>, opts: {

	readonly mode: "model"
	readonly depth?: null | number

}): Relay<{

	readonly value: T,
	readonly trace: Trace

}>;

/**
 * Validates a value state or projection model against a shape.
 */
export function validate(value: unknown, lazy: Lazy<ValueShape>, opts: {

	readonly mode: "state" | "model"
	readonly depth?: null | number

} = {

	mode: "state"

}): Relay<{

	readonly value: Value,
	readonly trace: Trace

}> {

	const {

		mode,
		depth = 0

	} = assert(opts, (v: unknown): v is typeof opts => isObject(v, {

		mode: v => v === "state" || v === "model",
		depth: v => v === undefined || v === null || isNumber(v) && Number.isInteger(v) && v >= 0

	}));


	try {

		const shape = assert(materialize(lazy), isValueShape);

		if ( shape.kind === "resource" ) { // resource shapes: dispatch by mode with branding

			return mode === "state" ? state(shape)
				: mode === "model" ? model(shape)
					: error(`unsupported mode <${mode}>`);

		} else { // non-resource shapes: validate value directly, ignoring mode (no model/state distinction)

			const trace = validateValue([value as Value], shape);

			return trace === undefined
				? createRelay({ value: immutable(value as Value) })
				: createRelay({ trace: immutable(trace, isTrace) });

		}

	} catch ( e ) {

		return createRelay({ trace: immutable(message(e), isTrace) });

	}


	function state(shape: ResourceShape) {

		if ( branded(value, Validated.State, shape) ) {

			return createRelay({ value: value as Value });

		} else {

			const $value = immutable(value, isResource);
			const trace = validateResource([$value], shape);

			return trace === undefined
				? createRelay({ value: brand($value, Validated.State, shape) })
				: createRelay({ trace: immutable(trace, isTrace) });

		}
	}

	function model(shape: ResourceShape) {

		if ( branded(value, Validated.Model, shape) ) {

			return createRelay({ value: value as Model });

		} else {

			const $value = immutable(value, isModel);
			const trace = validateModel([$value], shape, depth);

			return trace === undefined
				? createRelay({ value: brand($value, Validated.Model, shape) })
				: createRelay({ trace: immutable(trace, isTrace) });

		}
	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks whether a value was already validated against a given shape in a given mode.
 *
 * @param value The value to check
 * @param symbol The mode-specific brand symbol from {@link Validated}
 * @param shape The validation shape to match
 *
 * @returns true if `value` is an object branded with the matching symbol and shape; false otherwise
 */
function branded(value: unknown, symbol: symbol, shape: ResourceShape): boolean {
	return isObject(value) && value[symbol] === shape;
}

/**
 * Brands a validated resource with the given mode symbol and shape.
 *
 * @param value The validated resource to brand
 * @param symbol The mode-specific brand symbol from {@link Validated}
 * @param shape The validation shape to associate
 *
 * @returns The branded and immutable value
 */
function brand<V extends Resource | Model>(value: V, symbol: symbol, shape: ResourceShape): V {

	const target = Object.isExtensible(value) ? value
		: Object.fromEntries(Object.keys(value).map(key => [key, value[key]]));

	return immutable(Object.defineProperty(target, symbol, {
		value: shape,
		enumerable: false,
		configurable: true
	})) as V;

}
