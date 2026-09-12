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
 * Linked data validation.
 *
 * Provides shape-based validation for the values, retrieval templates and retrieved data crossing a service boundary.
 * The {@link validate} function returns either the value, typed as the shape describes it, or a trace of every
 * violation found. A shape states once what a service accepts, so the checks stay in one place instead of scattered
 * across the entry points that receive data.
 *
 * Shapes are stated with the per-kind modules {@link value! | value} gathers:
 *
 * ```typescript
 * import { boolean } from '@metreeca/blue/boolean';
 * import { integer } from '@metreeca/blue/number';
 * import { id, multiple, optional, required, resource } from '@metreeca/blue/resource';
 * import { date, string } from '@metreeca/blue/string';
 *
 * const Product = resource({
 *   id: id(),
 *   name: required(string({ minLength: 1, maxLength: 100 })),
 *   price: required(integer({ minInclusive: 0 })),
 *   available: optional(boolean()),
 *   tags: multiple(string()),
 *   released: optional(date())
 * });
 * ```
 *
 * **Matching a value against a shape**
 *
 * The same shape answers three questions; the `model` option settles which is being asked:
 *
 * ```typescript
 * import { validate } from '@metreeca/blue';
 *
 * validate(product, { shape: Product })({                    // a resource in its own right
 *   value: product => console.log(product.name),
 *   trace: trace => console.error(trace)
 * });
 *
 * validate(response, { shape: Product, model: { name: "" } });  // a retrieval, narrowed by what was asked for
 * validate(request, { shape: Product, model: true });           // a retrieval template, before it is issued
 * ```
 *
 * - omitted, or `false`, matches `value` against the shape as a resource in its own right
 * - a template matches `value` against the members that template asked for, and types what comes back accordingly
 * - `true` matches `value` against the shape as a template, asking whether the shape can serve what it requests
 *
 * > [!CAUTION]
 * > A template may draw on the full query language, including aggregate transforms and nested expansion. Hold an
 * > untrusted caller to what the service will serve: `plain` refuses the aggregate transforms, `depth` caps the
 * > nesting, and `limit` caps the page.
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/shacl/ SHACL - Shapes Constraint Language}
 */

import { type Lazy, map, type Optional } from "@metreeca/core";
import { createRelay, type Relay } from "@metreeca/core/relay";
import { equals, seal } from "@metreeca/core/structures";
import { type Trace } from "@metreeca/core/trace";
import type { Reference } from "@metreeca/qest/resource";
import type { Instance as Fetched, Template } from "@metreeca/qest/template";
import { enforce } from "./index.core.js";
import type { ResourceShape } from "./resource/index.js";
import { validateResource, validateResult, validateTemplate } from "./resource/validator.js";
import type { Instance, Shape } from "./value/index.js";
import { eager } from "./value/index.js";
import { validateShape } from "./value/validator.js";


/**
 * The seal marking a value as already validated.
 *
 * Carries what it was validated against, so that validating it again on the same terms is settled by the seal rather
 * than by walking the value a second time.
 */
const Validated: unique symbol = Symbol("validated");


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates a resource against a shape.
 *
 * Reports what a resource states wrongly, so that a caller may refuse it before it reaches whatever holds it, and
 * hands back the resource itself where it passes, typed as the shape describes it. Every member the shape declares is
 * held to it and one it doesn't declare is rejected, the shape being closed; a member the shape admits no value for
 * may be left out.
 *
 * > [!CAUTION]
 * > A captive member is expanded to whatever depth it reaches. Where a caller must be held to bare links, state
 * > `depth` as `0` to refuse every expansion, or as the nesting it may ask for.
 *
 * > [!TIP]
 * > Validating a value twice on the same terms costs nothing: the second call reads the first one's verdict off the
 * > value, so a caller may validate defensively wherever it is unsure.
 *
 * @typeParam S The shape the resource is matched against
 *
 * @param value The value to validate as a resource
 * @param opts Validation options
 * @param opts.shape The shape the resource is matched against, possibly deferred to break definition cycles
 * @param opts.model Omitted, or `false`, to validate `value` as a resource in its own right
 * @param opts.entry The identifier the resource is expected to be named by, where it states one at all
 * @param opts.depth The nesting a captive member may be expanded to, counting each resource it descends into; `0`
 *     refuses every expansion while still admitting the identifier naming the resource
 *
 * @returns A {@link Relay} carrying the resource where it passes and a trace of the violations where it doesn't
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `shape` is malformed
 */
export function validate<S extends Lazy<ResourceShape>>(value: unknown, opts: {

	readonly shape: S
	readonly model?: false

	readonly entry?: Reference
	readonly depth?: number

}): Relay<{

	readonly value: Instance<S>,
	readonly trace: Optional<Trace>

}>;

/**
 * Validates a retrieved resource against a shape, narrowed by the template that requested it.
 *
 * Reports what a retrieval brought back wrongly, so that a caller may refuse a malformed response before reading it,
 * and hands back the resource typed as the template asked for it. Only the members the template names are held to the
 * shape, so a partial retrieval passes on its own terms, and a member the template didn't ask for is rejected, the
 * caller having nowhere to put it. Reach for this where the shape fixes what may be asked for and the template varies
 * from one request to the next.
 *
 * > [!TIP]
 * > Validating a value twice on the same shape and template costs nothing, as {@link validate | validating a resource}
 * > explains.
 *
 * @typeParam T The template the resource was requested by
 *
 * @param value The value to validate as a retrieved resource
 * @param opts Validation options
 * @param opts.shape The shape the resource is matched against, possibly deferred to break definition cycles
 * @param opts.model The template that requested it, narrowing both what is checked and what comes back
 * @param opts.entry The identifier the resource is expected to be named by, where it states one at all
 *
 * @returns A {@link Relay} carrying the resource where it passes and a trace of the violations where it doesn't
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `shape` is malformed
 */
export function validate<T extends Template>(value: unknown, opts: {

	readonly shape: Lazy<ResourceShape>
	readonly model: T

	readonly entry?: Reference

}): Relay<{

	readonly value: Fetched<T>,
	readonly trace: Optional<Trace>

}>;

/**
 * Validates a retrieval template against a shape.
 *
 * Reports each slot of a template that asks for something the shape cannot give, so that a caller may refuse a
 * request before issuing it, and hands back the template itself where it passes, held to whatever the service
 * guarantees. A template describes what to retrieve rather than what is held, so the value-domain constraints are
 * left alone and a slot the template omits is simply not asked for.
 *
 * > [!CAUTION]
 * > A template may draw on the full query language, including aggregate transforms and nested expansion. Hold an
 * > untrusted caller to what the service will serve: `plain` refuses the aggregate transforms, `depth` caps the
 * > nesting, and `limit` caps the page.
 *
 * > [!TIP]
 * > A member reaching a standalone resource may be asked for as the identifier naming it or as a template standing for
 * > the resource behind it; an embedded one, having no identifier of its own, only as a template. Stating `depth` as
 * > `0` thus leaves a link retrievable while refusing the resource behind it.
 *
 * > [!TIP]
 * > Validating a value twice on the same terms costs nothing, as {@link validate | validating a resource} explains.
 *
 * @typeParam T The template the shape admits
 *
 * @param value The value to validate as a retrieval template
 * @param opts Validation options
 * @param opts.shape The shape the template is matched against, possibly deferred to break definition cycles
 * @param opts.model Must be `true` to validate `value` as a template rather than as a resource
 * @param opts.plain Whether to refuse the transforms combining several values into one, leaving a template that
 *     retrieves rather than computes
 * @param opts.depth The nesting a template may ask for, counting each resource it descends into; `0` refuses every
 *     nested template while still admitting the identifier naming the resource
 * @param opts.limit The largest page a template may ask for; a collection asking for none is held to it, and one
 *     asking for more is refused. `0`, like omitting it, leaves the page to the caller
 *
 * @returns A {@link Relay} carrying the template where it passes and a trace of the violations where it doesn't
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `shape` is malformed
 */
export function validate<T extends Template>(value: unknown, opts: {

	readonly shape: Lazy<ResourceShape>
	readonly model: true

	readonly plain?: boolean
	readonly depth?: number
	readonly limit?: number

}): Relay<{

	readonly value: T,
	readonly trace: Optional<Trace>

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
	readonly trace: Optional<Trace>

}> {

	return map(eager(shape), shape => {

		if ( shape.kind !== "resource" ) {

			// a value outside a resource carries nothing to seal, so it is matched as it stands

			const trace = validateShape([value], shape, { scope: model === true ? "model" : "state" });

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
				&& (!limit || sealed.limit && sealed.limit <= limit) // a limit of 0 leaves the page unbounded
			) {

				return createRelay({ value });

			} else {

				const trace = validateTemplate([value], shape, { plain, depth, limit });

				return trace !== undefined ? createRelay({ trace }) : createRelay({

					value: seal(enforce(value, shape, { limit }), Validated, {

						model: true,
						shape,

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

				const trace = validateResult([value], { shape, model, entry });

				return trace !== undefined ? createRelay({ trace }) : createRelay({

					value: seal(value, Validated, {

						model,
						shape,

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
						shape,

						entry,
						depth

					})

				});

			}

		}

	});

}
