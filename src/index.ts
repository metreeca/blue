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
 * Provides validation for linked data {@link @metreeca/qest!Resource | resources}, retrieval
 * {@link Template | templates}, and individual values against {@link https://www.w3.org/TR/shacl/ | SHACL}-derived
 * {@link Shape | shapes}.
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
 *   name: required(string({ model: "name", minLength: 1, maxLength: 100 })),
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
 * **Validating Projections**
 *
 * When the projection {@link Template} is not bonded to the shape (typically at API boundaries where `shape` defines
 * the admissible surface and the projection arrives per request), pass `model` as a separate argument. The return
 * value is narrowed to `Instance<T>` where `T` is inferred from `model`:
 *
 * ```typescript
 * const model = { id: "", name: "" };       // projection requested by the caller
 *
 * validate(response, { shape: Product, model })({
 *   value: product => console.log(product.name),   // typed as { readonly id: Reference; readonly name: string }
 *   trace: trace => console.error(trace)
 * });
 * ```
 *
 * **Validating Templates**
 *
 * Validate a retrieval {@link Template | template} using {@link validate} with `model: true`:
 *
 * ```typescript
 * validate(data, { shape: Product, model: true });
 * validate(data, { shape: Product, model: true, plain: true });
 * validate(data, { shape: Product, model: true, depth: 0 });
 * validate(data, { shape: Product, model: true, limit: 100 });
 * ```
 *
 * The `model` option answers "are we validating a model, or validating against one?" and selects between the three
 * modes shown above:
 *
 * - omitted or `false` — validate `value` as an instance against the shape's bonded model
 * - a projection {@link Template} value — validate `value` as an instance against that explicit projection; narrows
 * the
 *     return to `Instance<T>` where `T` is inferred from `model`
 * - `true` — validate `value` as a retrieval template (the model itself, not an instance of it)
 *
 * > [!CAUTION]
 * > By default, templates support the full query language, including aggregate transforms and nested expansion.
 * > When exposing endpoints to untrusted clients, restrict query complexity as required by setting `plain`
 * > to `true`, `depth` to `0` or a positive value, and/or `limit` to a maximum result set size.
 *
 * @module index
 *
 * @see {@link https://www.w3.org/TR/shacl/ | SHACL - Shapes Constraint Language}
 */

import { type Lazy, map } from "@metreeca/core";
import { equals, seal } from "@metreeca/core/structures";
import { createRelay, type Relay } from "@metreeca/core/relay";
import { type Reference } from "@metreeca/qest/resource";
import type { Instance, Template } from "@metreeca/qest/template";
import { type Trace, TraceError } from "@metreeca/core/trace";
import { sh } from "./index.core.js";
import type { ReferenceShape } from "./reference.js";
import { enforce, validateResource, validateResult, validateTemplate } from "./resource.core.js";
import type { ResourceShape } from "./resource.js";
import { validateUnion } from "./union.core.js";
import { eager, validateValue } from "./value.core.js";
import type { Shape } from "./value.js";

export { sh };


/**
 * Seal tag for idempotent validation.
 *
 * Marks a value as already validated by {@link validate}, enabling the function to skip re-validation
 * when the same shape and options are presented again.
 */
const Validated: unique symbol = Symbol("Validated");


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates a resource against a shape.
 *
 * Enforces all shape constraints including type, cardinality, closed-shape checks, and custom validators.
 * Unknown and missing entries are both rejected; all declared entries are required unless marked optional
 * by the shape. The return value is narrowed to `Instance<T>` where `T` is the projection {@link Template} bonded
 * to the shape's `model` slot.
 *
 * > [!CAUTION]
 * > By default, resources accept captive reference expansion to unbounded depth. To enforce a strict update process
 * > that admits only bare references, set `depth` to `0` to reject all expansion; set it to a positive value to cap
 * > the nesting depth admitted.
 *
 * > [!TIP]
 * > When the projection template is not bonded to the shape (for example, at API boundaries where `shape` and the
 * > requested projection arrive as independent inputs) use the projection-form overload that takes `model` as a
 * > separate argument.
 *
 * > [!TIP]
 * > The function is idempotent on a specific shape: on re-validation against the same shape, the previous
 * > association is trusted without repeating the validation process, so that you can safely re-validate defensively.
 *
 * @typeParam T The projection {@link Template} inferred from the shape's bonded `model` slot
 *
 * @param value The value to validate as a resource
 * @param opts Validation options
 * @param opts.shape The {@link Lazy} {@link ResourceShape} defining validation constraints
 * @param opts.model Omit (or pass `false`) to validate `value` as a full resource instance against the shape
 * @param opts.entry Expected {@link Reference} for the resource's {@link resource!Id | id} entry; if provided and the
 *     resource contains an `id` property, the `id` value must match this reference exactly; ignored if the resource
 *     has no `id` entry
 * @param opts.depth Maximum nesting depth for expanding `captive` reference values as inline target resource states;
 *     each expansion level counts against the budget; `0` rejects all expansion, accepting bare IRI references only;
 *     if omitted, no depth limit is enforced
 *
 * @returns A {@link Relay} resolving to either `{ value }` on success or `{ trace }` on failure; on success, the
 *     value is an immutable copy validated against a verified and flattened copy of the shape
 *     (see {@link resource!resource | resource}); on failure, the trace describes
 *     constraint violations
 *
 * @throws {TraceError} If the shape is malformed (see {@link resource!resource | resource})
 */
export function validate<T extends Template>(value: unknown, opts: {

	readonly shape: Lazy<ResourceShape & { model: T }>
	readonly model?: false

	readonly entry?: Reference
	readonly depth?: number

}): Relay<{

	readonly value: Instance<T>,
	readonly trace: undefined | Trace

}>;

/**
 * Validates a retrieval result against a shape under an explicit projection template.
 *
 * Narrows the admissibility check to the surface projected by `model`: constraints declared in `shape` are enforced
 * only for keys named in `model`, recursing into nested shapes for nested templates and dropping any shape leaf
 * without a counterpart in `model`. Intended for call sites that receive `shape` and the requested projection as
 * independent inputs, such as response-validating adapters or API boundary validators where the admissible surface
 * is fixed and the projection varies per request.
 *
 * Differs from the bonded-shape resource overload in three ways:
 *
 * - **Partial resources** — constraints on keys absent from `model` are not enforced; unrequested required fields do
 *     not trigger `minCount` violations.
 * - **Expanded nested references** — slots of {@link ReferenceShape} kind accept an expanded nested resource in
 *     addition to a bare {@link Reference}, validated against the linked resource's target shape narrowed by the
 *     nested projection in `model`.
 * - **Projection results** — the return value is narrowed to `Instance<T>` where `T` is inferred from `model`.
 *
 * > [!TIP]
 * > The function is idempotent on a specific `(shape, model)` combination: on re-validation against the same shape
 * > and model the previous association is trusted without repeating the validation process, so that you can safely
 * > re-validate defensively.
 *
 * @typeParam T The projection {@link Template} inferred from `model`
 *
 * @param value The value to validate as a retrieval result
 * @param opts Validation options
 * @param opts.shape The {@link Lazy} {@link ResourceShape} defining the admissible surface
 * @param opts.model Projection {@link Template} narrowing the admissibility check to the projected surface and the
 *     return value to `Instance<T>`
 * @param opts.entry Expected {@link Reference} for the resource's {@link resource!Id | id} entry; if provided and the
 *     resource contains an `id` property, the `id` value must match this reference exactly; ignored if the resource
 *     has no `id` entry
 *
 * @returns A {@link Relay} resolving to either `{ value }` on success or `{ trace }` on failure; on success, the
 *     value is an immutable copy validated against a verified and flattened copy of the shape narrowed by `model`
 *     (see {@link resource!resource | resource}); on failure, the trace describes constraint violations
 *
 * @throws {TraceError} If the shape is malformed (see {@link resource!resource | resource})
 */
export function validate<T extends Template>(value: unknown, opts: {

	readonly shape: Lazy<ResourceShape>
	readonly model: T

	readonly entry?: Reference

}): Relay<{

	readonly value: Instance<T>,
	readonly trace: undefined | Trace

}>;

/**
 * Validates a template against a shape.
 *
 * Enforces type and structural constraints; value constraints are skipped as query values are placeholders.
 * Cardinality is checked for shape consistency (scalar if `maxCount` is 1, singleton tuple otherwise);
 * missing entries are accepted as not requested. Bindings whose probe — `path` and `pipe` — fails to resolve
 * against the shape are rejected with an atomic trace under the binding key.
 *
 * > [!CAUTION]
 * > By default, templates support the full query language, including aggregate transforms and nested expansion.
 * > When exposing endpoints to untrusted clients, restrict query complexity as required by setting `plain`
 * > to `true`, `depth` to `0` or a positive value, and/or `limit` to a maximum result set size.
 *
 * > [!TIP]
 * > Retrieval forms for linked resources differ by shape kind:
 * >
 * > | Shape kind                                           | IRI reference | Nested template |
 * > |------------------------------------------------------|:-------------:|:---------------:|
 * > | Embedded resource — direct {@link ResourceShape}     |       —       |        ✓        |
 * > | Standalone resource — {@link ReferenceShape} wrapper |       ✓       |        ✓        |
 * >
 * > An **IRI reference** is a bare IRI reference placeholder retrieving only the identifier; as a placeholder it is
 * > never resolved on decoding, so it admits any IRI reference (the empty string, a root-relative or relative
 * > reference, or an absolute IRI). A **nested template** is a {@link Template} retrieving the requested subset of the
 * > linked resource, validated against its target shape and subject to the `depth` budget (if any). Setting `depth`
 * > to `0` disables the nested-template form for references while still accepting IRI references.
 *
 * > [!TIP]
 * > The function is idempotent on a specific shape: on re-validation against the same shape, the previous
 * > association is trusted without repeating the validation process, so that you can safely re-validate defensively.
 *
 * @typeParam T The {@link Template} type inferred from `shape`
 *
 * @param value The value to validate as a template
 * @param opts Validation options
 * @param opts.shape The {@link Lazy} {@link ResourceShape} defining the expected structure
 * @param opts.model Must be `true` to validate `value` as a retrieval template rather than as an instance
 * @param opts.plain Whether to reject aggregate transforms (`count`, `sum`, `min`, `max`, `avg`); `true` rejects
 *     any binding containing aggregate transforms; defaults to `false`
 * @param opts.depth Maximum depth for nested {@link Template} expansion and property paths in query probes,
 *     where each nesting level or path segment counts against the budget; `0` rejects any nested {@link Template}
 *     while still accepting IRI references; if omitted, no depth constraint is enforced
 * @param opts.limit Maximum value for the {@link @metreeca/qest!Selection | `#`} pagination constraint in queries;
 *     a positive value caps the result set: a query whose `#` exceeds it, or is `0` (unbounded), is rejected, and a
 *     query omitting `#` has the limit injected as a default; a value of `0`, like omitting the option, is itself
 *     unbounded, enforcing no limit and injecting no `#`
 *
 * @returns A {@link Relay} resolving to either `{ value }` on success or `{ trace }` on failure; on success, the
 *     value is an immutable copy validated against a verified and flattened copy of the shape
 *     (see {@link resource!resource | resource}); on failure, the trace describes constraint violations
 *
 * @throws {TraceError} If the shape is malformed (see {@link resource!resource | resource})
 */
export function validate<T extends Template>(value: unknown, opts: {

	readonly shape: Lazy<ResourceShape>
	readonly model: true

	readonly plain?: boolean
	readonly depth?: number
	readonly limit?: number

}): Relay<{

	readonly value: T,
	readonly trace: undefined | Trace

}>;

/**
 * Validates resources and templates against shapes.
 */
export function validate(value: unknown, {

	shape,
	model,

	entry,

	plain,
	depth,
	limit

}: {

	readonly shape: Lazy<Shape>
	readonly model?: boolean | Template

	readonly entry?: Reference

	readonly plain?: boolean
	readonly depth?: number
	readonly limit?: number

}): Relay<{

	readonly value: unknown,
	readonly trace: undefined | Trace

}> {

	return map(eager(shape), shape => {

		if ( shape.kind === "union" ) {

			const trace = validateUnion(value, shape.variants, {
				model: model === true,
				match: (value, variant, model) => validateValue([value], variant, {
					scope: model ? "model" : "state"
				}) === undefined
			});

			return trace !== undefined ? createRelay({ trace }) : createRelay({ value });

		} else if ( shape.kind !== "resource" ) {

			const trace = validateValue([value], shape, { scope: model === true ? "model" : "state" });

			return trace !== undefined ? createRelay({ trace }) : createRelay({ value });

		} else if ( model === true ) {

			const sealed = seal<{

				readonly model: boolean | Template
				readonly shape: ResourceShape

				readonly plain?: boolean
				readonly depth?: number
				readonly limit?: number

			}>(value, Validated);

			if ( sealed !== undefined && sealed.model === true
				&& shape === sealed.shape
				&& (!plain || sealed.plain)
				&& (depth === undefined || sealed.depth !== undefined && sealed.depth <= depth)
				&& (!limit || sealed.limit && sealed.limit <= limit) // limit === 0 effectively undefined
			) {

				return createRelay({ value });

			} else {

				const trace = validateTemplate([value], shape, { depth, plain, limit });

				return trace !== undefined ? createRelay({ trace }) : createRelay({

					value: seal(enforce(value, shape, { limit }), Validated, {

						model: true,
						shape: shape,

						plain,
						depth,
						limit

					})

				});

			}

		} else if ( model !== undefined && model !== false ) {

			const sealed = seal<{

				readonly model: boolean | Template
				readonly shape: ResourceShape

				readonly entry?: Reference

			}>(value, Validated);

			if ( sealed !== undefined && sealed.model !== true && sealed.model !== false
				&& equals(sealed.model, model)
				&& shape === sealed.shape
				&& (entry === undefined || sealed.entry === entry)
			) {

				return createRelay({ value });

			} else {

				const trace = validateResult([value], { shape: shape, model, entry });

				return trace !== undefined ? createRelay({ trace }) : createRelay({

					value: seal(value, Validated, {

						model,
						shape: shape,

						entry

					})

				});

			}

		} else {

			const sealed = seal<{

				readonly model: boolean | Template
				readonly shape: ResourceShape

				readonly entry?: Reference
				readonly depth?: number

			}>(value, Validated);

			if ( sealed !== undefined && sealed.model === false
				&& shape === sealed.shape
				&& (entry === undefined || sealed.entry === entry)
				&& (depth === undefined || sealed.depth !== undefined && sealed.depth <= depth)
			) {

				return createRelay({ value });

			} else {

				const trace = validateResource([value], shape, { entry, depth });

				return trace !== undefined ? createRelay({ trace }) : createRelay({

					value: seal(value, Validated, {

						model: false,
						shape: shape,

						entry,
						depth

					})

				});

			}

		}

	});

}
