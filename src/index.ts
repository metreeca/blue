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
 * The {@link schema} function describes the payloads a shape admits as a JSON Schema, and the {@link validate}
 * function returns either the value, typed as the shape describes it, or a trace of every violation found. A shape
 * states once what a service accepts, so the description and the checks stay in one place instead of being restated
 * across the interfaces and entry points that exchange data with clients.
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
 * **Describing a shape as JSON Schema**
 *
 * A shape also declares schema-driven consumers, such as API descriptions, language model tool interfaces and
 * structured output formats, without a hand-written schema restating it. The {@link schema} function describes the
 * payloads a resource shape admits as a JSON Schema (draft 2020-12). Its strict variant keeps to the subset of JSON
 * Schema accepted by structured output generators, which reject the keywords and formats outside it:
 *
 * ```typescript
 * import { schema } from '@metreeca/blue';
 *
 * schema(Product);                    // the payloads Product admits
 * schema(Product, { strict: true });  // the same, for strict structured output generators
 * ```
 *
 * **Collecting entry shapes and their dependencies**
 *
 * Model-wide encodings, such as vocabularies, schemas and documentation, cover every shape a set of entry shapes
 * depends on rather than only the entry shapes themselves. The {@link model} function collects the entry shapes and
 * the shapes they extend, link to or embed, each once and in a stable order, ready to be encoded as a whole:
 *
 * ```typescript
 * import { model } from '@metreeca/blue';
 * import { id, optional, resource } from '@metreeca/blue/resource';
 * import { reference } from '@metreeca/blue/reference';
 *
 * const Vendor = resource({
 *   id: id()
 * });
 *
 * const Offer = resource({
 *   id: id(),
 *   vendor: optional(reference(Vendor))
 * });
 *
 * model(Offer); // [Offer, Vendor]
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
 * validate(response, { shape: Product, model: { name: {} } });  // a retrieval, narrowed by what was asked for
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
 * @module index
 *
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-core JSON Schema Core (draft 2020-12)}
 * @see {@link https://www.w3.org/TR/shacl/ SHACL - Shapes Constraint Language}
 */

import { isString, type Lazy, map, memo, opt, type Optional } from "@metreeca/core";
import { type Some, some } from "@metreeca/core/arrays";
import { createRelay, type Relay } from "@metreeca/core/relay";
import { type Trace } from "@metreeca/core/trace";
import { equals, immutable, seal } from "@metreeca/core/values";
import type { Template } from "@metreeca/qest/model";
import type { Dictionary, Reference } from "@metreeca/qest/state";
import type { JSONSchema } from "json-schema-typed";
import { enforce } from "./index.core.js";
import { getShapeTarget } from "./reference/index.js";
import type { Property, ResourceShape } from "./resource/index.js";
import { validateResource, validateResult, validateTemplate } from "./resource/validator.js";
import { date, email, instant, iri, time, timestamp, url } from "./string/index.js";
import { eager, type Match, type Shape, type State } from "./value/index.js";
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
 * The JSON Schema converted for a shape in each mode, retained for the lifetime of the module (see {@link memo}).
 */
const schemas = memo((strict: boolean) => {

	/**
	 * The JSON Schema format each well-known lexical pattern stands for; only `strict` formats are carried by strict
	 * schemas, as strict structured output generators reject the others, while plain schemas carry every format.
	 *
	 * Built on first conversion rather than at module load, as the string module imports this one through a cycle.
	 */
	const formats = new Map<Optional<string>, {

		readonly format: string,
		readonly strict?: boolean

	}>([

		[url().pattern, { format: "uri" }],
		[iri().pattern, { format: "iri-reference" }],
		[email().pattern, { format: "email", strict: true }],

		[date().pattern, { format: "date", strict: true }],
		[time().pattern, { format: "time", strict: true }],

		[instant().pattern, { format: "date-time", strict: true }],
		[timestamp().pattern, { format: "date-time", strict: true }]

	]);

	return memo((shape: ResourceShape) => immutable(value(shape)));


	function value(shape: Shape): JSONSchema.Interface {

		switch ( shape.kind ) {

			case "boolean":

				return {

					type: "boolean"

				};

			case "number":

				return {

					type: shape.integral ? "integer" : "number",

					...opt(shape.minInclusive, minimum => ({ minimum })),
					...opt(shape.maxInclusive, maximum => ({ maximum }))

				};

			case "string":

				return {

					type: "string",

					...opt(shape.in, values => ({ enum: [...values] })),
					...opt(formats.get(shape.pattern), ({ format, strict: supported }) =>
						strict && !supported ? {} : { format }
					),
					...opt(shape.pattern, pattern => ({ pattern })),

					...opt(shape.minLength, minLength => ({ minLength })),
					...opt(shape.maxLength, maxLength => ({ maxLength }))

				};

			case "reference":

				return {

					type: "string",

					...(strict ? {} : { format: "iri-reference" })

				};

			case "resource":

				const properties = Object.entries(shape.members).flatMap(([name, member]) =>
					member.kind === "property" ? [{ name, member }] : []
				);

				const required = properties
					.filter(({ member: { range: { minCount = 0 } } }) => strict || minCount > 0)
					.map(({ name }) => name);

				return {

					type: "object",

					...annotations(shape),

					properties: Object.fromEntries(properties.map(({ name, member }) => [name, property(member)])),

					...(required.length > 0 ? { required } : {}),

					additionalProperties: false

				};

			case "dictionary": // keyed by the language tags a value happens to carry, which a schema has no way to name

				throw new RangeError(`unsupported localised <${shape.kind}> range in JSON Schema`);

			case "union":

				return {

					anyOf: shape.branches.map(branch => value(eager(branch)))

				};

		}

	}

	function property({ range: { shape, minCount = 0, maxCount }, ...member }: Property): JSONSchema.Interface {

		const items = value(eager(shape));

		return {

			...(maxCount !== 1 ? { type: "array", items }
				: strict && minCount === 0 ? { anyOf: [items, { type: "null" }] }
					: items),

			...annotations(member)

		};

	}

	function annotations({ name, description }: {

		readonly name?: string | Dictionary
		readonly description?: string | Dictionary

	}): JSONSchema.Interface {

		return {

			...opt(english(name), title => ({ title })),
			...opt(english(description), description => ({ description }))

		};

	}

	function english(text: Optional<string | Dictionary>): Optional<string> {

		return opt(text, text => isString(text) ? text
			: opt(text.en, entry => isString(entry) ? entry : entry.join("\n\n"))
		);

	}

});


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * The terms a value was validated against.
 *
 * Carries the shape and the options the verdict was reached under, so that a later validation is settled by the seal
 * exactly where it asks for no more than the first one already granted.
 */
type Sealed = {

	readonly model: boolean | Template
	readonly shape: ResourceShape

	readonly entry?: Reference

	readonly plain?: boolean
	readonly depth?: number
	readonly limit?: number

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Converts a resource shape into a JSON Schema.
 *
 * A resource is described as an object with one property per member. Like the shape, the object is closed and admits
 * no other property. Members requiring at least one value are required, and a member admitting more than one value is
 * described as an array of its range. Identifier and class members are left out, as they name the resource rather than
 * describe it, so a payload stating them is rejected. A {@link reference!reference | reference} is described as the
 * IRI it carries, and an embedded resource as a nested object. A {@link union!union | union} is described as the
 * alternatives it admits, so the schema accepts a value conforming to any one of its branches.
 *
 * Value constraints are carried through: the bounds of a number and whether it is an integer, and the values, length
 * bounds and lexical pattern of a string. A string in a well-known lexical form also carries the matching `format`, a
 * hint for the consumers that recognise it about the kind of value expected and how to present or check it:
 *
 * - {@link string!url | url} as `uri`, {@link string!iri | iri} as `iri-reference`
 * - {@link string!email | email} as `email`
 * - {@link string!date | date} as `date`, {@link string!time | time} as `time`
 * - {@link string!instant | instant} and {@link string!timestamp | timestamp} as `date-time`
 *
 * Values are still held to the pattern alone: a validator asserting formats may reject values the shape admits, such
 * as a time with no zone offset, so formats are best read as annotations rather than as constraints.
 *
 * The name and description of a resource and of each member are carried as `title` and `description`. A member
 * admitting more than one value annotates the array rather than its items. Localised names and descriptions are
 * carried in English, and are left out if they are stated in no English, as a schema has room for one language only.
 *
 * A strict schema keeps to the subset of JSON Schema accepted by strict structured output generators. Every member is
 * required. An optional single-valued member also admits `null` for an absent value, and an absent multi-valued member
 * is stated as an empty array. A payload generated under a strict schema therefore conforms to the shape only once its
 * `null` members are dropped. No string carries the `uri` or `iri-reference` format: IRI strings are held to their
 * pattern, and references only to being strings, as strict generators reject both formats.
 *
 * The returned schema is deeply immutable. Conversions are cached, so converting the same shape again with the same
 * options returns the same schema at no cost, whether the shape is passed as is or deferred. Cached schemas are kept
 * for the lifetime of the module, so shapes are best declared once rather than built anew on each conversion.
 *
 * @param shape The resource shape to convert, possibly deferred
 * @param options The conversion options
 *
 * @returns The JSON Schema describing the values `shape` admits
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `shape` is malformed, as where it embeds itself with no
 *     link to break the cycle and so admits no finite payload a schema could describe
 * @throws {@link !RangeError RangeError} If `shape` admits a {@link dictionary!dictionary | localised} value range at
 *     any depth, as a JSON Schema has no way to name the language tags keying each localised value it describes
 *
 * @see {@link https://json-schema.org/draft/2020-12/json-schema-validation#section-7.3 JSON Schema § 7.3 Defined Formats}
 */
export function schema(shape: Lazy<ResourceShape>, {

	strict = false

}: {

	/**
	 * Whether to produce a strict schema for structured output generators.
	 *
	 * @defaultValue false
	 */
	readonly strict?: boolean

} = {}): JSONSchema.Interface {

	return schemas(strict)(eager(shape));

}

/**
 * Collects entry shapes and their dependencies.
 *
 * A shape depends on the shapes it extends and on the shapes its properties link to or embed, directly or through
 * other shapes. Dependencies include the targets of {@link resource!PropertyConstraints.foreign | foreign} properties
 * and the resource alternatives of {@link union!union | unions}, so the listing covers the whole connected model.
 *
 * Each shape is listed once, even where shapes link to each other in a cycle. The entry shapes come first, in the
 * order given, followed by their dependencies, nearest first. Shapes at the same distance follow the order of the
 * shapes reaching them, each contributing its parents before its property targets, in declaration order.
 *
 * @param shapes The entry shape or shapes, possibly deferred
 *
 * @returns The entry shapes followed by their dependencies; empty if `shapes` is empty
 *
 * @see {@link https://www.w3.org/TR/shacl/#shapes-graph SHACL § 3.1 Shapes Graph}
 */
export function model(shapes: Some<Lazy<ResourceShape>>): readonly ResourceShape[] {

	return reachable(some(shapes).map(eager), []);


	function reachable(pending: readonly ResourceShape[], visited: readonly ResourceShape[]): readonly ResourceShape[] {

		const [head, ...tail] = pending;

		return head === undefined ? visited
			: visited.includes(head) ? reachable(tail, visited)
				: reachable([...tail, ...neighbours(head)], [...visited, head]);

	}

	function neighbours({ parents, members }: ResourceShape): readonly ResourceShape[] {

		return [
			...parents.map(eager),
			...Object.values(members).flatMap(member => member.kind === "property" ? targets(member.range.shape) : [])
		];

	}

	function targets(shape: Lazy<Shape>): readonly ResourceShape[] {

		const resolved = eager(shape);

		return resolved.kind === "union"
			? resolved.branches.flatMap(targets)
			: opt(getShapeTarget(resolved), target => [target], []);

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates a resource against a shape.
 *
 * Reports what a resource states wrongly, so that a caller may refuse it before it reaches the store holding it, and
 * hands back the resource itself where it passes, typed as the shape describes it. Every member the shape declares is
 * held to it and one it doesn't declare is rejected, the shape being closed; a member the shape admits no value for
 * may be left out.
 *
 * > [!CAUTION]
 * > A captive member is expanded to whatever depth it reaches. Where a caller must be held to bare links, state
 * > `depth` as `0` to refuse every expansion, or as the nesting it may ask for.
 *
 * > [!TIP]
 * > Revalidating a value costs nothing where the second call asks for no more than the first: the earlier verdict is
 * > read off the value itself, so a caller may validate defensively wherever it is unsure.
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

	/**
	 * The resource as it stands, typed as the shape describes it; relayed where it passes.
	 */
	readonly value: State<S>,

	/**
	 * The violations the resource states, keyed by the member at fault; relayed where it doesn't pass.
	 */
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
 * > [!IMPORTANT]
 * > The custom {@link ResourceShape.validators | checks} a shape states never run against a retrieved resource, even
 * > one the template asked for whole: they run only where a whole resource is validated in its own right.
 *
 * > [!NOTE]
 * > The template states which values are wanted and no longer what they are, so every type comes from the shape: the
 * > resource comes back as {@link Match} resolves it, keyed down to the members the template named. A polymorphic
 * > member, a projection column and a localised member come back as wide as the shape describes them.
 *
 * > [!TIP]
 * > Revalidating a value against the same shape and template costs nothing, as
 * > {@link validate | validating a resource} explains.
 *
 * @typeParam S The shape the resource is matched against
 * @typeParam M The template the resource was requested by
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
export function validate<S extends Lazy<ResourceShape>, M extends Template>(value: unknown, opts: {

	readonly shape: S
	readonly model: M

	readonly entry?: Reference

}): Relay<{

	/**
	 * The resource as it stands, typed as the template asked for it; relayed where it passes.
	 */
	readonly value: Match<S, M>,

	/**
	 * The violations the retrieval brought back, keyed by the member at fault; relayed where it doesn't pass.
	 */
	readonly trace: Optional<Trace>

}>;

/**
 * Validates a retrieval template against a shape.
 *
 * Reports each slot of a template that asks for something the shape cannot give, so that a caller may refuse a
 * request before issuing it, and hands back the template itself where it passes, held to what the service
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
 * > Revalidating a value costs nothing where the second call asks for no more than the first, as
 * > {@link validate | validating a resource} explains.
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

	/**
	 * The template, held to what the service guarantees; relayed where it passes.
	 */
	readonly value: T,

	/**
	 * The violations the template states, keyed by the slot at fault; relayed where it doesn't pass.
	 */
	readonly trace: Optional<Trace>

}>;

/**
 * Validates a value against a shape.
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

			return verify(
				sealed => sealed.model === true
					&& (!plain || sealed.plain === true)
					&& (depth === undefined || sealed.depth !== undefined && sealed.depth <= depth)
					&& (!limit || !!sealed.limit && sealed.limit <= limit), // a limit of 0 leaves the page unbounded

				() => validateTemplate([value], shape, { plain, depth, limit }),

				{

					model: true,
					shape,

					plain,
					depth,
					limit

				},

				() => enforce(value, shape, { limit })
			);

		} else if ( model ) {

			return verify(
				sealed => equals(sealed.model, model)
					&& (entry === undefined || sealed.entry === entry),

				() => validateResult([value], { shape, model, entry }),

				{

					model,
					shape,

					entry

				}
			);

		} else {

			return verify(
				sealed => sealed.model === false
					&& (entry === undefined || sealed.entry === entry)
					&& (depth === undefined || sealed.depth !== undefined && sealed.depth <= depth),

				() => validateResource([value], shape, { entry, depth }),

				{

					model: false,
					shape,

					entry,
					depth

				}
			);

		}

	});


	/**
	 * Settles a resource validation against the seal the value may already carry.
	 *
	 * @param match Tells whether a seal already granted what this validation asks for; the shape the seal was reached
	 *     under is matched beforehand
	 * @param check Runs the validation where the seal settles nothing
	 * @param terms The terms to seal on a value that passes
	 * @param content Yields the value to seal, defaulting to the one validated
	 *
	 * @returns A {@link Relay} carrying the value where it passes and a trace of the violations where it doesn't
	 */
	function verify(
		match: (sealed: Sealed) => boolean,
		check: () => Optional<Trace>,
		terms: Sealed,
		content: () => unknown = () => value
	): Relay<{

		readonly value: unknown,
		readonly trace: Optional<Trace>

	}> {

		const sealed = seal<Sealed>(value, Validated);

		const settled = sealed !== undefined && sealed.shape === terms.shape && match(sealed);

		const trace = settled ? undefined : check();

		return trace !== undefined ? createRelay({ trace })
			: settled ? createRelay({ value })
				: createRelay({ value: seal(content(), Validated, terms) });

	}

}
