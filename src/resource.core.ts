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
 * Resource shape operators.
 *
 * @module
 */

import { type Identifier, isArray, isBoolean, isIdentifier, isNumber, isObject, isString } from "@metreeca/core";
import { immutable, seal } from "@metreeca/core/deep";
import { message } from "@metreeca/core/report";
import { type IRI } from "@metreeca/core/resource";
import { defaultBase, type Reference } from "@metreeca/qest";
import { type Resource } from "@metreeca/qest/resource";
import { type Binding, decodeProbe, isAggregate, type Probe } from "@metreeca/qest/template";
import { collect, normalise, TraceError, wrap } from "./index.core.js";
import type { Trace } from "./index.js";
import {
	validateArrayLocale,
	validateArrayLocalised,
	validateLocalised,
	validateScalarLocale,
	validateScalarLocalised
} from "./localised.core.js";
import { isReference } from "./reference.core.js";
import type { Property, ResourceShape } from "./resource.js";
import { materialize, mergeValues, validateArrayUnion, validateScalarUnion, validateValue } from "./value.core.js";
import type { SetShape, UnionShape, ValueShape, ValuesShape } from "./value.js";
import { apply } from "./value.js";


/**
 * Sealing symbol for flattened resource shapes.
 *
 * Set by {@link flatten} to skip redundant re-flattening of already-flattened shapes.
 */
const Flattened = Symbol("Flattened");

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
 * Checks internal consistency of resource shape constraints.
 *
 * @param constraints The constraint fields to check
 *
 * @returns A keyed trace of violations, or `undefined` if all constraints are consistent
 */
export function checkResource({

	in: allowed,
	hasValue

}: {

	readonly in?: readonly string[];
	readonly hasValue?: readonly string[];

}): undefined | Trace {

	return collect({

		"{hasValue/in}": hasValue === undefined || allowed === undefined
			|| hasValue.every(v => allowed.includes(v))
			|| `required values <${hasValue?.filter(v => !allowed.includes(v))}> not in allowed set`

	});

}

/**
 * Checks for conflicting inherit-strategy fields across sibling parents.
 *
 * Inherit fields (`virtual`, `namespace` on resources; `hidden`, `computed` on properties) require all sibling
 * parents to agree on the value. When any two flattened parents define different values (including `undefined` vs
 * defined) and the child shape does not provide an override, a trace entry is produced.
 *
 * Namespaces are compared by resolved IRI (function call result) rather than by reference, so two distinct
 * `createNamespace` calls producing the same IRI are considered equal.
 *
 * @param shape The child shape being flattened
 * @param parents The flattened sibling parent shapes
 *
 * @returns A keyed trace of violations, or `undefined` if no conflicts exist
 */
export function checkParents(shape: ResourceShape, parents: readonly ResourceShape[]): undefined | Trace {

	return parents.length < 2 ? undefined : collect({

		// resource-level inherit fields

		"{virtual}": shape.virtual !== undefined
			|| parents.every(p => p.virtual === parents[0].virtual)
			|| `conflicting parent values <${parents[0].virtual}> vs <${
				parents.find(p => p.virtual !== parents[0].virtual)?.virtual
			}> without child override`,

		"{namespace}": shape.namespace !== undefined
			|| parents.every(p => p.namespace?.[""] === parents[0].namespace?.[""])
			|| `conflicting parent values <${parents[0].namespace?.[""]}>  vs <${parents.find(p =>
				p.namespace?.[""] !== parents[0].namespace?.[""])?.namespace?.[""]
			}>  without child override`,

		// property-level inherit fields

		...Object.fromEntries([...new Set(parents.flatMap(p => Object.keys(p.properties)))]

			// skip properties defined by a single parent: no conflict possible

			.filter(key => parents.filter(p => p.properties[key]?.kind === "property").length > 1)

			.flatMap(key => {

				const override = shape.properties[key]?.kind === "property" ? shape.properties[key] : undefined;
				const inherited = parents.map(p => p.properties[key]).filter(e => e?.kind === "property");

				return [

					[`{${key}.hidden}`, inherited.every(p => p.hidden === inherited[0].hidden)
					|| override?.hidden !== undefined
					|| `conflicting parent values <${inherited[0].hidden}> vs <${
						inherited.find(p => p.hidden !== inherited[0].hidden)?.hidden
					}> without child override`],

					[`{${key}.computed}`, inherited.every(p => p.computed === inherited[0].computed)
					|| override?.computed !== undefined
					|| `conflicting parent values <${inherited[0].computed}> vs <${
						inherited.find(p => p.computed !== inherited[0].computed)?.computed
					}> without child override`]

				];

			})
		)

	});

}

/**
 * Checks that at most one `id` entry and at most one `type` entry exist across all properties.
 *
 * This check applies to the full set of properties after inheritance merging, ensuring that
 * singleton entries are not duplicated across the inheritance hierarchy.
 *
 * @param properties The merged property entries to check
 *
 * @returns A keyed trace of violations, or `undefined` if no duplicates exist
 */
export function checkSingletons(properties: readonly { readonly kind: string }[]): undefined | Trace {

	return collect({

		"{id}": properties.filter(p => p.kind === "id").length <= 1
			|| `duplicate entry (<${properties.filter(p => p.kind === "id").length}> found)`,

		"{type}": properties.filter(p => p.kind === "type").length <= 1
			|| `duplicate entry (<${properties.filter(p => p.kind === "type").length}> found)`

	});

}

/**
 * Checks that embedded resource shapes do not include `id` or `type` entries.
 *
 * Embedded resources are anonymous nested objects with no independent identity. Including `id` or `type`
 * entries in an embedded shape is semantically invalid because those markers imply standalone resource identity.
 *
 * Inspects each property's range shape, including union variants, for directly embedded `ResourceShape` values
 * containing `id` or `type` entries.
 *
 * @param properties The property entries to check
 *
 * @returns A keyed trace of violations, or `undefined` if no embedded shapes contain `id` or `type` entries
 */
export function checkEmbeddings(properties: ResourceShape["properties"]): undefined | Trace {

	return collect(Object.fromEntries(Object.entries(properties)

		.filter((e): e is [string, Property] => e[1].kind === "property")

		.flatMap(([name, { range }]) => {

			const shapes = range.shape.kind === "union"
				? Object.values(range.shape.variants)
				: [range.shape];

			return shapes
				.filter((s): s is ResourceShape => s.kind === "resource")
				.flatMap(s => Object.values(s.properties))
				.filter(entry => entry.kind === "id" || entry.kind === "type")
				.map(entry => [`{${name}}`, `unexpected <${entry.kind}> entry in embedded resource`]);

		})
	));

}

/**
 * Checks for duplicate predicate IRIs across properties in a flattened resource shape.
 *
 * Forward and reverse predicates are checked independently: the same IRI may appear in both sets without conflict,
 * but no two properties may share the same forward IRI, and no two may share the same reverse IRI.
 *
 * @param shape The flattened resource shape to check
 *
 * @returns A keyed trace of violations, or `undefined` if no duplicates exist
 */
export function checkPredicates(shape: ResourceShape): undefined | Trace {

	const properties = Object.entries(shape.properties)
		.filter((e): e is [string, Property] => e[1].kind === "property");


	function duplicates(field: "forward" | "reverse"): Record<string, string> {

		return Object.fromEntries(properties

			.filter(([, p]) => p[field] !== undefined)

			.reduce<{ seen: Map<string, string>; errors: [string, string][] }>(({ seen, errors }, [key, p]) => {

				const iri = p[field] as string;
				const existing = seen.get(iri);

				const message = `duplicate predicate <${iri}> already used by <${existing}>`;

				return existing === undefined
					? { seen: new Map([...seen, [iri, key]]), errors }
					: { seen, errors: [...errors, [`{${key}.${field}}`, message]] };

			}, {

				seen: new Map(),
				errors: []

			})

			.errors
		);

	}

	return collect({

		...duplicates("forward"),
		...duplicates("reverse")

	});

}


/**
 * Validates complete resource states against a {@link ResourceShape}.
 *
 * Checks resource-level constraints (pattern, in, hasValue), property cardinality and value constraints, closed shape
 * enforcement, custom validators, and inherited properties. Unknown properties are rejected. Returns
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


	// resolve the identifier property key

	const identifier = Object.entries(shape.properties)
		.find(([, entry]) => entry.kind === "id")
		?.[0];

	// collect entries

	const entries = new Map(Object.entries(shape.properties));

	// collect validators

	const validators = shape.validators ?? [];


	return collect({

		"{kind}": mistyped === 0
			|| `expected <${shape.kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		...Object.fromEntries(matching.map((resource, index) => [key(resource, index, identifier),

			collect(Object.fromEntries([

				// property validation — validate merged shape properties

				...[...entries].map(([name, entry]) => [name,
					entry.kind === "id" ? validateId(resource[name], shape)
						: entry.kind === "type" ? validateType(resource[name])
							: validateProperty(resource[name], name, shape)
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


	function validateId(value: unknown, shape: ResourceShape): undefined | Trace {

		const patterns = shape.pattern !== undefined ? [shape.pattern] : [];
		const allowed = shape.in !== undefined ? [shape.in] : [];
		const required = shape.hasValue !== undefined ? [shape.hasValue] : [];

		return value === undefined ? undefined : collect({

			// format validation

			"{kind}": Array.isArray(value) ? "expected single value"
				: !isReference(value) ? "expected absolute IRI"
					: undefined,

			// constraint validation (conjunctive across inheritance lineage)

			...Object.fromEntries([

				...patterns.map((pattern, i) => [patterns.length > 1 ? `{pattern}[${i}]` : "{pattern}",
					isReference(value) && match(value, pattern) || `expected IRI matching pattern <${pattern}>`
				]),

				...allowed.map((items, i) => [allowed.length > 1 ? `{in}[${i}]` : "{in}",
					isReference(value) && items.includes(value) || `expected values in [${items.join(", ")}]`
				]),

				...required.map((items, i) => [required.length > 1 ? `{hasValue}[${i}]` : "{hasValue}",
					isReference(value) && items.includes(value) || `expected values to include [${items.join(", ")}]`
				])

			])

		});

	}

	function validateType(value: unknown): undefined | Trace {

		return value === undefined ? undefined : collect({

			"{kind}": Array.isArray(value) ? "expected single value"
				: !isReference(value) ? "expected absolute IRI"
					: undefined

		});

	}

	function validateProperty(value: unknown, name: Identifier, shape: ResourceShape): undefined | Trace {

		const entry = shape.properties[name];

		return entry?.kind !== "property" ? undefined : collect(Object.fromEntries(
			Object.entries(validateValues(value, entry.range) ?? {})
		));

	}

	function validateValues(value: unknown, {

		minCount,
		maxCount,

		shape

	}: SetShape): undefined | Trace {

		if ( shape.kind === "localised" ) {

			const values = value === undefined ? [] : [value];

			const structural = maxCount === 1
				? validateScalarLocalised(values, shape)
				: validateArrayLocalised(values, shape);

			if ( structural !== undefined ) {

				return structural;

			} else if ( value === undefined ) {

				return minCount !== undefined && minCount >= 1
					? collect({ "{minCount}": `expected at least one language tag` })
					: undefined;

			} else {

				const entries = isString(value) ? [["und", value] as [string, unknown]]
					: isArray(value) ? [["und", value] as [string, unknown]]
						: Object.entries(value as Record<string, unknown>);

				if ( entries.length === 0 && minCount !== undefined && minCount >= 1 ) {

					return collect({ "{minCount}": `expected at least one language tag` });

				} else {

					return collect(Object.fromEntries(entries.map(([tag, tagValue]) => {

						const count = isArray(tagValue) ? tagValue.length : 1;

						return [tag, collect({

							"{minCount}": minCount === undefined || count >= minCount
								|| `expected at least <${minCount}> value(s) for tag`,

							"{maxCount}": maxCount === undefined || count <= maxCount
								|| `expected at most <${maxCount}> value(s) for tag`

						})];

					})));

				}
			}

		} else {

			const isScalar = maxCount === 1;

			const values = value === undefined ? []
				: !isArray(value) ? [value]
					: value;

			const structural = shape.kind === "union"

				? isScalar
					? validateScalarUnion(values, shape)
					: validateArrayUnion(values, shape)

				: isScalar

					? isArray(value)
						? collect({ "{kind}": "expected scalar value" })
						: validateValue(values, shape)

					: value !== undefined && !isArray(value)
						? collect({ "{kind}": "expected array value" })
						: validateValue(values, shape);

			if ( structural ) {

				return structural;

			} else {

				const count = cardinality(value);

				return collect({

					"{minCount}": minCount === undefined || count >= minCount
						|| `expected at least <${minCount}> value(s)`,

					"{maxCount}": maxCount === undefined || count <= maxCount
						|| `expected at most <${maxCount}> value(s)`

				});

			}


			function cardinality(value: unknown): number {

				if ( value === undefined ) {

					return 0;

				} else if ( shape.kind !== "union" ) {

					return isArray(value) ? value.length : 1;

				} else if ( isObject(value) ) {

					return Object.values(value).reduce<number>(
						(total, value) => total+(isArray(value) ? value.length : 1),
						0
					);

				} else {

					return 1;

				}

			}

		}

	}

}

/**
 * Validates retrieval {@link Template | templates} against a {@link ResourceShape}.
 *
 * Verifies that each template is structurally compatible with the shape: property types (scalar vs singleton tuple),
 * inherited properties, and value type-checking. Only plain {@link Identifier} keys are accepted at the top level;
 * computed values, filtering constraints, sorting criteria, and pagination limits are restricted to singleton template
 * tuples inside collection properties, where full {@link Query} keys are permitted. Value constraints, cardinality
 * bounds, and custom validators are skipped, as a template describes a retrieval projection rather than actual data.
 * Unknown properties are silently ignored and missing properties are accepted as not requested.
 *
 * Where a property specifies a resource (either directly or via a reference), the template value may be either a
 * {@link Reference} (retrieving just the identifier) or a nested template, optionally subject to `depth` limits.
 * When `plain` is enabled, aggregate transforms in {@link Probe} pipes are rejected.
 *
 * @param values The template instances to validate
 * @param shape The resource shape defining the expected structure
 * @param opts Validation options
 * @param opts.plain Whether to reject aggregate transforms in probe pipes; `true` rejects them;
 *     defaults to `false`
 * @param opts.depth Maximum nesting depth for reference and embedded resource expansion; `0` rejects any nested
 *     template while still accepting IRI references; defaults to unlimited
 *
 * @returns A keyed trace of constraint violations per property, or `undefined` if all templates are valid
 */
export function validateTemplate(values: readonly unknown[], shape: ResourceShape, {

	plain,
	depth

}: {

	readonly plain?: boolean
	readonly depth?: number

}): undefined | Trace {

	const matching = values.filter(value => isObject(value));
	const mistyped = values.length-matching.length;

	// resolve the identifier property key

	const identifier = Object.entries(shape.properties)
		.find(([, entry]) => entry.kind === "id")
		?.[0];


	return collect({

		"{kind}": mistyped === 0
			|| `expected <${shape.kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		...Object.fromEntries(matching.map((template, index) =>
			[key(template, index, identifier), validateTemplate(template, shape, depth)]
		))

	});


	function validateTemplate(query: Record<Identifier, unknown>, shape: ResourceShape, depth: number | undefined): undefined | Trace {

		return collect(Object.fromEntries(Object.entries(query).map(([key, value]) => {

			if ( isIdentifier(key) ) {

				return [key, validatePlaceholders(value, apply({
					target: key, pipe: [], path: [key]
				}, shape), depth)];

			} else {

				return [key, "expected property identifier"];

			}

		})));

	}

	function validateQuery(query: Record<Binding, unknown>, shape: ResourceShape, depth: number | undefined): undefined | Trace {

		return collect(Object.fromEntries(Object.entries(query).map(([key, value]) => {

			try {

				const probe = decodeProbe(key);

				if ( plain && probe.pipe.some(isAggregate) ) {

					return [key, "disabled aggregate transforms"];

				} else {

					switch ( probe.target ) {

						case "<":
						case ">":
						case "<=":
						case ">=":

							return [key, validateLimit(value, apply(probe, shape)?.shape)];

						case "~":

							return [key, validateKeywords(value, apply(probe, shape)?.shape)];

						case "?":
						case "!":
						case "*":

							return [key, validateOptions(value, apply(probe, shape)?.shape)];

						case "^":

							return [key, value === "asc" || value === "desc" || isNumber(value) ? undefined
								: "expected <asc>, <desc>, or number value"
							];

						case "@":
						case "#":

							return [key, !isNumber(value) ? "expected number value"
								: !Number.isInteger(value) || value < 0 ? "expected non-negative integer"
									: undefined
							];

						default:

							return [key, validatePlaceholders(value, apply(probe, shape), depth)];

					}

				}

			} catch ( e ) {

				return [key, message(e)];

			}

		})));

	}


	function validatePlaceholders(value: unknown, range: undefined | SetShape, depth: number | undefined): Trace | undefined {

		if ( range === undefined ) {

			return undefined; // undefined range means binding cannot be populated at runtime: template is immaterial

		} else {

			const { maxCount, shape } = range;

			if ( shape.kind === "union" ) {

				return Object.values(shape.variants)
					.some(variant => validatePlaceholders(value, { ...range, shape: variant }, depth) === undefined)
					? undefined : "expected value matching at least a union variant";

			} else if ( shape.kind === "localised" ) {

				return collect(wrap(maxCount === 1
					? validateScalarLocale(value)
					: validateArrayLocale(value)
				));

			} else if ( maxCount === 1 ) {

				return collect(!Array.isArray(value)
					? wrap(validatePlaceholder(value, shape, depth))
					: { "{kind}": "expected scalar placeholder" }
				);

			} else if ( shape.kind === "reference" ) {

				return collect(Array.isArray(value) && value.length === 1
					? wrap(isString(value[0]) ? (isReference(value[0]) ? undefined : "expected absolute reference IRI")
						: depth !== undefined && depth <= 0 ? "exceeded maximum nesting depth"
							: !isObject(value[0]) ? "expected query"
								: validateQuery(value[0], materialize(shape.shape), depth === undefined ? depth : depth-1))
					: { "{kind}": "expected singleton query tuple" }
				);

			} else if ( shape.kind === "resource" ) {

				return collect(Array.isArray(value) && value.length === 1
					? wrap(depth !== undefined && depth <= 0 ? "exceeded maximum nesting depth"
						: !isObject(value[0]) ? "expected query"
							: validateQuery(value[0], shape, depth === undefined ? depth : depth-1))
					: { "{kind}": "expected singleton query tuple" }
				);

			} else {

				return collect(Array.isArray(value) && value.length === 1
					? wrap(validatePlaceholder(value[0], shape, depth))
					: { "{kind}": "expected singleton placeholder tuple" }
				);

			}

		}

	}

	function validatePlaceholder(value: unknown, shape: ValueShape, depth: number | undefined): undefined | Trace {

		switch ( shape.kind ) {

			case "boolean":

				return isBoolean(value) ? undefined : `expected <${shape.kind}> value`;

			case "number":

				return isNumber(value) ? undefined : `expected <${shape.kind}> value`;

			case "string":

				return isString(value) ? undefined : `expected <${shape.kind}> value`;

			case "reference":

				return isString(value) ? (isReference(value) ? undefined : "expected absolute reference IRI")
					: depth !== undefined && depth <= 0 ? "exceeded maximum nesting depth"
						: !isObject(value) ? "expected template"
							: validateTemplate(value, materialize(shape.shape), depth === undefined ? depth : depth-1);

			case "resource":

				return depth !== undefined && depth <= 0 ? "exceeded maximum nesting depth"
					: !isObject(value) ? "expected template"
						: validateTemplate(value, shape, depth === undefined ? depth : depth-1);

		}

	}


	function validateLimit(value: unknown, shape: undefined | ValuesShape | UnionShape): undefined | Trace {

		if ( shape === undefined ) {

			return undefined; // undefined shape means binding cannot be populated at runtime: template is immaterial

		} else {

			switch ( shape.kind ) {

				case "boolean":

					return isBoolean(value) ? undefined : `expected <${shape.kind}> value`;

				case "number":

					return isNumber(value) ? undefined : `expected <${shape.kind}> value`;

				case "string":

					return isString(value) ? undefined : `expected <${shape.kind}> value`;

				case "localised":
				case "reference":
				case "resource":

					return `unsupported constraint for <${shape.kind}> value`;

				case "union":

					return Object.values(shape.variants)
						.some(variant => validateLimit(value, variant) === undefined)
						? undefined : "expected limit matching at least a union variant";

			}

		}

	}

	function validateKeywords(value: unknown, shape: undefined | ValuesShape | UnionShape): undefined | Trace {

		if ( shape === undefined ) {

			return undefined; // undefined shape means binding cannot be populated at runtime: template is immaterial

		} else {

			switch ( shape.kind ) {

				case "string":
				case "localised":

					return isString(value) ? undefined : "expected string value";

				case "boolean":
				case "number":
				case "reference":
				case "resource":

					return `unsupported constraint for <${shape.kind}> value`;

				case "union":

					return Object.values(shape.variants)
						.some(variant => validateKeywords(value, variant) === undefined)
						? undefined : "expected keywords matching at least a union variant";

			}

		}

	}

	function validateOptions(value: unknown, shape: undefined | ValuesShape | UnionShape): undefined | Trace {

		if ( shape === undefined ) {

			return undefined; // undefined shape means binding cannot be populated at runtime: template is immaterial

		} else if ( shape.kind === "union" ) {

			return Object.values(shape.variants)
				.some(variant => validateOptions(value, variant) === undefined)
				? undefined : "expected options matching at least a union variant";

		} else if ( shape.kind === "localised" ) {

			return validateLocalised([value], shape);

		} else if ( Array.isArray(value) ) {

			return collect(Object.fromEntries(value.map((element, index) =>
				[`[${index}]`, validateOption(element, shape)]
			)));

		} else {

			return validateOption(value, shape);

		}

	}

	function validateOption(value: unknown, shape: ValueShape): undefined | Trace {

		if ( value === null ) {

			return undefined; // null is a valid option for any value type

		} else {

			switch ( shape.kind ) {

				case "boolean":

					return isBoolean(value) ? undefined : `expected <${shape.kind}> value`;

				case "number":

					return isNumber(value) ? undefined : `expected <${shape.kind}> value`;

				case "string":

					return isString(value) ? undefined : `expected <${shape.kind}> value`;

				case "reference":
				case "resource":

					return isReference(value) ? undefined : `expected <${shape.kind}> value`;

			}

		}

	}

}


/**
 * Merges an overriding resource shape with an inherited base shape.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns The merged shape with combined constraints
 *
 * @throws {TraceError} On incompatible overrides
 */
export function mergeResource(target: ResourceShape, source: ResourceShape): ResourceShape {

	// conjunctive: classes — union of parent class and own/parent classes

	const classes: readonly IRI[] = [...new Set([
		...source.class !== undefined ? [source.class] : [],
		...source.classes ?? [],
		...target.classes ?? []
	])];

	// conjunctive: in — intersection

	const allowed = target.in !== undefined && source.in !== undefined
		? target.in.filter(v => source.in!.includes(v))
		: target.in ?? source.in;

	// conjunctive: hasValue — union

	const hasValue = target.hasValue !== undefined && source.hasValue !== undefined
		? [...new Set([...target.hasValue, ...source.hasValue])]
		: target.hasValue ?? source.hasValue;

	// conjunctive: validators — union (deduplicated)

	const validators = target.validators !== undefined && source.validators !== undefined
		? [...new Set([...target.validators, ...source.validators])]
		: target.validators ?? source.validators;

	// conjunctive: properties — union with per-key merge

	const keys = [...new Set([

		...Object.keys(target.properties),
		...Object.keys(source.properties)

	])];

	const properties = Object.fromEntries(keys.map(key => {

		const t = target.properties[key];
		const s = source.properties[key];

		if ( t === undefined || s === undefined ) {

			return [key, t ?? s];

		} else if ( t.kind === "property" && s.kind === "property" ) {

			return [key, mergeProperty(t, s)];

		} else {

			return [key, t]; // immutable (id/type) or validated below

		}

	}));

	// validate

	const trace = collect({

		// conjunctive: pattern — IRI pattern compatibility

		"{pattern}": target.pattern === undefined || source.pattern === undefined
			|| narrows(target.pattern, source.pattern)
			|| `incompatible IRI templates <${target.pattern}> and <${source.pattern}>`,

		// conjunctive: in — empty intersection

		"{in}": target.in === undefined || source.in === undefined
			|| allowed!.length !== 0
			|| `disjoint sets [${target.in}] and [${source.in}]`,

		// conjunctive: properties — kind mismatches

		...Object.fromEntries(keys
			.filter(key => !(
				target.properties[key] === undefined || source.properties[key] === undefined
				|| target.properties[key].kind === source.properties[key].kind
			))
			.map(key => [`{${key}}`,
				`mismatched entry kinds <${target.properties[key].kind}> vs <${source.properties[key].kind}>`
			])
		),

		// post-merge constraint consistency

		...wrap(checkResource({

			in: allowed,
			hasValue

		}))

	});

	if ( trace !== undefined ) {
		throw new TraceError("incompatible resource shape override", trace);
	}

	// build shape — casts are safe: non-emptiness validated above

	return immutable({

		kind: target.kind,

		model: {

			...source.model,

			...Object.fromEntries(Object.entries(properties).map(([name, entry]) => [name,
				entry.kind === "id" || entry.kind === "type" ? defaultBase : entry.range.model
			]))

		} as Resource,

		virtual: target.virtual ?? source.virtual,

		name: target.name,
		description: target.description,

		namespace: target.namespace ?? source.namespace,
		extends: target.extends,

		class: target.class,
		classes: classes as ResourceShape["classes"],

		pattern: target.pattern ?? source.pattern,

		in: allowed as ResourceShape["in"],
		hasValue: hasValue as ResourceShape["hasValue"],
		validators: validators as ResourceShape["validators"],

		properties

	});


	/**
	 * Checks whether a target IRI pattern narrows a source pattern.
	 *
	 * Only trailing `/*` wildcards admit narrowing: the target may replace `/*` with more specific segments,
	 * provided the fixed prefix matches. All other cases require exact equality.
	 *
	 * @param target The overriding child pattern
	 * @param source The inherited parent pattern
	 *
	 * @returns `true` if the target narrows or equals the source
	 */
	function narrows(target: string, source: string): boolean {

		return target === source ? true
			: source.endsWith("/*") ? target.startsWith(source.slice(0, -1))
				: false;

	}

}

/**
 * Merges an overriding property with an inherited base property.
 *
 * Delegates range merge to {@link mergeValues}. Inheritable fields (`hidden`, `computed`) fall back
 * to the source value when the target doesn't define them. Immutable fields (`name`, `description`,
 * `forward`, `reverse`) are preserved from the target.
 *
 * @param target The overriding child property
 * @param source The inherited parent property
 *
 * @returns The merged property
 *
 * @throws {TraceError} On incompatible overrides
 */
export function mergeProperty(target: Property, source: Property): Property {

	return immutable({

		kind: target.kind,

		...target.hidden !== undefined ? { hidden: target.hidden }
			: source.hidden !== undefined ? { hidden: source.hidden }
				: {},

		...target.computed !== undefined ? { computed: target.computed }
			: source.computed !== undefined ? { computed: source.computed }
				: {},

		name: target.name,
		description: target.description,

		...target.forward !== undefined ? { forward: target.forward }
			: source.forward !== undefined ? { forward: source.forward }
				: {},

		...target.reverse !== undefined ? { reverse: target.reverse }
			: source.reverse !== undefined ? { reverse: source.reverse }
				: {},

		range: mergeValues(target.range, source.range)

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Flattens a resource shape's inheritance lineage into a single shape.
 *
 * Walks the inheritance chain and progressively merges each parent into the result using {@link mergeResource},
 * producing a shape with all inherited constraints resolved. Fields outside merge scope (`class`, `extends`) and
 * immutable fields (`kind`, `name`, `description`) are preserved from the input shape.
 *
 * > [!NOTE]
 * > This function is idempotent: flattened shapes are sealed and won't be re-flattened when flattened again.
 *
 * @param shape The resource shape to flatten
 *
 * @returns A new resource shape with all inherited constraints merged; `extends` preserved for reference
 *
 * @throws {TraceError} If the shape is malformed
 */
export function flatten(shape: ResourceShape): ResourceShape {

	if ( seal(shape, Flattened) === null ) { return shape; } else {

		const parents = [shape.extends ?? []].flat().map(p => materialize(p));

		const merged = mergeResource(shape, parents.reduce(mergeResource, {

			kind: "resource",
			model: {},

			properties: {}

		}));

		const trace = collect({

			...wrap(checkParents(shape, parents)),
			...wrap(checkSingletons(Object.values(merged.properties))),
			...wrap(checkEmbeddings(merged.properties)),
			...wrap(checkPredicates(merged))

		});

		if ( trace !== undefined ) {
			throw new TraceError("incompatible flattened shape", trace);
		}

		// recursively flatten nested resource shapes within property ranges

		const properties = Object.fromEntries(Object.entries(merged.properties).map(([name, entry]) => {

			if ( entry.kind === "property" ) {

				const { range } = entry;
				const { shape: inner } = range;

				switch ( inner.kind ) {

					case "resource":

						return [name, { ...entry, range: { ...range, shape: flatten(inner) } }];

					case "reference":

						return [name, {
							...entry,
							range: { ...range, shape: { ...inner, shape: () => materialize(inner.shape) } }
						}];

					case "union":

						return [name, {
							...entry, range: {
								...range,
								shape: {
									...inner,
									variants: Object.fromEntries(Object.entries(inner.variants).map(([key, variant]) =>
										[key, variant.kind === "resource" ? flatten(variant) : variant]
									))
								}
							}
						}];

					default:

						return [name, entry];

				}

			} else {

				return [name, entry];

			}

		}));

		return seal({ ...merged, properties }, Flattened, null);

	}

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
