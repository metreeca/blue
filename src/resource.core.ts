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

import { type Identifier, isArray, isBoolean, isNumber, isObject, isString } from "@metreeca/core";
import { message } from "@metreeca/core/error";
import { isTagRange } from "@metreeca/core/language";
import { immutable } from "@metreeca/core/nested";
import { type IRI, isIRI } from "@metreeca/core/resource";
import { defaultBase } from "@metreeca/qest/index";
import { decodeProbe, isAggregate, type Probe } from "@metreeca/qest/model";
import { type Reference, type Resource } from "@metreeca/qest/state";
import type { BooleanShape } from "./boolean.js";
import { brand, branded } from "./core/brand.js";
import { collect, every, group, normalise, TraceError, wrap } from "./core/trace.js";
import { mergeValue, validateValue } from "./index.core.js";
import { inspect, materialize, type Trace, type ValueShape } from "./index.js";
import type { LocalShape, LocalsShape } from "./local.js";
import type { NumberShape } from "./number.js";
import { type Property, type Range, type ReferenceShape, type ResourceShape, type UnionShape } from "./resource.js";
import type { StringShape } from "./string.js";


/**
 * Brand symbol for flattened resource shapes.
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
 * Validates values against a {@link ReferenceShape}.
 *
 * Filters input values by type, reporting non-reference values under the `kind` key, then enforces
 * reference constraints on matched values.
 */
export function validateReference(values: readonly unknown[], shape: ReferenceShape): undefined | Trace {

	const matching = values.filter(isReference);
	const mistyped = values.length-matching.length;

	const flattened = flatten(materialize(shape.shape));

	const patterns = flattened.pattern !== undefined ? [flattened.pattern] : [];
	const allowed = flattened.in !== undefined ? [flattened.in] : [];
	const required = flattened.hasValue !== undefined ? [flattened.hasValue] : [];

	return collect({

		"{kind}": mistyped === 0
			|| `expected <${shape.kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		...Object.fromEntries([

			...patterns.map((pattern, i) => [patterns.length > 1 ? `{pattern}[${i}]` : "{pattern}",
				every(matching, value => match(value, pattern) || `expected IRI matching pattern <${pattern}>`)
			]),

			...allowed.map((items, i) => [allowed.length > 1 ? `{in}[${i}]` : "{in}",
				every(matching, value => items.includes(value) || `expected values in [${items.join(", ")}]`)
			]),

			...required.map((items, i) => [required.length > 1 ? `{hasValue}[${i}]` : "{hasValue}",
				group(matching, group => items.every(v => group.includes(v)) || `expected values to include [${items.join(", ")}]`)
			])

		])

	});

}

/**
 * Merges an overriding reference shape with an inherited base shape.
 *
 * All fields are immutable — only model strict equality is checked.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns The merged shape with combined constraints
 *
 * @throws {TraceError} On incompatible overrides
 */
export function mergeReference(target: ReferenceShape, source: ReferenceShape): ReferenceShape {

	const trace = collect({

		// structural: model must be strictly equal

		"{model}": target.model === source.model
			|| `mismatched types <${target.model}> and <${source.model}>`

	});

	if ( trace !== undefined ) {
		throw new TraceError("incompatible reference shape override", trace);
	}

	return immutable({

		kind: target.kind,
		model: target.model,

		...target.backlink !== undefined && { backlink: target.backlink },

		shape: target.shape

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

	const flattened = flatten(shape);


	// resolve the identifier property key

	const identifier = Object.entries(flattened.properties)
		.find(([, entry]) => entry.kind === "id")
		?.[0];

	// collect properties

	const entries = new Map(Object.entries(flattened.properties));

	// collect validators

	const validators = flattened.validators ?? [];


	return collect({

		"{kind}": mistyped === 0
			|| `expected <${shape.kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		...Object.fromEntries(matching.map((resource, index) => [key(resource, index, identifier),

			collect(Object.fromEntries([

				// property validation — validate merged shape properties

				...[...entries].map(([name, entry]) => [name,
					entry.kind === "id" ? validateId(resource[name], flattened)
						: entry.kind === "type" ? validateType(resource[name])
							: validateProperty(resource[name], name, flattened)
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

		return collect({

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
			Object.entries(validateRange(value, entry.range) ?? {})
		));

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

			return collect({

				"{kind}": "expected scalar value"

			});

		} else if ( !isScalar && value !== undefined && !isArray(value) ) {

			return collect({

				"{kind}": "expected array value"

			});

		} else {

			return collect({

				"{minCount}": minCount === undefined || values.length >= minCount
					|| `expected at least <${minCount}> value(s)`,

				"{maxCount}": maxCount === undefined || values.length <= maxCount
					|| `expected at most <${maxCount}> value(s)`,

				...wrap(shape.kind === "union"
					? validateUnion(values, shape)
					: validateValue(values, shape)
				)

			});

		}

	}

	function validateUnion(values: readonly unknown[], union: UnionShape): undefined | Trace {

		const variants = Object.values(union.variants);

		return every(values, v =>
			variants.some(variantShape => validateValue([v], variantShape) === undefined)
			|| "value does not match any union variant"
		);

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
				entry.kind === "id" || entry.kind === "type" ? defaultBase
					: entry.range.maxCount === 1 ? entry.range.shape.model
						: [entry.range.shape.model]
			]))

		},

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
			|| `conflicting parent values <${parents[0].virtual}> vs <${parents.find(p => p.virtual !== parents[0].virtual)?.virtual}> without child override`,

		"{namespace}": shape.namespace !== undefined
			|| parents.every(p => p.namespace?.[""] === parents[0].namespace?.[""])
			|| `conflicting parent values <${parents[0].namespace?.[""]}>  vs <${parents.find(p => p.namespace?.[""] !== parents[0].namespace?.[""])?.namespace?.[""]}>  without child override`,

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
					|| `conflicting parent values <${inherited[0].hidden}> vs <${inherited.find(p => p.hidden !== inherited[0].hidden)?.hidden}> without child override`],

					[`{${key}.computed}`, inherited.every(p => p.computed === inherited[0].computed)
					|| override?.computed !== undefined
					|| `conflicting parent values <${inherited[0].computed}> vs <${inherited.find(p => p.computed !== inherited[0].computed)?.computed}> without child override`]

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
 * Merges an overriding property with an inherited base property.
 *
 * Delegates range merge to {@link mergeRange}. Inheritable fields (`hidden`, `computed`) fall back
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

		range: mergeRange(target.range, source.range)

	});

}

/**
 * Merges an overriding range with an inherited base range.
 *
 * Narrows cardinality bounds and delegates value shape merge to the appropriate shape-specific
 * merge function via {@link mergeValue} or {@link mergeUnion}.
 *
 * @param target The overriding child range
 * @param source The inherited parent range
 *
 * @returns The merged range
 *
 * @throws {TraceError} On incompatible overrides
 */
export function mergeRange(target: Range, source: Range): Range {

	// merged constraints

	const minCount = target.minCount ?? source.minCount;
	const maxCount = target.maxCount ?? source.maxCount;

	// validate

	const trace = collect({

		// narrow: minCount — child >= parent

		"{minCount}": target.minCount === undefined || source.minCount === undefined
			|| target.minCount >= source.minCount
			|| `widened limit <${target.minCount}> beyond <${source.minCount}>`,

		// narrow: maxCount — child <= parent

		"{maxCount}": target.maxCount === undefined || source.maxCount === undefined
			|| target.maxCount <= source.maxCount
			|| `widened limit <${target.maxCount}> beyond <${source.maxCount}>`,

		// structural: shape kind must match

		"{shape}": target.shape.kind === source.shape.kind
			|| `mismatched kinds <${target.shape.kind}> vs <${source.shape.kind}>`,

		// post-merge constraint consistency

		...wrap(checkRange({ minCount, maxCount }))

	});

	if ( trace !== undefined ) {
		throw new TraceError("incompatible range override", trace);
	}

	// build range

	return immutable({

		kind: target.kind,

		minCount,
		maxCount,

		shape: target.shape.kind === "union"
			? mergeUnion(target.shape, source.shape as UnionShape)
			: mergeValue(target.shape as ValueShape, source.shape as ValueShape)

	});

}

/**
 * Merges an overriding union with an inherited base union.
 *
 * Variant keys must match exactly between target and source. Each matched variant is merged
 * using the appropriate value shape merge function.
 *
 * @param target The overriding child union
 * @param source The inherited parent union
 *
 * @returns The merged union
 *
 * @throws {TraceError} On variant key mismatch or incompatible variant overrides
 */
export function mergeUnion(target: UnionShape, source: UnionShape): UnionShape {

	const targetKeys = Object.keys(target.variants).sort();
	const sourceKeys = Object.keys(source.variants).sort();

	if ( targetKeys.join(",") !== sourceKeys.join(",") ) {
		throw new RangeError(`mismatched variant keys [${targetKeys.join(", ")}] and [${sourceKeys.join(", ")}]`);
	}

	const variants = Object.fromEntries(
		targetKeys.map(key => [key, mergeValue(target.variants[key], source.variants[key])])
	);

	return immutable({

		kind: target.kind,

		model: Object.fromEntries(
			Object.entries(variants).map(([key, shape]) => [key, shape.model])
		),

		variants

	});

}

/**
 * Checks internal consistency of range constraints.
 *
 * @param constraints The constraint fields to check
 *
 * @returns A keyed trace of violations, or `undefined` if all constraints are consistent
 */
export function checkRange({

	minCount,
	maxCount

}: {

	readonly minCount?: number;
	readonly maxCount?: number;

}): undefined | Trace {

	return collect({

		"{minCount/maxCount}": minCount === undefined || maxCount === undefined
			|| minCount <= maxCount
			|| `inconsistent bounds <${minCount}> > <${maxCount}>`

	});

}


/**
 * Validates entry identity against a {@link ResourceShape}.
 *
 * Checks whether the shape declares an `id` property and, if so, validates that each value contains an `id` field
 * with a proper absolute IRI, enforcing resource-level `pattern`, `in`, and `hasValue` constraints on the identifier.
 * Returns `undefined` if the shape declares no `id` property or all entries have valid identifiers.
 *
 * @param values The entry instances to validate
 * @param shape The resource shape defining the expected structure
 *
 * @returns A keyed trace of constraint violations per entry, or `undefined` if all entries are valid
 */
export function validateEntry(values: readonly unknown[], shape: ResourceShape): undefined | Trace {

	const matching = values.filter(value => isObject(value));
	const mistyped = values.length-matching.length;

	const flattened = flatten(shape);

	// resolve the identifier property key

	const identifier = Object.entries(flattened.properties)
		.find(([, entry]) => entry.kind === "id")
		?.[0];

	if ( identifier === undefined ) {

		return undefined;

	} else {

		const patterns = flattened.pattern !== undefined ? [flattened.pattern] : [];
		const allowed = flattened.in !== undefined ? [flattened.in] : [];
		const required = flattened.hasValue !== undefined ? [flattened.hasValue] : [];

		return collect({

			"{kind}": mistyped === 0
				|| `expected <${shape.kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

			...Object.fromEntries(matching.map((entry, index) => [key(entry, index, identifier),

				collect({

					[identifier]: validateId(entry[identifier])

				})

			]))

		});


		function validateId(value: unknown): undefined | Trace {

			return collect({

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

					...allowed.map((items, i) => [allowed.length > 1 ? `{in}[${i}]` : "{in}",
						isReference(value) && items.includes(value) || `expected values in [${items.join(", ")}]`
					]),

					...required.map((items, i) => [required.length > 1 ? `{hasValue}[${i}]` : "{hasValue}",
						isReference(value) && items.includes(value) || `expected values to include [${items.join(", ")}]`
					])

				])

			});

		}

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
export function validateModel(values: readonly unknown[], shape: ResourceShape, depth: null | number, stats: boolean = true): undefined | Trace {

	const matching = values.filter(value => isObject(value));
	const mistyped = values.length-matching.length;

	const flattened = flatten(shape);

	// resolve the identifier property key

	const identifier = Object.entries(flattened.properties).find(([, entry]) => entry.kind === "id")?.[0];

	return collect({

		"{kind}": mistyped === 0
			|| `expected <${shape.kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		...Object.fromEntries(matching.map((model, index) => [key(model, index, identifier),

			collect(Object.fromEntries(Object.entries(model).map(([binding, template]) => {

				try {

					return [binding, validateProjection(decodeProbe(binding), template, shape, depth)];

				} catch ( e ) {

					return [binding, message(e)];

				}

			})))

		]))

	});


	function validateProjection(binding: Probe, value: unknown, shape: ValueShape, depth: null | number): undefined | Trace {

		if ( !stats && binding.pipe.some(isAggregate) ) {

			return "aggregate transforms are not enabled";

		} else {

			const effective = inspect(shape, binding);

			// undefined effective range means the binding cannot be populated at runtime; template is immaterial

			return effective === undefined ? undefined : validateRange(value, effective, depth);

		}

	}

	function validateRange(value: unknown, range: Range, depth: null | number): undefined | Trace {

		const { maxCount, shape } = range;

		const isScalar = maxCount === 1;

		if ( isScalar ) {

			return collect(Array.isArray(value)
				? { "{kind}": "expected scalar value" }
				: wrap(validateScalar(value, shape, depth))
			);

		} else {

			return collect(!Array.isArray(value) || value.length !== 1
				? { "{kind}": "expected singleton tuple" }
				: wrap(validateCollection(value[0], shape, depth))
			);

		}

	}

	function validateScalar(value: unknown, shape: ValueShape | UnionShape, depth: null | number): undefined | Trace {

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

	function validateCollection(value: unknown, shape: ValueShape | UnionShape, depth: null | number): undefined | Trace {

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

		return isBoolean(value) ? undefined : `expected <${kind}> value`;

	}

	function validateNumber(value: unknown, { kind }: NumberShape): undefined | Trace {

		return isNumber(value) ? undefined : `expected <${kind}> value`;

	}

	function validateString(value: unknown, { kind }: StringShape): undefined | Trace {

		return isString(value) ? undefined : `expected <${kind}> value`;

	}

	function validateLocale(value: unknown, { kind }: LocalShape): undefined | Trace {

		if ( isString(value) ) {

			return undefined;

		} else if ( isObject(value) ) {

			return collect(Object.fromEntries(Object.entries(value).map(([k, v]) => [k,
				!isTagRange(k) ? "invalid tag range"
					: !isString(v) ? "expected string value"
						: undefined
			])));

		} else {

			return `expected <${kind}> value`;

		}

	}

	function validateLocales(value: unknown, { kind }: LocalsShape): undefined | Trace {

		if ( isArray(value, [isString]) ) {

			return undefined;

		} else if ( isObject(value) ) {

			return collect(Object.fromEntries(Object.entries(value).map(([k, v]) => [k,
				!isTagRange(k) ? "invalid tag range"
					: !isArray(v, [isString]) ? "expected singleton string tuple"
						: undefined
			])));

		} else {

			return `expected <${kind}> value`;

		}

	}

	function validateQuery(value: unknown, shape: ResourceShape, depth: null | number): undefined | Trace {

		return collect(!isObject(value)

			? { "{kind}": "expected query object" }

			: Object.fromEntries(Object.entries(value).map(([key, v]) => {

				try {

					const probe = decodeProbe(key);

					switch ( probe.target ) {

						case "<":
						case ">":
						case "<=":
						case ">=":

							return [key, validateLimit(v, inspect(shape, probe)?.shape)];

						case "~":

							return [key, validateKeywords(v, inspect(shape, probe)?.shape)];

						case "?":
						case "!":
						case "*":

							return [key, validateOptions(v, inspect(shape, probe)?.shape)];

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


	function validateLimit(value: unknown, shape: undefined | ValueShape | UnionShape): undefined | Trace {

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

					return `unsupported constraint for <${shape.kind}> value`;

				case "union":

					return Object.values(shape.variants)
						.some(variant => validateLimit(value, variant) === undefined)
						? undefined : "limit does not match any union variant";

			}

		}

	}

	function validateKeywords(value: unknown, shape: ValueShape | UnionShape | undefined): undefined | Trace {

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

					return `unsupported constraint for <${shape.kind}> value`;

				case "union":

					return Object.values(shape.variants)
						.some(variant => validateKeywords(value, variant) === undefined)
						? undefined : "keywords do not match any union variant";

			}

		}

	}

	function validateOptions(value: unknown, shape: undefined | ValueShape | UnionShape): undefined | Trace {

		// undefined shape means the constraint cannot be evaluated at runtime; value is immaterial

		if ( shape === undefined ) {

			return undefined;

		} else if ( Array.isArray(value) ) {

			return collect(Object.fromEntries(value.map((element, index) =>
				[`[${index}]`, validateOption(element, shape)]
			)));

		} else {

			return validateOption(value, shape);

		}

	}

	function validateOption(value: unknown, shape: ValueShape | UnionShape): undefined | Trace {

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

					return isReference(value) ? undefined : `expected <${shape.kind}> value`;

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
 * Flattens a resource shape's inheritance lineage into a single shape.
 *
 * Walks the inheritance chain and progressively merges each parent into the result using {@link mergeResource},
 * producing a shape with all inherited constraints resolved. Fields outside merge scope (`class`, `extends`) and
 * immutable fields (`kind`, `name`, `description`) are preserved from the input shape.
 *
 * > [!NOTE]
 * > This function is idempotent: flattened shapes are branded and won't be re-flattened when flattened again.
 *
 * @param shape The resource shape to flatten
 *
 * @returns A new resource shape with all inherited constraints merged; `extends` preserved for reference
 *
 * @throws {TraceError} On incompatible overrides in the inheritance chain
 */
export function flatten(shape: ResourceShape): ResourceShape {

	if ( branded(shape, Flattened) !== undefined ) { return shape; } else {

		const parents = shape.extends === undefined ? []
			: Array.isArray(shape.extends) ? shape.extends.map(p => flatten(materialize(p)))
				: [flatten(materialize(shape.extends as ResourceShape))];

		const flattened = mergeResource(shape, parents.reduce(mergeResource, {

			kind: "resource",
			model: {},

			properties: {}

		}));

		const trace = collect({

			...wrap(checkParents(shape, parents)),
			...wrap(checkSingletons(Object.values(flattened.properties))),
			...wrap(checkPredicates(flattened))

		});

		if ( trace !== undefined ) {
			throw new TraceError("incompatible flattened shape", trace);
		}

		return brand(flattened, { [Flattened]: null });

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
 * Checks if a value is a {@link Reference}.
 *
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
