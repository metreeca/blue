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
 * - {@link resource!ResourceShape | ResourceShape} - Resources
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
 * **Validating Models**
 *
 * Validate projection models specifying which properties to retrieve from a resource:
 *
 * ```typescript
 * // validate a projection model
 * validate(data, { scope: "model", shape: Product });
 *
 * // validate a projection model with nesting depth
 * validate(data, { scope: "model", shape: Product, depth: 2 });
 * ```
 *
 * **Tagging Entries**
 *
 * Both {@link validate} and {@link tag} associate entries with a shape for a given scope. The scope tracks how
 * the association was established: `value` and `model` scopes are set by {@link validate} after successful validation,
 * while the `entry` scope is set by {@link tag} when conformance is immaterial.
 * Use {@link tag} as a getter to retrieve the shape associated with an entry for a given scope.
 *
 * ```typescript
 * const tagged = tag(data, { scope: "entry", shape: Product });
 * const shape = tag(tagged, { scope: "entry" }); // Product shape
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

import { type Lazy } from "@metreeca/core";
import { message } from "@metreeca/core/error";
import { createRelay, type Relay } from "@metreeca/core/relay";
import type { Model } from "@metreeca/qest/model";
import type { Reference, Resource, Value } from "@metreeca/qest/state";
import type { BooleanShape } from "./boolean.js";
import { apply, brand, branded, materialize, validateValue } from "./index.core.js";
import type { LocalShape, LocalsShape } from "./local.js";
import type { NumberShape } from "./number.js";
import { flatten, validateModel, validateResource } from "./resource.core.js";
import type { ReferenceShape, ResourceShape } from "./resource.js";
import type { StringShape } from "./string.js";
import type { Trace, Validator } from "./trace.js";

export { apply, Trace, Validator };


/**
 * Symbol key for storing the validation scope on branded entries.
 */
const TagScope: unique symbol = Symbol("TagScope");

/**
 * Symbol key for storing the associated shape on branded entries.
 */
const TagShape: unique symbol = Symbol("TagShape");


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
 * Retrieves the shape associated with a value.
 *
 * @param value The value to inspect
 * @param opts Retrieval options
 * @param opts.scope The scope to check against; if omitted, returns the associated shape regardless of scope
 *
 * @returns The associated {@link ResourceShape}, or `undefined` if no shape is associated with the expected scope
 */
export function tag(value: Value, opts?: {

	readonly scope?: "value" | "entry"

}): undefined | ResourceShape;

/**
 * Retrieves the shape associated with a model.
 *
 * @param model The model to inspect
 * @param opts Retrieval options
 * @param opts.scope The scope to check against; if omitted, returns the associated shape regardless of scope
 *
 * @returns The associated {@link ResourceShape}, or `undefined` if no shape is associated with the expected scope
 */
export function tag(model: Model, opts?: {

	readonly scope?: "model" | "entry"

}): undefined | ResourceShape;

/**
 * Forces the association of an entry with a shape for a given scope.
 *
 * Returns a new entry associated with the given scope and shape, replacing any previous association.
 *
 * > [!WARNING]
 * > Tagging an entry does not verify actual conformance to the tagging shape.
 * >
 * > Set the scope to `value` or `model` when conformance is already guaranteed, for instance for data from trusted
 * > sources or safely constructed entries.
 * >
 * > Set the scope to `entry` when conformance is immaterial, for instance when associating a shape with the identity
 * > of an entry rather than its description, as in deletion operations.
 * >
 * > When conformance matters and is not guaranteed, use {@link validate} instead to both validate and associate the
 * > appropriate scope and shape.
 *
 * @typeParam T The entry type
 *
 * @param entry The entry to associate
 * @param opts Association options
 * @param opts.scope The scope to associate
 * @param opts.shape The {@link ValueShape} to associate
 *
 * @returns An immutable copy of the entry associated with the given scope and a verified and flattened copy of the
 * shape (see {@link resource!resource | resource})
 *
 * @throws TypeError If the shape contains invalid entry definitions (see {@link resource!resource | resource})
 * @throws RangeError If the shape contains incompatible inherited constraints
 * (see {@link resource!resource | resource})
 */
export function tag<T extends Value | Model>(entry: T, opts: {

	readonly scope: "value" | "model" | "entry"
	readonly shape: ValueShape

}): T;

export function tag(entry: Value | Model, {

	scope,
	shape

}: {

	readonly scope?: "value" | "model" | "entry"
	readonly shape?: ValueShape

} = {}): undefined | ResourceShape | Value | Model {

	if ( shape === undefined ) { // getter: return shape only if scope matches

		return branded(entry, { [TagScope]: scope, [TagShape]: undefined })
			? entry[TagShape] as ResourceShape
			: undefined;

	} else { // setter: associate scope and shape

		return shape.kind === "resource"
			? brand(entry, { [TagScope]: scope, [TagShape]: flatten(shape) })
			: entry;

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
 * > For values already trusted or pre-validated elsewhere, use {@link tag} to force the shape association without
 * > repeating the validation process.
 *
 * @typeParam T The {@link Value} type inferred from `opts.shape`
 *
 * @param value The value to validate
 * @param opts Validation options
 * @param opts.scope The validation scope; must be `"value"`
 * @param opts.shape The {@link ValueShape} defining validation constraints; may be a {@link Lazy} factory
 *
 * @returns A {@link Relay} resolving to either `{ value }` on success or `{ trace }` on failure; for
 * {@link Resource} values, on success, the value is an immutable copy associated with the `value` scope and a verified
 * and flattened copy of the shape (see {@link resource!resource | resource}), retrievable via {@link tag}
 *
 * @throws TypeError If the shape contains invalid entry definitions (see {@link resource!resource | resource})
 * @throws RangeError If the shape contains incompatible inherited constraints (see {@link resource!resource |
 *     resource})
 */
export function validate<T extends Value>(value: unknown, opts: {

	readonly scope: "value"
	readonly shape: Lazy<ValueShape & { model: T }>

}): Relay<{

	readonly value: T,
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
 * > For models already trusted or pre-validated elsewhere, use {@link tag} to force the shape association without
 * > repeating the validation process.
 *
 * > [!TIP]
 * > Wherever a property specifies a {@link ReferenceShape}, the model may be either an IRI {@link Reference}
 * > (retrieving just the id) or a nested {@link Model} (retrieving a projection of the referenced resource, validated
 * > against its target shape). Nesting is subject to `depth` limits; set `depth` to the minimum required level to
 * > guard against possible complexity attacks from deeply nested models.
 *
 * @typeParam T The {@link Model} type
 *
 * @param model The model to validate
 * @param opts Validation options
 * @param opts.scope The validation scope; must be `"model"`
 * @param opts.shape The {@link ValueShape} defining validation constraints; may be a {@link Lazy} factory
 * @param opts.depth Maximum nesting depth for {@link Reference} and embedded {@link Resource} expansion; `0` rejects
 *     any nested {@link Model} while still accepting IRI references; `null` for unlimited; defaults to `0`
 *
 * @returns A {@link Relay} resolving to either `{ value }` on success or `{ trace }` on failure; on success, the
 * value is an immutable copy of the model associated with the `model` scope and a verified and flattened copy of the
 * shape (see {@link resource!resource | resource}), retrievable via {@link tag}
 *
 * @throws TypeError If the shape contains invalid entry definitions (see {@link resource!resource | resource})
 * @throws RangeError If the shape contains incompatible inherited constraints
 * (see {@link resource!resource | resource})
 */
export function validate<T extends Model>(model: unknown, opts: {

	readonly scope: "model"
	readonly shape: Lazy<ValueShape>

	readonly depth?: null | number

}): Relay<{

	readonly value: T,
	readonly trace: Trace

}>;

/**
 * Validates a value or model against a shape within the specified scope.
 */
export function validate(value: unknown, {

	scope,
	shape: lazy,
	depth = 0

}: {

	readonly scope: "value" | "model"
	readonly shape: Lazy<ValueShape>

	readonly depth?: null | number

}): Relay<{

	readonly value: Value | Model,
	readonly trace: Trace

}> {

	try {

		const shape = materialize(lazy);

		if ( shape.kind === "resource" ) {

			if ( branded(value, { [TagScope]: scope, [TagShape]: shape }) ) { // already validated

				return createRelay({ value });

			} else if ( scope === "value" ) {

				const trace = validateResource([value], shape);

				return trace === undefined
					? createRelay({ value: brand(value, { [TagScope]: "value", [TagShape]: shape }) })
					: createRelay({ trace });

			} else {

				const trace = validateModel([value], shape, depth);

				return trace === undefined
					? createRelay({ value: brand(value, { [TagScope]: "model", [TagShape]: shape }) })
					: createRelay({ trace });

			}

		} else { // validate value directly, ignoring scope

			const trace = validateValue([value], shape);

			return trace === undefined
				? createRelay({ value: value as Value })
				: createRelay({ trace });

		}

	} catch ( e ) {

		return createRelay({ trace: message(e) });

	}

}
