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
 * Resource shape type guards and validation.
 *
 * Provides type guards for {@link ResourceShape}, {@link ResourceConstraints}, and related types (Id, Type, Property,
 * Range, Union, Entries, Entry), plus the resource/model validators enforcing structural, cardinality, and value
 * constraints with inheritance resolution.
 *
 * @module
 */

import { type Identifier, isArray, isBoolean, isNumber, isObject, isString } from "@metreeca/core";
import { message } from "@metreeca/core/error";
import { isTagRange } from "@metreeca/core/language";
import { isIRI } from "@metreeca/core/resource";
import { decodeProbe, type Probe } from "@metreeca/qest/model";
import { type Reference, type Resource } from "@metreeca/qest/state";
import type { BooleanShape } from "./boolean.js";
import { apply, materialize, validateValue } from "./index.core.js";
import type { ValueShape } from "./index.js";
import type { LocalShape, LocalsShape } from "./local.js";
import type { NumberShape } from "./number.js";
import {
	type Property,
	type Range,
	type ReferenceShape,
	type ResourceConstraints,
	type ResourceShape,
	type Union
} from "./resource.js";
import type { StringShape } from "./string.js";
import { every, group, normalise, trace, wrap } from "./trace.core.js";
import type { Trace } from "./trace.js";


/**
 * Pattern format: absolute or root-relative IRI-like template with `{name}` placeholders and `/*` wildcard.
 */
const PatternFormat = new RegExp(
	"^"+
	"(?:[a-zA-Z][a-zA-Z0-9+.-]*://[^/]+)?" // optional scheme://authority
	+"/(?:(?:[^/{}*]+|\\{\\w+})(?:/(?:[^/{}*]+|\\{\\w+}))*)?" // path segments with {name} placeholders
	+"(?:/\\*)?"+ // optional /* wildcard
	"$"
);


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a {@link ReferenceShape}.
 *
 * Filters input values by type, reporting non-reference values under the `kind` key, then enforces
 * reference constraints on matched values.
 */
export function validateReference(values: readonly unknown[], shape: ReferenceShape): undefined | Trace {

	const matching = values.filter(isReference);
	const mistyped = values.length-matching.length;

	const lineage = walk(materialize(shape.shape));

	const patterns = lineage.flatMap(s => s.pattern !== undefined ? [s.pattern] : []);
	const allowed = lineage.flatMap(s => s.in !== undefined ? [s.in] : []);
	const required = lineage.flatMap(s => s.hasValue !== undefined ? [s.hasValue] : []);

	return trace({

		"{kind}": mistyped === 0
			|| `expected ${shape.kind} values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		...Object.fromEntries([

			...patterns.map((pattern, i) => [patterns.length > 1 ? `{pattern}[${i}]` : "{pattern}",
				every(matching, value => match(value, pattern) || `expected IRI matching pattern <${pattern}>`)
			]),

			...allowed.map((list, i) => [allowed.length > 1 ? `{in}[${i}]` : "{in}",
				every(matching, value => list.includes(value) || `expected IRI in [${list.join(", ")}]`)
			]),

			...required.map((list, i) => [required.length > 1 ? `{hasValue}[${i}]` : "{hasValue}",
				group(matching, group => list.every(v => group.includes(v)) || `expected values to include [${list.join(", ")}]`)
			])

		])

	});

}


/**
 * Validates complete resource states against a {@link ResourceShape}.
 *
 * Checks resource-level constraints (pattern, in, hasValue), property cardinality and value constraints, closed shape
 * enforcement, custom validators, and inherited properties. Unknown and missing properties are both rejected. Returns
 * a keyed trace where outer keys are property names and inner keys are constraint names, or `undefined` if all
 * resources are valid.
 *
 * @param values The resource instances to validate
 * @param shape The resource shape defining the expected structure
 *
 * @returns A keyed trace of constraint violations per property, or `undefined` if all resources are valid
 */
export function validateResource(values: readonly unknown[], shape: ResourceShape): undefined | Trace {

	const matching = values.filter(value => isObject(value));
	const mistyped = values.length-matching.length;

	const lineage = walk(shape);


	// resolve the identifier property key from the lineage

	const identifier = lineage
		.flatMap(s => Object.entries(s.properties))
		.find(([, entry]) => entry.kind === "id")
		?.[0];

	// merge properties across the lineage (child overrides parent)

	const entries = new Map(lineage.flatMap(s => Object.entries(s.properties)));

	// collect and deduplicate validators across the lineage

	const validators = [...new Set(lineage
		.flatMap(s => s.validators ?? [])
	)];


	return trace({

		"{kind}": mistyped === 0
			|| `expected ${shape.kind} values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		...Object.fromEntries(matching.map((resource, index) => [key(resource, index, identifier),

			trace(Object.fromEntries([

				// property validation — validate merged shape properties

				...[...entries].map(([name, entry]) => [name,
					entry.kind === "id" ? validateId(resource[name], lineage)
						: entry.kind === "type" ? validateType(resource[name])
							: validateProperty(resource[name], name, lineage)
				]),


				// envelope validation — reject unknown properties

				...Object.keys(resource)
					.filter(key => !entries.has(key))
					.map(key => [key, "unexpected property"]),

				// custom validators

				...validators
					.map(validator => [validator.name, normalise(validator(resource as Resource))] as const)
					.filter(([, trace]) => trace !== undefined)
					.map(([name, trace], i) => [`{${name || `validator[${i}]`}}`, trace])

			]))

		]))

	});


	function validateId(value: unknown, lineage: readonly ResourceShape[]): undefined | Trace {

		const patterns = lineage.flatMap(s => s.pattern !== undefined ? [s.pattern] : []);
		const allowed = lineage.flatMap(s => s.in !== undefined ? [s.in] : []);
		const required = lineage.flatMap(s => s.hasValue !== undefined ? [s.hasValue] : []);

		return trace({

			// format validation

			"{kind}": value === undefined ? "expected required id"
				: Array.isArray(value) ? "expected single value"
					: !isReference(value) ? "expected absolute IRI"
						: undefined,

			// constraint validation (conjunctive across inheritance lineage)

			...Object.fromEntries([

				...patterns.map((pattern, i) => [patterns.length > 1 ? `{pattern}[${i}]` : "{pattern}",
					isReference(value) && match(value, pattern) || `expected IRI matching pattern <${pattern}>`
				]),

				...allowed.map((list, i) => [allowed.length > 1 ? `{in}[${i}]` : "{in}",
					isReference(value) && list.includes(value) || `expected IRI in [${list.join(", ")}]`
				]),

				...required.map((list, i) => [required.length > 1 ? `{hasValue}[${i}]` : "{hasValue}",
					isReference(value) && list.includes(value) || `expected values to include [${list.join(", ")}]`
				])

			])

		});

	}

	function validateType(value: unknown): undefined | Trace {

		return value === undefined ? undefined : trace({

			"{kind}": Array.isArray(value) ? "expected single value"
				: !isReference(value) ? "expected absolute IRI"
					: undefined

		});

	}

	function validateProperty(value: unknown, name: Identifier, lineage: readonly ResourceShape[]): undefined | Trace {

		const ranges = lineage
			.map(s => s.properties[name])
			.filter((entry): entry is Property => entry?.kind === "property")
			.map(entry => entry.range);

		if ( ranges.length === 0 ) { return undefined; } else {

			return trace(Object.fromEntries(
				ranges.flatMap((range, i) => Object.entries(validateRange(value, range) ?? {})
					.map(([k, t]) => [ranges.length > 1 ? `${k}[${i}]` : k, t])
				)
			));

		}

	}

	function validateRange(value: unknown, {

		minCount,
		maxCount,
		shape

	}: Range): undefined | Trace {

		const isScalar = maxCount === 1;

		const values = value === undefined ? []
			: isArray(value) ? value
				: [value];

		if ( isScalar && value !== undefined && isArray(value) ) {

			return trace({

				"{kind}": "expected scalar value"

			});

		} else if ( !isScalar && value !== undefined && !isArray(value) ) {

			return trace({

				"{kind}": "expected array value"

			});

		} else {

			return trace({

				"{minCount}": minCount === undefined || values.length >= minCount
					|| `expected at least ${minCount} value(s), got ${values.length}`,

				"{maxCount}": maxCount === undefined || values.length <= maxCount
					|| `expected at most ${maxCount} value(s), got ${values.length}`,

				...wrap(shape.kind === "union"
					? validateUnion(values, shape)
					: validateValue(values, shape)
				)

			});

		}

	}

	function validateUnion(values: readonly unknown[], union: Union): undefined | Trace {

		const variants = Object.values(union.variants);

		return every(values, v =>
			variants.some(variantShape => validateValue([v], variantShape) === undefined)
			|| "value does not match any union variant"
		);

	}

}

/**
 * Validates projection models against a {@link ResourceShape}.
 *
 * Checks property shape (scalar vs singleton tuple), inherited properties, and {@link Probe} keys (transform pipe
 * resolution and projection type-checking). Value constraints, minCount/maxCount cardinality, and custom validators are
 * skipped as a model describes a projection shape rather than actual data. Unknown properties are silently skipped and
 * missing properties are accepted as not requested. Wherever a property specifies a resource (either directly or via a
 * reference), the model value may be either a {@link Reference} (retrieving just the id) or a nested resource model,
 * subject to `depth` limits. Returns a keyed trace where outer keys are property names and inner keys are constraint
 * names, or `undefined` if all models are valid.
 *
 * @param values The model instances to validate
 * @param shape The resource shape defining the expected structure
 * @param depth Maximum nesting depth for reference and embedded resource expansion; `0` rejects any nested model
 *     while still accepting IRI references; `null` for unlimited
 *
 * @returns A keyed trace of constraint violations per property, or `undefined` if all models are valid
 */
export function validateModel(values: readonly unknown[], shape: ResourceShape, depth: null | number): undefined | Trace {

	const matching = values.filter(value => isObject(value));
	const mistyped = values.length-matching.length;

	const lineage = walk(shape);

	// resolve the identifier property key from the lineage

	const identifier = lineage.flatMap(s => Object.entries(s.properties)).find(([, entry]) => entry.kind === "id")?.[0];

	return trace({

		"{kind}": mistyped === 0
			|| `expected object models${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		...Object.fromEntries(matching.map((model, index) => [key(model, index, identifier),

			trace(Object.fromEntries(Object.entries(model).map(([binding, template]) => {

				try {

					return [binding, validateProjection(decodeProbe(binding), template, shape, depth)];

				} catch ( e ) {

					return [binding, message(e)];

				}

			})))

		]))

	});


	function validateProjection(binding: Probe, value: unknown, shape: ValueShape, depth: null | number): undefined | Trace {

		const effective = apply(binding, shape);

		// undefined effective range means the binding cannot be populated at runtime; template is immaterial

		return effective === undefined ? undefined : validateRange(value, effective, depth);

	}

	function validateRange(value: unknown, range: Range, depth: null | number): undefined | Trace {

		const { maxCount, shape } = range;

		const isScalar = maxCount === 1;

		if ( isScalar ) {

			return trace(Array.isArray(value)
				? { "{kind}": "expected scalar value" }
				: wrap(validateScalar(value, shape, depth))
			);

		} else {

			return trace(!Array.isArray(value) || value.length !== 1
				? { "{kind}": "expected singleton tuple" }
				: wrap(validateCollection(value[0], shape, depth))
			);

		}

	}

	function validateScalar(value: unknown, shape: ValueShape | Union, depth: null | number): undefined | Trace {

		switch ( shape.kind ) {

			case "boolean":

				return validateBoolean(value, shape);

			case "number":

				return validateNumber(value, shape);

			case "string":

				return validateString(value, shape);

			case "local":

				return validateLocale(value, shape);

			case "locals":

				return validateLocales(value, shape);

			case "reference":

				return isString(value) ? (isReference(value) ? undefined : "expected absolute reference IRI")
					: depth !== null && depth <= 0 ? "exceeded maximum nesting depth"
						: validateModel([value], materialize(shape.shape), depth === null ? depth : depth-1);

			case "resource":

				return depth !== null && depth <= 0 ? "exceeded maximum nesting depth"
					: validateModel([value], shape, depth === null ? depth : depth-1);

			case "union":

				return Object.values(shape.variants)
					.some(variant => validateScalar(value, variant, depth) === undefined)
					? undefined : "value does not match any union variant";

		}

	}

	function validateCollection(value: unknown, shape: ValueShape | Union, depth: null | number): undefined | Trace {

		switch ( shape.kind ) {

			case "boolean":

				return validateBoolean(value, shape);

			case "number":

				return validateNumber(value, shape);

			case "string":

				return validateString(value, shape);

			case "local":

				return "unexpected local collection";

			case "locals":

				return "unexpected locals collection";

			case "reference":

				return isString(value) ? (isReference(value) ? undefined : "expected absolute reference IRI")
					: depth !== null && depth <= 0 ? "exceeded maximum nesting depth"
						: validateQuery(value, materialize(shape.shape), depth === null ? depth : depth-1);

			case "resource":

				return depth !== null && depth <= 0 ? "exceeded maximum nesting depth"
					: validateQuery(value, shape, depth === null ? depth : depth-1);

			case "union":

				return Object.values(shape.variants)
					.some(variant => validateCollection(value, variant, depth) === undefined)
					? undefined : "value does not match any union variant";

		}

	}


	function validateBoolean(value: unknown, { kind }: BooleanShape): undefined | Trace {

		return isBoolean(value) ? undefined : `expected ${kind} value`;

	}

	function validateNumber(value: unknown, { kind }: NumberShape): undefined | Trace {

		return isNumber(value) ? undefined : `expected ${kind} value`;

	}

	function validateString(value: unknown, { kind }: StringShape): undefined | Trace {

		return isString(value) ? undefined : `expected ${kind} value`;

	}

	function validateLocale(value: unknown, { kind }: LocalShape): undefined | Trace {

		if ( isString(value) ) {

			return undefined;

		} else if ( isObject(value) ) {

			return trace(Object.fromEntries(Object.entries(value).map(([k, v]) => [k,
				!isTagRange(k) ? "invalid tag range"
					: !isString(v) ? "expected string value"
						: undefined
			])));

		} else {

			return `expected ${kind} value`;

		}

	}

	function validateLocales(value: unknown, { kind }: LocalsShape): undefined | Trace {

		if ( isArray(value, [isString]) ) {

			return undefined;

		} else if ( isObject(value) ) {

			return trace(Object.fromEntries(Object.entries(value).map(([k, v]) => [k,
				!isTagRange(k) ? "invalid tag range"
					: !isArray(v, [isString]) ? "expected singleton string tuple"
						: undefined
			])));

		} else {

			return `expected ${kind} value`;

		}

	}

	function validateQuery(value: unknown, shape: ResourceShape, depth: null | number): undefined | Trace {

		return trace(!isObject(value)

			? { "{kind}": "expected query object" }

			: Object.fromEntries(Object.entries(value).map(([key, v]) => {

				try {

					const probe = decodeProbe(key);

					switch ( probe.target ) {

						case "<":
						case ">":
						case "<=":
						case ">=":

							return [key, validateLimit(v, apply(probe, shape)?.shape)];

						case "~":

							return [key, validateKeywords(v, apply(probe, shape)?.shape)];

						case "?":
						case "!":
						case "*":

							return [key, validateOptions(v, apply(probe, shape)?.shape)];

						case "^":

							return [key, v === "asc" || v === "desc" || isNumber(v) ? undefined
								: "expected 'asc', 'desc', or number value"
							];

						case "@":
						case "#":

							return [key, !isNumber(v) ? "expected number value"
								: !Number.isInteger(v) || v < 0 ? "expected non-negative integer"
									: undefined
							];

						default:

							return [key, validateProjection(probe, v, shape, depth)];

					}

				} catch ( e ) {

					return [key, message(e)];

				}

			}))
		);

	}


	function validateLimit(value: unknown, shape: undefined | ValueShape | Union): undefined | Trace {

		// undefined shape means the constraint cannot be evaluated at runtime; value is immaterial

		if ( shape === undefined ) {

			return undefined;

		} else {

			switch ( shape.kind ) {

				case "boolean":

					return validateBoolean(value, shape);

				case "number":

					return validateNumber(value, shape);

				case "string":

					return validateString(value, shape);

				case "local":
				case "locals":
				case "reference":
				case "resource":

					return `unsupported constraint for ${shape.kind} value`;

				case "union":

					return Object.values(shape.variants)
						.some(variant => validateLimit(value, variant) === undefined)
						? undefined : "limit does not match any union variant";

			}

		}

	}

	function validateKeywords(value: unknown, shape: ValueShape | Union | undefined): undefined | Trace {

		// undefined shape means the constraint cannot be evaluated at runtime; value is immaterial

		if ( shape === undefined ) {

			return undefined;

		} else {

			switch ( shape.kind ) {

				case "string":
				case "local":
				case "locals":

					return isString(value) ? undefined : "expected string value";

				case "boolean":
				case "number":
				case "reference":
				case "resource":

					return `unsupported constraint for ${shape.kind} value`;

				case "union":

					return Object.values(shape.variants)
						.some(variant => validateKeywords(value, variant) === undefined)
						? undefined : "keywords do not match any union variant";

			}

		}

	}

	function validateOptions(value: unknown, shape: undefined | ValueShape | Union): undefined | Trace {

		// undefined shape means the constraint cannot be evaluated at runtime; value is immaterial

		if ( shape === undefined ) {

			return undefined;

		} else if ( Array.isArray(value) ) {

			return trace(Object.fromEntries(value.map((element, index) =>
				[`[${index}]`, validateOption(element, shape)]
			)));

		} else {

			return validateOption(value, shape);

		}

	}

	function validateOption(value: unknown, shape: ValueShape | Union): undefined | Trace {

		if ( value === null ) { // null is a valid option for any value type

			return undefined;

		} else {

			switch ( shape.kind ) {

				case "boolean":

					return validateBoolean(value, shape);

				case "number":

					return validateNumber(value, shape);

				case "string":

					return validateString(value, shape);

				case "local":

					return validateLocale(value, shape);

				case "locals":

					return validateLocales(value, shape);

				case "reference":
				case "resource":

					return isReference(value) ? undefined : `expected ${shape.kind} value`;

				case "union":

					return Object.values(shape.variants)
						.some(variant => validateOption(value, variant) === undefined)
						? undefined : "option does not match any union variant";

			}

		}

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Walks the inheritance lineage of a {@link ResourceShape}, collecting all shapes in parent-first order.
 *
 * Handles diamond inheritance and defends against loops by tracking visited shapes. Each shape appears at most once
 * in the result, with parents before children.
 *
 * @param shape The shape whose inheritance lineage is to be walked
 * @param visited Accumulator for cycle and diamond detection
 *
 * @returns All shapes in the inheritance lineage, parent-first, deduplicated
 */
export function walk(shape: ResourceShape, visited: Set<ResourceShape> = new Set()): readonly ResourceShape[] {

	if ( visited.has(shape) ) {
		return [];
	}

	visited.add(shape);

	const parents = shape.extends === undefined ? []
		: Array.isArray(shape.extends) ? shape.extends.map(p => materialize(p))
			: [materialize(shape.extends)];

	return [...parents.flatMap(parent => walk(parent, visited)), shape];
}

/**
 * Checks whether an IRI matches a pattern template.
 *
 * Patterns support `{name}` placeholders for single path segments and `/*` for trailing wildcards. Root-relative
 * patterns match absolute IRIs, ignoring the origin.
 *
 * @param iri The IRI to test
 * @param pattern The pattern template to match against
 *
 * @returns true if the IRI matches the pattern; false otherwise
 *
 * @throws {TypeError} If `pattern` is malformed
 */
export function match(iri: Reference, pattern: string): boolean {

	if ( !PatternFormat.test(pattern) ) {
		throw new TypeError(`malformed pattern <${pattern}>`);
	}

	// {name} matches a single path segment
	// /* matches one or more trailing segments

	const regexPattern = pattern
		.replace(/[.+?^$()|[\]\\]/g, "\\$&")
		.replace(/\/\{\w*}(?=\/|$)/g, "/[^/]+")
		.replace(/\/\*$/, "/.+");

	// root-relative patterns match absolute IRIs ignoring origin (scheme and optional authority)

	const target = pattern.startsWith("/")
		? iri.replace(/^[a-z][a-z0-9+.-]*:(\/\/[^/]*)?/i, "")
		: iri;

	return new RegExp(`^${regexPattern}$`).test(target);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks if a value is a {@link Reference}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns True if the value is an absolute IRI
 */
function isReference(value: unknown): value is Reference {
	return isIRI(value, "absolute");
}

/**
 * Resolves a trace key for a resource value.
 *
 * Extracts the identifier property from `value` and returns it as the trace key if it is an absolute IRI; otherwise,
 * falls back to a positional blank node label (`_:{index}`).
 *
 * @param value The resource value to identify
 * @param index The positional index used as fallback blank node label
 * @param id The identifier property key, or `undefined` if no identifier is declared
 *
 * @returns The absolute IRI identifier or a blank node label
 */
function key(value: unknown, index: number, id: undefined | string) {

	const iri = id !== undefined && isObject(value) ? value[id] : undefined;

	return isReference(iri) ? `<${iri}>` : `[${index}]`;

}
