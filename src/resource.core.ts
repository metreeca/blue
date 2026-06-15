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

import { isArray, isBoolean, isIdentifier, isNumber, isObject, isString } from "@metreeca/core";
import { equals, immutable, seal } from "@metreeca/core/deep";
import { isTagRange, matchTag } from "@metreeca/core/language";
import { message } from "@metreeca/core/report";
import { type IRI, isIRI } from "@metreeca/core/resource";
import { defaultBase, isReference, type Reference } from "@metreeca/qest";
import { type Resource } from "@metreeca/qest/resource";
import {
	type Binding,
	decodeProbe,
	isAggregate,
	isBinding,
	isSelector,
	isUnion,
	isUnionIndex,
	type Locale,
	type Model,
	type Placeholder,
	type Placeholders,
	type Probe,
	type Projection,
	type Query,
	type Selection,
	type Template,
	type Union
} from "@metreeca/qest/template";
import { collect, normalise, TraceError, wrap } from "./index.core.js";
import type { Trace } from "./index.js";
import { validateReferences } from "./reference.core.js";
import type { ReferenceShape } from "./reference.js";
import type { Property, ResourceShape } from "./resource.js";
import {
	validateLocaleString,
	validateLocaleStrings,
	validateText,
	validateTextString,
	validateTextStrings
} from "./text.core.js";
import type { TextShape } from "./text.js";
import { mergeValues, validateUnion, validateValue } from "./value.core.js";
import {
	apply,
	eager,
	type RangeShape,
	type SetShape,
	type Shape,
	type UnionShape,
	type ValueShape,
	type ValuesShape
} from "./value.js";


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
					}> without child override`],

					...inherited[0].range.shape.kind === "text" ? [[`{${key}.model}`,
						inherited.every(p => equals(p.range.shape.model, inherited[0].range.shape.model))
						|| override !== undefined
						|| `conflicting parent localised models without child override`
					]] : []

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
			.filter(key => target.properties[key] !== undefined
				&& source.properties[key] !== undefined
				&& target.properties[key].kind !== source.properties[key].kind
			)
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

		} as Template,

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
 * to the source value when the target doesn't define them. Non-overridable fields (`name`, `description`,
 * `forward`, `reverse`) are inherited from the source; redefinition by the target is rejected.
 *
 * @param target The overriding child property
 * @param source The inherited parent property
 *
 * @returns The merged property
 *
 * @throws {TraceError} On incompatible overrides
 */
export function mergeProperty(target: Property, source: Property): Property {

	const trace = collect({

		// inherited: name must not be redefined by target (exact match tolerated for diamond inheritance)

		"{name}": target.name === undefined || equals(target.name, source.name)
			|| `unexpected <name> redefinition`,

		// inherited: description must not be redefined by target (exact match tolerated for diamond inheritance)

		"{description}": target.description === undefined || equals(target.description, source.description)
			|| `unexpected <description> redefinition`,

		// inherited: forward must not be redefined by target (exact match tolerated for diamond inheritance)

		"{forward}": target.forward === undefined || target.forward === source.forward
			|| `unexpected <forward> redefinition`,

		// inherited: reverse must not be redefined by target (exact match tolerated for diamond inheritance)

		"{reverse}": target.reverse === undefined || target.reverse === source.reverse
			|| `unexpected <reverse> redefinition`

	});

	if ( trace !== undefined ) {
		throw new TraceError("incompatible property override", trace);
	}

	return immutable({

		kind: target.kind,

		...target.hidden !== undefined ? { hidden: target.hidden }
			: source.hidden !== undefined ? { hidden: source.hidden }
				: {},

		...target.computed !== undefined ? { computed: target.computed }
			: source.computed !== undefined ? { computed: source.computed }
				: {},

		...source.name !== undefined && { name: source.name },
		...source.description !== undefined && { description: source.description },

		...source.forward !== undefined && { forward: source.forward },
		...source.reverse !== undefined && { reverse: source.reverse },

		range: mergeValues(target.range, source.range)

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates linked data {@link Resource | resource states} against a {@link ResourceShape}.
 *
 * Walks each resource and dispatches every declared property entry against its kind:
 *
 * - **`id`** — single absolute IRI matching the shape's `pattern` / `in` / `hasValue`
 *   constraints and, when supplied, the `entry` reference
 * - **`type`** — single absolute IRI
 * - **property** — value validated against the property's range as one of qest's
 *   `Values = Value | Text | readonly Value[]` arms, with cardinality bounds
 *   enforced through the range's `minCount` / `maxCount`
 *
 * Localised text values are language-tagged maps (`{ tag: string }` or `{ tag: string[] }`);
 * within a single map, all values must be uniformly scalar or uniformly array.
 *
 * Foreign reference properties (and unions whose variants are *all* foreign references)
 * must be absent: foreign links are managed by the target resource and are not part of the
 * source state. Unions mixing owned and foreign variants are validated against the owned
 * arm only, with foreign variants pruned.
 *
 * A reference-valued property accepts the linked resource's absolute IRI. A `captive` reference
 * additionally accepts an inline target resource state, validated recursively against the target
 * shape; the `depth` option bounds how many nesting levels may be expanded (`0` rejects all
 * expansion, accepting IRIs only; `undefined` imposes no limit). Plain (non-captive) references
 * accept the IRI form only. This applies uniformly to reference variants inside and outside unions.
 *
 * Property-value absence normalisation enforces qest's `Resource` / `Values` / `Text`
 * contract: canonical absent forms (`undefined`, `[]`, and, on slots that accept a nested
 * Resource, `{}`) and empty localised maps are normalised to property omission before
 * structural validation; `{}` elements are dropped from multi-valued Resource-accepting
 * slots before per-element validation and cardinality checks. On slots that cannot hold a
 * nested Resource (`string` / `number` / `boolean`), `{}` is outside the absence contract
 * and surfaces as a `{kind}` type mismatch.
 *
 * Properties not declared in the shape are rejected as `unexpected property` (closed-shape
 * envelope). Custom {@link ResourceConstraints.validators | validators} declared on the shape
 * run after the structural pass and may attach per-resource trace entries keyed by validator
 * name (or `validator[i]` if unnamed).
 *
 * @param values The resource instances to validate
 * @param shape The resource shape defining the expected structure and constraints
 * @param opts Validation options
 * @param opts.entry Expected {@link Reference} for the resource's identifier; the resource's
 *     `id` value (if any) must match this reference exactly; ignored when the resource has
 *     no `id` entry
 * @param opts.depth Maximum nesting depth for expanding `captive` reference values as inline
 *     target resource states; each expansion level counts against the budget. `0` rejects all
 *     expansion (IRI-only); if omitted, no depth limit is enforced
 *
 * @returns A keyed {@link Trace} of constraint violations per resource (keyed by `<iri>` for
 *     resources carrying a valid `id` and by `[index]` otherwise) or `undefined` when every
 *     instance passes validation
 */
export function validateResource(values: readonly unknown[], shape: ResourceShape, {

	entry,
	depth

}: {

	readonly entry?: Reference
	readonly depth?: number

} = {}): undefined | Trace {

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

		// reject id/type entries on embedded resource shapes

		...wrap(validateEmbedded(shape.properties)),

		"{kind}": mistyped === 0
			|| `expected <${shape.kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		...Object.fromEntries(matching.map((resource, index) => [key(resource, index, identifier),

			collect(Object.fromEntries([

				// property validation — validate merged shape properties

				...[...entries].map(([name, entry]) => [name,
					entry.kind === "id" ? validateId(resource[name], shape)
						: entry.kind === "type" ? validateType(resource[name])
							: entry.kind === "property" ? validateProperty(resource[name], entry)
								: undefined
				]),


				// envelope validation — reject unknown properties

				...Object.keys(resource)
					.filter(key => !entries.has(key))
					.map(key => [key, "unexpected property"]),

				// custom validators

				// CAST: object confirmed by isObject; the validator owns its own shape checks

				...validators
					.map(validator => [validator.name, normalise(validator(resource as Resource))] as const)
					.filter(([, trace]) => trace !== undefined)
					.map(([name, trace], i) => [`{${name || `validator[${i}]`}}`, trace])

			]))

		]))

	});


	function validateEmbedded(properties: ResourceShape["properties"]): undefined | Trace {

		return collect(Object.fromEntries(Object.entries(properties)

			.filter((e): e is [string, Property] => e[1].kind === "property")

			.flatMap(([name, { range }]) => {

				const shapes = range.shape.kind === "union"
					? range.shape.variants
					: [range.shape];

				return shapes
					.filter((s): s is ResourceShape => s.kind === "resource")
					.flatMap(s => Object.values(s.properties))
					.filter(entry => entry.kind === "id" || entry.kind === "type")
					.map(entry => [`{${name}}`, `unexpected <${entry.kind}> entry in embedded resource`]);

			})
		));

	}

	function validateId(value: unknown, shape: ResourceShape): undefined | Trace {

		const { pattern, in: allowed, hasValue: required } = shape;

		return value === undefined ? undefined : collect({

			// format validation

			"{kind}": Array.isArray(value) ? "expected scalar value"
				: !isReference(value) ? "expected absolute IRI"
					: undefined,

			// entry validation

			"{entry}": entry === undefined || !isReference(value) ? undefined
				: value !== entry ? `mismatched entry <${entry}>`
					: undefined,

			// constraint validation against the flattened shape lineage

			"{pattern}": pattern === undefined
				|| isReference(value) && match(value, pattern)
				|| `expected IRI matching pattern <${pattern}>`,

			"{in}": allowed === undefined
				|| isReference(value) && allowed.includes(value)
				|| `expected values in [${allowed?.join(", ")}]`,

			"{hasValue}": required === undefined
				|| isReference(value) && required.includes(value)
				|| `expected values to include [${required?.join(", ")}]`

		});

	}

	function validateType(value: unknown): undefined | Trace {

		return value === undefined ? undefined : collect({

			"{kind}": Array.isArray(value) ? "expected scalar value"
				: !isReference(value) ? "expected absolute IRI"
					: undefined

		});

	}

	function validateProperty(value: unknown, { range }: Property): undefined | Trace {

		const { shape } = range;

		const owned = shape.kind === "union"
			? shape.variants.filter(v => v.kind !== "reference" || !v.foreign)
			: shape.kind === "reference" && shape.foreign ? []
				: undefined;

		if ( owned !== undefined && owned.length === 0 ) {

			return value !== undefined ? "unexpected foreign property" : undefined;

		} else if ( owned !== undefined ) {

			return validateValues(value, { ...range, shape: { ...shape as UnionShape, variants: owned } });

		} else {

			return validateValues(value, range);

		}

	}

	function validateValues(value: unknown, {

		minCount,
		maxCount,

		shape

	}: SetShape): undefined | Trace {

		// normalise qest absent forms (see TSDoc on validateResource)

		const normalised = value === undefined || isArray(value) && value.length === 0 ? undefined : value;

		if ( shape.kind === "text" ) {

			const present = isObject(normalised) && (
				Object.keys(normalised).length === 0
				|| Object.values(normalised).every(v => isArray(v) && v.length === 0)
			) ? undefined : normalised;

			const values = present === undefined ? [] : [present];

			const structural = maxCount === 1
				? validateTextString(values, shape)
				: validateTextStrings(values, shape);

			if ( structural !== undefined ) {

				return structural;

			} else if ( present === undefined ) {

				return minCount !== undefined && minCount >= 1
					? collect({ "{minCount}": `expected at least one language tag` })
					: undefined;

			} else {

				// validator contract: structural arm passed and present !== undefined, so present
				// is a non-array object (see validateTextString/validateTextStrings)

				const entries = Object.entries(present as Record<string, unknown>);

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

			const present = isObject(normalised) && Object.keys(normalised).length === 0 && acceptsResource(shape)
				? undefined : normalised;

			const isScalar = maxCount === 1;

			const values = present === undefined ? []
				: !isArray(present) ? [present]
					: acceptsResource(shape) ? present.filter(v => !isObject(v) || Object.keys(v).length > 0)
						: present;

			const structural = isScalar

				? isArray(present)
					? collect({ "{kind}": "expected scalar value" })
					: validateState(values, shape)

				: present !== undefined && !isArray(present)
					? collect({ "{kind}": "expected array value" })
					: validateState(values, shape);

			if ( structural ) {

				return structural;

			} else {

				const count = present === undefined ? 0
					: isArray(present) ? values.length
						: 1;

				return collect({

					"{minCount}": minCount === undefined || count >= minCount
						|| `expected at least <${minCount}> value(s)`,

					"{maxCount}": maxCount === undefined || count <= maxCount
						|| `expected at most <${maxCount}> value(s)`

				});

			}

		}

	}

	function validateState(values: readonly unknown[], shape: Shape): undefined | Trace {

		switch ( shape.kind ) {

			case "reference":

				return validateReferenceState(values, shape);

			case "resource":

				return validateResource(values, shape, { depth });

			case "union":

				return acceptsResource(shape)
					? validateUnionState(values, shape)
					: validateUnion(values, shape);

			default:

				return validateValue(values, shape);

		}

	}

	function validateReferenceState(values: readonly unknown[], shape: ReferenceShape): undefined | Trace {

		return shape.captive && (depth === undefined || depth > 0)

			? collect(Object.fromEntries(values.map((value, index) => [`[${index}]`,
				isObject(value)
					? validateResource([value], eager(shape.shape), { depth: depth === undefined ? undefined : depth-1 })
					: validateReferences([value], shape)
			])))

			: validateReferences(values, shape);

	}

	function validateUnionState(values: readonly unknown[], shape: UnionShape): undefined | Trace {

		return collect(Object.fromEntries(values.map((value, index) => [`[${index}]`,
			validateUnionElement(value, shape.variants)
		])));

	}

	function validateUnionElement(value: unknown, variants: readonly ValuesShape[]): undefined | Trace {

		const traces = variants.map(variant => validateStateElement(value, variant));

		return traces.some(trace => trace === undefined)
			? undefined
			: collect(Object.fromEntries(traces.map((trace, index) => [`[${index}]`, trace])))
				?? "no union variant matched";

	}

	function validateStateElement(value: unknown, shape: ValuesShape): undefined | Trace {

		switch ( shape.kind ) {

			case "reference":

				return validateReferenceElement(value, shape);

			case "resource":

				return isObject(value) ? validateResource([value], shape, { depth }) : "expected nested resource";

			default:

				return validateValue([value], shape);

		}

	}

	function validateReferenceElement(value: unknown, shape: ReferenceShape): undefined | Trace {

		return isReference(value) ? validateReferences([value], shape)
			: isObject(value) && shape.captive && (depth === undefined || depth > 0)
				? validateResource([value], eager(shape.shape), { depth: depth === undefined ? undefined : depth-1 })
				: validateReferences([value], shape);

	}

}

/**
 * Validates retrieval results against a {@link ResourceShape} narrowed by a projection {@link Template}.
 *
 * Walks each response and dispatches every declared property entry against its kind, enforcing shape
 * constraints only for keys named in `model`:
 *
 * - **`id`** — single absolute IRI matching the shape's `pattern` / `in` / `hasValue` constraints and,
 *   when supplied, the `entry` reference
 * - **`type`** — single absolute IRI
 * - **property** — value validated against the property's range narrowed by the nested projection in
 *   `model`, with cardinality bounds enforced through the range's `minCount` / `maxCount`
 *
 * Model bindings whose probe (`path` and `pipe`) fails to resolve against the shape are rejected
 * with the atomic trace surfaced by {@link apply}, regardless of whether a value is supplied for the
 * binding.
 *
 * Reference slots accept either a bare {@link Reference} or an expanded nested resource; expanded
 * resources are validated against the linked resource's target shape narrowed by the nested projection
 * in `model`.
 *
 * A localised slot requested through a coalesced placeholder (a plain-string model entry `""` for
 * single-string-per-tag, a single-element string array `[""]` for array-per-tag) carries its coalesced
 * label: the response value is the winning tag's rendered string(s), validated against the shape's
 * `minLength` / `maxLength` bounds per value; `languageIn` is not enforced, since coalescing discards
 * the winning tag. A tag-map response on such an entry is rejected: the template requested the
 * coalesced form.
 *
 * Differs from {@link validateResource} in three ways:
 *
 * - **Partial resources** — shape constraints on keys absent from `model` are not enforced; unrequested
 *   required fields do not trigger `minCount` violations.
 * - **Expanded nested references** — reference slots accept an expanded nested resource in addition to
 *   a bare IRI, validated against the target shape narrowed by the nested projection in `model`.
 * - **Client expectations** — closed-shape enforcement is run against the narrowed surface (the
 *   intersection of `shape` and `model`): properties present in the response but absent from `model`
 *   are rejected as `unexpected property`, even when declared in the full `shape`.
 *
 * Custom {@link ResourceConstraints.validators | validators} declared on the shape run after the
 * structural pass and may attach per-response trace entries keyed by validator name.
 *
 * @param values The response instances to validate
 * @param shape The resource shape defining the admissible surface
 * @param model The projection template narrowing the admissibility check
 * @param opts Validation options
 * @param opts.entry Expected {@link Reference} for the response's identifier; the response's
 *     `id` value (if any) must match this reference exactly; ignored when the response has
 *     no `id` entry
 *
 * @returns A keyed {@link Trace} of constraint violations per response (keyed by `<iri>` for
 *     responses carrying a valid `id` and by `[index]` otherwise) or `undefined` when every
 *     instance passes validation
 */
export function validateResult(values: readonly unknown[], {

	shape,
	model,

	entry

}: {

	readonly shape: ResourceShape
	readonly model: Template

	readonly entry?: Reference

}): undefined | Trace {

	// decode projection entries; selection keys (filters, ordering, pagination) are ignored. Results
	// come from untrusted sources, so a malformed probe surfaces as a trace (mirroring the per-key
	// decode guards in validateSelectionEntry / validateProjectionEntry), never an uncaught throw

	try {

		const projections = Object.keys(model)
			.filter(k => !isSelector(k))
			.map(k => ({ probe: decodeProbe(k), nested: model[k] }));

		const aliases = new Set(projections.map(p => p.probe.target));

		const matching = values.filter(value => isObject(value));
		const mistyped = values.length-matching.length;


		// resolve the identifier property key

		const identifier = Object.entries(shape.properties)
			.find(([, e]) => e.kind === "id")
			?.[0];

		// collect validators

		const validators = shape.validators ?? [];

		return collect({

			"{kind}": mistyped === 0
				|| `expected <${shape.kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

			...Object.fromEntries(matching.map((resource, index) => [key(resource, index, identifier),

				collect(Object.fromEntries([

					// projected property validation — one entry per model alias; elided slots
					// (empty-template `{}`) carry no contract and bypass shape validation

					...projections
						.filter(({ nested }) => !isObject(nested) || Object.keys(nested).length > 0)
						.map(({ probe, nested }) => [probe.target,
							validateProjection(resource[probe.target], probe, nested)
						]),

					// envelope validation — reject keys in value absent from model (client expectations)

					...Object.keys(resource)
						.filter(k => !aliases.has(k))
						.map(k => [k, "unexpected property"]),

					// custom validators

					// CAST: object confirmed by isObject; the validator owns its own shape checks

					...validators
						.map(validator => [validator.name, normalise(validator(resource as Resource))] as const)
						.filter(([, trace]) => trace !== undefined)
						.map(([name, trace], i) => [`{${name || `validator[${i}]`}}`, trace])

				]))

			]))

		});

	} catch ( e ) {

		return message(e);

	}


	function validateProjection(value: unknown, probe: Probe, nested: unknown): undefined | Trace {

		// an id/type projection (pipe-free, single-path) validates against the identifier/type rules;
		// any other probe resolves through `apply`

		const leaf = probe.pipe.length === 0 && probe.path.length === 1
			? shape.properties[probe.path[0]]
			: undefined;

		return leaf?.kind === "id" ? validateId(value)
			: leaf?.kind === "type" ? validateType(value)
				: validateApplied(value, probe, nested);

	}

	function validateApplied(value: unknown, probe: Probe, nested: unknown): undefined | Trace {

		const range = apply(probe, shape);

		if ( isString(range) ) {

			// probe unresolvable against the shape — propagate `apply`'s atomic trace; the
			// enclosing binding key already identifies the offending entry

			return range;

		} else if ( range.kind === "null" ) {

			// accepted probe resolving to a statically known undefined value (a processing-space literal
			// transformed outside its domain): no shape to constrain, so the entry is vacuously valid

			return undefined;

		} else {

			// transform-derived projection: the output value does not inherit source leaf constraints,
			// so narrow the range before checking constraints

			const narrowed = probe.pipe.length === 0 ? range : immutable({
				...range,
				variants: range.variants.map(leaf =>
					leaf.kind === "string" || leaf.kind === "number"
						? immutable({ kind: leaf.kind, model: leaf.model }) as ValuesShape
						: leaf
				)
			});

			return validateProjectionRange(value, narrowed, nested);

		}

	}

	function validateId(value: unknown): undefined | Trace {

		const { pattern, in: allowed, hasValue: required } = shape;

		return value === undefined ? undefined : collect({

			"{kind}": isArray(value) ? "expected scalar value"
				: !isReference(value) ? "expected absolute IRI"
					: undefined,

			"{entry}": entry === undefined || !isReference(value) ? undefined
				: value !== entry ? `mismatched entry <${entry}>`
					: undefined,

			"{pattern}": pattern === undefined
				|| isReference(value) && match(value, pattern)
				|| `expected IRI matching pattern <${pattern}>`,

			"{in}": allowed === undefined
				|| isReference(value) && allowed.includes(value)
				|| `expected values in [${allowed?.join(", ")}]`,

			"{hasValue}": required === undefined
				|| isReference(value) && required.includes(value)
				|| `expected values to include [${required?.join(", ")}]`

		});

	}

	function validateType(value: unknown): undefined | Trace {

		return value === undefined ? undefined : collect({

			"{kind}": isArray(value) ? "expected scalar value"
				: !isReference(value) ? "expected absolute IRI"
					: undefined

		});

	}

	function validateProjectionRange(value: unknown, range: RangeShape, nested: unknown): undefined | Trace {

		const { minCount, maxCount, variants } = range;

		// empty variants: a statically known absent value, vacuously valid

		if ( variants.length === 0 ) { return undefined; }

		// normalise absence (mirrors validateResource absence contract)

		const normalised = value === undefined || isArray(value) && value.length === 0 ? undefined : value;

		if ( variants.length === 1 && variants[0].kind === "text" ) {

			// a coalesced model entry requests the coalesced label: a bare string for single-string-per-tag,
			// a single-element string array (`[""]`) for array-per-tag (see TSDoc); any other model form
			// keeps the structural tag-map contract

			const coalesced = maxCount === 1 ? isString(nested) : isArray(nested, [isString]);

			return coalesced
				? validateCoalescedText(normalised, range)
				: validateTextRange(normalised, range, nested);

		}

		const resource = variants.some(acceptsResource);

		const present = isObject(normalised) && Object.keys(normalised).length === 0 && resource
			? undefined : normalised;

		const isScalar = maxCount === 1;

		if ( present === undefined ) {

			return minCount !== undefined && minCount >= 1
				? collect({ "{minCount}": `expected at least <${minCount}> value(s)` })
				: undefined;

		} else if ( isScalar && isArray(present) ) {

			return collect({ "{kind}": "expected scalar value" });

		} else if ( !isScalar && !isArray(present) ) {

			return collect({ "{kind}": "expected array value" });

		} else {

			const elements = isArray(present)
				? resource ? present.filter(v => !isObject(v) || Object.keys(v).length > 0) : present
				: [present];

			const count = isArray(present) ? elements.length : 1;

			return validateProjectionElements(elements, variants, nested) ?? collect({

				"{minCount}": minCount === undefined || count >= minCount
					|| `expected at least <${minCount}> value(s)`,

				"{maxCount}": maxCount === undefined || count <= maxCount
					|| `expected at most <${maxCount}> value(s)`

			});

		}

	}

	function validateProjectionElements(
		values: readonly unknown[],
		variants: readonly ValuesShape[],
		nested: unknown
	): undefined | Trace {

		if ( variants.length !== 1 ) {

			// a disjunction (or empty set): every value must satisfy at least one reachable variant

			return collect(Object.fromEntries(values.map((v, i) => [`[${i}]`,
				validateProjectionUnion(v, variants, nested)
			])));

		}

		const [rangeShape] = variants;

		if ( rangeShape.kind === "reference" ) {

			const targetShape = eager(rangeShape.shape);
			const nestedModel = extractNestedModel(nested);

			return collect(Object.fromEntries(values.map((v, i) => [`[${i}]`,
				isString(v)
					? isReference(v) ? undefined : `expected absolute IRI`
					: isObject(v)
						? validateResult([v], { shape: targetShape, model: nestedModel })
						: "expected IRI or nested resource"
			])));

		} else if ( rangeShape.kind === "resource" ) {

			const nestedModel = extractNestedModel(nested);

			return collect(Object.fromEntries(values.map((v, i) => [`[${i}]`,
				isObject(v)
					? validateResult([v], { shape: rangeShape, model: nestedModel })
					: "expected nested resource"
			])));

		} else {

			return validateValue(values, rangeShape);

		}

	}

	function validateProjectionUnion(
		value: unknown,
		variants: readonly ValuesShape[],
		nested: unknown
	): undefined | Trace {

		// the model drives per-variant unwrapping: a `Union` (canonical-index keys) selects a sub-model per
		// branch; a plain (identifier-keyed) projection forwards unchanged to every variant. Index keys are
		// not valid Probe identifiers, so they are unwrapped here before recursion into validateResult.

		const model = isArray(nested) && nested.length > 0 ? nested[0] : nested;
		const fields: Record<string, unknown> = isObject(model) ? model : {};

		const keys = Object.keys(fields);
		const index = (key: string): boolean => isUnionIndex(key) && Number(key) < variants.length;

		// a non-identifier key marks a union form, in which every key must be a canonical in-range variant
		// index; any malformed key is rejected uniformly (empty-string default, out-of-range, non-canonical)

		const malformed = keys.some(key => !isIdentifier(key)) ? keys.filter(key => !index(key)) : [];

		if ( malformed.length > 0 ) {

			return collect(Object.fromEntries(malformed.map(key =>
				[key, `expected variant index in [0, ${variants.length})`]
			)));

		} else {

			const indexed = keys.some(index);

			const match = variants.some((variant, i) => {

				const branch = indexed ? fields[String(i)] : nested;

				return indexed && !(String(i) in fields) ? false // union form excludes this variant
					: variant.kind === "reference" || variant.kind === "resource"
						? validateProjectionElements([value], [variant], branch) === undefined
						: validateValue([value], variant) === undefined;

			});

			return match ? undefined : "expected value matching at least a union variant";

		}

	}

	function validateTextRange(present: unknown, range: RangeShape, nested: unknown): undefined | Trace {

		const { minCount, maxCount } = range;
		const [textShape] = range.variants;

		if ( textShape?.kind === "text" ) {

			// model-narrowed locale projection: a nested model explicitly requesting a tag set
			// (e.g. `[{en: ""}]`) is validated in per-element tag-map form; otherwise fall back to
			// the canonical `und`-keyed structural normalisation below

			const projectedTags = extractProjectedTags(nested);

			if ( projectedTags === undefined ) {

				const hasContent = isObject(present) && (
					Object.keys(present).length === 0
					|| Object.values(present).every(v => isArray(v) && v.length === 0)
				) ? undefined : present;

				const vals = hasContent === undefined ? [] : [hasContent];

				const structural = maxCount === 1
					? validateTextString(vals, textShape)
					: validateTextStrings(vals, textShape);

				if ( structural !== undefined ) {

					return structural;

				} else if ( isObject(hasContent) ) {

					// structural arm passed, so hasContent is a non-array tag map (see
					// validateTextString / validateTextStrings); isObject narrows it here

					const tagEntries = Object.entries(hasContent);

					return tagEntries.length === 0 && minCount !== undefined && minCount >= 1

						? collect({ "{minCount}": `expected at least one language tag` })

						: collect(Object.fromEntries(tagEntries.map(([tag, tagValue]) => {

							const count = isArray(tagValue) ? tagValue.length : 1;

							return [tag, collect({

								"{minCount}": minCount === undefined || count >= minCount
									|| `expected at least <${minCount}> value(s) for tag`,

								"{maxCount}": maxCount === undefined || count <= maxCount
									|| `expected at most <${maxCount}> value(s) for tag`

							})];

						})));

				} else {

					// structural arm accepted the absence (hasContent is undefined): only enforce minimum presence

					return minCount !== undefined && minCount >= 1
						? collect({ "{minCount}": `expected at least one language tag` })
						: undefined;

				}

			} else {

				return validateProjectedText(present, range, projectedTags);

			}

		} else {

			return undefined; // defensive: dispatched only on a single text variant

		}


		/**
		 * Extracts the explicit tag set projected by a localised model entry.
		 *
		 * A nested model of the form `{ en: "" }` (scalar) or `[{ en: "" }]` (multi) projects the
		 * localised slot to the given specific tag set; the wildcard form `{ "*": "" }` projects
		 * the per-element tag-map form admitting any tag (used by `multiple(text())`-style
		 * unconstrained models). Returns the requested tags — including `"*"` for the wildcard
		 * form — or `undefined` when the nested value carries no recognisable tag-map projection.
		 */
		function extractProjectedTags(nested: unknown): string[] | undefined {
			const head = isArray(nested) ? nested[0] : nested;

			const tags = isObject(head) ? Object.keys(head).filter(isTagRange) : [];

			return tags.length > 0 ? tags : undefined;
		}

	}

	/**
	 * Validates the coalesced-label response of a coalesced model entry over a localised slot: the value
	 * is the winning tag's rendered string(s) at the slot's per-tag cardinality (one string for
	 * single-string-per-tag, a string array for array-per-tag), checked against the shape's length bounds
	 * per value; `languageIn` cannot be enforced, since coalescing discards the winning tag.
	 */
	function validateCoalescedText(present: unknown, range: RangeShape): undefined | Trace {

		const { minCount, maxCount } = range;
		const [textShape] = range.variants;

		// an empty-map response slot is absence per the empty-structure rule, mirroring the
		// canonical-path normalisation in validateTextRange

		const normalised = isObject(present) && Object.keys(present).length === 0
			? undefined : present;

		if ( textShape?.kind !== "text" ) {

			return undefined; // dispatched only on text ranges; defensive narrowing

		} else if ( normalised === undefined ) {

			return minCount !== undefined && minCount >= 1
				? collect({ "{minCount}": `expected at least <${minCount}> value(s)` })
				: undefined;

		} else if ( maxCount === 1 ) {

			// single-string-per-tag: the one rendered string

			return isString(normalised) ? lengthTrace(normalised, textShape)
				: collect({ "{kind}": "expected coalesced string value" });

		} else if ( isArray<string>(normalised, isString) ) {

			// array-per-tag: the winning tag's value set as a string array

			const elementErrors = Object.fromEntries(normalised.map((element, index) =>
				[`[${index}]`, lengthTrace(element, textShape)]
			));

			const cardinality = {

				"{minCount}": minCount === undefined || normalised.length >= minCount
					|| `expected at least <${minCount}> value(s)`,

				"{maxCount}": maxCount === undefined || normalised.length <= maxCount
					|| `expected at most <${maxCount}> value(s)`

			};

			return collect({ ...elementErrors, ...cardinality });

		} else {

			// array-per-tag: any non-string-array response is not the coalesced array form

			return collect({ "{kind}": "expected coalesced string array value" });

		}

	}

	/**
	 * Checks a coalesced string against a text shape's `minLength` / `maxLength` bounds.
	 */
	function lengthTrace(value: string, { minLength, maxLength }: TextShape): undefined | Trace {
		return collect({

			"{minLength}": minLength === undefined || value.length >= minLength
				|| `expected string length >= <${minLength}>`,

			"{maxLength}": maxLength === undefined || value.length <= maxLength
				|| `expected string length <= <${maxLength}>`

		});
	}

	function validateProjectedText(
		present: unknown,
		range: RangeShape,
		tags: readonly string[]
	): undefined | Trace {

		const { minCount, maxCount } = range;
		const [textShape] = range.variants;

		if ( textShape?.kind !== "text" ) { return undefined; }

		// empty-map response slot is absence per the absence-semantics axis: `{}` MUST
		// be ignored as if the property were omitted, mirroring the canonical-path
		// normalisation in validateTextRange

		const normalised = present === undefined
		|| isObject(present) && Object.keys(present).length === 0
			? undefined : present;

		if ( normalised === undefined ) {

			return minCount !== undefined && minCount >= 1
				? collect({ "{minCount}": `expected at least <${minCount}> value(s)` })
				: undefined;

		}

		const { minLength, maxLength, languageIn } = textShape;

		const isScalar = maxCount === 1;
		const wildcard = tags.includes("*");
		const explicitTags = tags.filter(t => t !== "*");

		if ( isScalar && isArray(normalised) ) {

			return collect({ "{kind}": "expected scalar value" });

		} else if ( !isScalar && !isArray(normalised) ) {

			return collect({ "{kind}": "expected array value" });

		} else {

			// drop empty-map elements (`{}`) per the absence-semantics axis: empty
			// entries carry no contract and MUST NOT trigger element-presence checks

			const elements = (isArray(normalised) ? normalised : [normalised])
				.filter(el => !isObject(el) || Object.keys(el).length > 0);

			const elementErrors = Object.fromEntries(elements.map((el, i) => [`[${i}]`,
				isObject(el)
					? collect(Object.fromEntries((wildcard
							? Object.keys(el)
							: explicitTags
					).map(tag => {

						const tagValue = el[tag];

						if ( tagValue === undefined ) {

							return [tag, "missing projected tag"];

						} else if ( !isString(tagValue) ) {

							return [tag, "expected string value"];

						} else {

							return [tag, collect({

								"{minLength}": minLength === undefined || tagValue.length >= minLength
									|| `expected string length >= <${minLength}>`,

								"{maxLength}": maxLength === undefined || tagValue.length <= maxLength
									|| `expected string length <= <${maxLength}>`,

								"{languageIn}": languageIn === undefined
									|| languageIn.some(range => matchTag(tag, range))
									|| `unsupported tag for allowed languages [${languageIn.join(", ")}]`

							})];

						}

					})))
					: "expected tag-map value"
			]));

			const cardinality = {

				"{minCount}": minCount === undefined || elements.length >= minCount
					|| `expected at least <${minCount}> value(s)`,

				"{maxCount}": maxCount === undefined || elements.length <= maxCount
					|| `expected at most <${maxCount}> value(s)`

			};

			return collect({ ...elementErrors, ...cardinality });

		}

	}

	function extractNestedModel(nested: unknown): Template {

		if ( isArray(nested) && nested.length > 0 && isObject(nested[0]) ) {

			// CAST: isObject confirms an object; the Template structure is validated downstream by validateResult

			return nested[0] as Template;

		} else if ( isObject(nested) ) {

			// CAST: isObject confirms an object; the Template structure is validated downstream by validateResult

			return nested as Template;

		} else {

			return {};

		}

	}

}

/**
 * Validates retrieval {@link Template | templates} against a {@link ResourceShape}.
 *
 * Implements a recursive descent that mirrors the {@link Placeholders} arms: the single-value
 * {@link Model} forms ({@link Placeholder}, {@link Union}, and localised `Locale`) and the
 * collection-valued {@link Query}. Arm selection is gated on effective cardinality and shape kind: localised slots
 * route through the `Locale` arm; union slots take {@link Union}, or a branch-immaterial
 * {@link Placeholder}; other `maxCount === 1` slots take {@link Placeholder}; `maxCount !== 1`
 * slots take {@link Query}. Tuple-wrapped {@link Query} forms are therefore rejected on
 * cardinality-1 slots, where {@link Selection} has no meaningful surface. Each arm sub-dispatches
 * against its own forms:
 *
 * - **{@link Placeholder}** — a `boolean` / `number` / `string` literal, an IRI {@link Reference},
 *   or a nested {@link Template} object
 * - **{@link Union}** — an object whose keys are canonical variant indices, each mapping to the
 *   per-branch placeholder; a branch-immaterial value reaches a union slot through the sibling
 *   {@link Placeholder} arm instead
 * - **`Locale`** — a per-`TagRange` map whose per-tag values match the property's per-tag cardinality
 *   (single strings for single-string-per-tag, strict singleton string arrays for array-per-tag), or a
 *   coalesced placeholder standing in for its value under language negotiation at the same cardinality
 *   (a bare string for single-string-per-tag, a single-element string array for array-per-tag); a
 *   mismatched per-tag shape is rejected (qest §5.3), and a localised property carries no inline
 *   {@link Selection}
 * - **{@link Query}** — collection-shaped placeholder pairing a per-item element with an optional
 *   {@link Selection} as a one- or two-element tuple `[element, Selection?]`; the element forms are:
 *
 *   - **`readonly [Placeholder, Selection?]`** — a bare literal or IRI {@link Reference}, or a
 *     nested {@link Template} object, optionally followed by a {@link Selection}
 *   - **`readonly [Union, Selection?]`** — a per-branch {@link Union} indexed object, optionally
 *     followed by a {@link Selection}
 *   - **`readonly [Projection, Selection?]`** — a tabular {@link Projection} object, optionally
 *     followed by a {@link Selection}
 *
 * **Tuple arity** — a collection arm accepts a one- or two-element tuple and rejects arrays of any
 * other length; both an empty array and arrays of three or more elements are rejected.
 *
 * **Element dispatch** — the leading element is validated against its shape with no inline
 * {@link Selection} keys. An object element is partitioned by key shape:
 *
 * - if every key is a plain `Identifier`, the element is validated as a {@link Template} (each key
 *   resolves to a {@link Placeholders} value)
 * - else if every key is a `Binding` (a plain identifier or `name=expression`), the element is
 *   validated as a {@link Projection}
 * - otherwise (a key that is neither, such as a stray selection operator) the element is rejected
 *
 * Within the projection arm, binding identifiers (the part before `=` for computed bindings, or
 * the whole key for plain identifiers) must be unique within the element; collisions on the same
 * projected property are rejected with a `duplicate projection identifier` trace. Projection cells
 * over a localised property carry a `Locale` map whose per-tag value is pinned to the property's
 * per-tag cardinality (single strings for single-string-per-tag, singleton tuples for array-per-tag),
 * or the matching coalesced placeholder; the structural map is one cell, fanning out at the row level
 * rather than per tag (qest §5.3, §5.6).
 *
 * **Selection slot dispatch** — the optional second tuple element is validated as a
 * {@link Selection}: every key must be a selection operator, dispatched by prefix into filtering
 * (`<`, `>`, `<=`, `>=`, `~`, `?`, `!`), ordering (`+`, `^`), and paging (`@`, `#`) validators,
 * mirroring the `isSelector` layout.
 *
 * Value constraints, cardinality bounds, and custom validators are skipped, since a template
 * describes a retrieval projection rather than actual data. Bindings whose probe (`path` and
 * `pipe`) fails to resolve against the shape are rejected with the atomic trace surfaced by
 * {@link apply}; missing properties are accepted as not requested. Property entries may map to
 * `undefined` to mark optional template / projection slots elided at construction time.
 *
 * Where a property specifies a linked resource, the accepted retrieval forms depend on the
 * shape kind: a direct {@link ResourceShape} inclusion (embedded resource) accepts only a
 * nested template, whereas a {@link Reference} wrapper (standalone resource) accepts either a
 * bare IRI reference placeholder (any IRI reference, since a placeholder is never resolved) or a
 * nested template subject to the `depth` budget; `depth` of `0` disables nested templates while
 * still accepting IRI references. A union-typed property is addressed only through the indexed
 * {@link Union} form, plain placeholders rejected. When `plain` is enabled, aggregate transforms
 * in {@link Probe} pipes are rejected at every binding and selection slot.
 *
 * @param values The template instances to validate
 * @param shape The resource shape defining the expected structure
 * @param opts Validation options
 * @param opts.plain Whether to reject aggregate transforms (`count`, `sum`, `min`, `max`,
 *     `avg`) in probe pipes; `true` rejects any binding or selection slot whose pipe contains
 *     an aggregate transform; defaults to `false`
 * @param opts.depth Maximum nesting depth for reference and embedded resource expansion; `0`
 *     rejects any nested template while still accepting IRI references; defaults to unlimited
 * @param opts.limit Maximum value for the `#` pagination constraint; queries specifying `#`
 *     exceeding this value are rejected; defaults to unlimited
 *
 * @returns A keyed {@link Trace} of constraint violations per property, or `undefined` if
 *     all templates pass
 */
export function validateTemplate(values: readonly unknown[], shape: ResourceShape, {

	plain,
	depth,
	limit

}: {

	readonly plain?: boolean
	readonly depth?: number
	readonly limit?: number

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


	function validateTemplate(
		value: Record<string, unknown>,
		shape: ResourceShape,
		depth: number | undefined
	): undefined | Trace {

		if ( depth !== undefined && depth < 0 ) {

			return "exceeded maximum nesting depth";

		} else {

			return collect(Object.fromEntries(Object.entries(value).map(([k, v]) =>

				isIdentifier(k)
					? [k, validateTemplateEntry(k, v, shape, depth)]
					: [k, "expected property identifier"]
			)));

		}

	}

	function validateQuery(
		value: unknown,
		range: RangeShape,
		depth: number | undefined
	): undefined | Trace {

		const { maxCount, variants } = range;

		// every localised slot is routed here regardless of cardinality (see validatePlaceholders), but
		// its value is the `Locale` language map, not a `Query` tuple `[element, selection?]`; the text
		// branch validates it as a Locale before the collection-tuple handling below

		if ( variants.length === 1 && variants[0].kind === "text" ) {

			return maxCount === 1
				? validateLocaleString(value)
				: validateLocaleStrings(value);

		} else if ( !isArray(value) || value.length < 1 || value.length > 2 ) {

			// per qest: `Query = [element, Selection?]` — a one- or two-element tuple pairing the
			// per-item element with an optional collection-wide `Selection`

			return "expected collection tuple <[element, selection?]>";

		} else {

			const next = depth === undefined ? depth : depth-1;

			const element = validateElement(value[0], range, next);
			const selection = value.length === 2 ? validateSelection(value[1], variants, next) : undefined;

			// the grouped-ordering cross-check needs a structurally valid element and selection, so it
			// runs only once both pass; it reports offending sort keys under their selector keys

			const grouping = value.length === 2 && element === undefined && selection === undefined
				? validateGroupedOrdering(value[0], value[1])
				: undefined;

			// element keys (variant indices, identifiers, bindings) and selection operator keys are
			// disjoint, so the per-slot keyed traces merge into one trace; an atomic per-slot error
			// is keyed by its tuple position

			return collect({
				...(isObject(element) ? element : isString(element) ? { "[0]": element } : {}),
				...(isObject(selection) ? selection : isString(selection) ? { "[1]": selection } : {}),
				...(isObject(grouping) ? grouping : {})
			});

		}

		/**
		 * Validates collection ordering under grouped semantics.
		 *
		 * A query is grouped when an aggregate transform appears in its projection bindings or its sibling
		 * selection; grouping is then fixed by the non-aggregate projection bindings (the grouping keys). A
		 * non-aggregate `^` ordering expression MUST reference one of those grouping keys; an aggregate
		 * ordering expression sorts by its post-aggregation value and is always admissible. When the query
		 * is not grouped, ordering is unconstrained.
		 *
		 * @param element The per-item element (the query tuple's first slot)
		 * @param selection The collection-wide selection (the query tuple's optional second slot)
		 *
		 * @returns A keyed trace of offending sort keys, or `undefined` when ordering is admissible
		 */
		function validateGroupedOrdering(element: unknown, selection: unknown): undefined | Trace {

			if ( !isObject(selection) ) { return undefined; }

			const aggregate = (probe: Probe): boolean => probe.pipe.some(isAggregate);
			const signature = (probe: Probe): string => `${probe.path.join(".")}|${probe.pipe.join(":")}`;

			const bindings = isObject(element) ? Object.keys(element).filter(isBinding).map(decodeProbe) : [];
			const selectors = Object.keys(selection).map((k): [string, Probe] => [k, decodeProbe(k)]);

			// grouping is triggered by any aggregate in the projection or the selection (qest §Selection); the
			// grouping keys are then the non-aggregate projection bindings, fixed by the projection alone

			const grouped = bindings.some(aggregate) || selectors.some(([, probe]) => aggregate(probe));
			const groupingKeys = new Set(bindings.filter(probe => !aggregate(probe)).map(signature));

			// a non-aggregate `^` ordering must reference a grouping key; an aggregate `^` sorts by its
			// post-aggregation value and is always admissible

			return !grouped ? undefined : collect(Object.fromEntries(selectors
				.filter(([, probe]) => probe.target === "^")
				.map(([k, probe]) => [k, aggregate(probe) || groupingKeys.has(signature(probe))
					? undefined
					: "expected a grouping-key or aggregate sort expression under grouping"]
				)
			));

		}

	}

	/**
	 * Validates the per-item element of a {@link Query} tuple against its shape, carrying no inline
	 * {@link Selection} keys.
	 *
	 * Dispatches by shape kind: a union element takes the {@link Union} indexed form only, a plain
	 * placeholder over it being rejected; a primitive element is the bare literal; a reference element
	 * is a bare IRI reference or a nested object; a resource element is a nested object. Object elements
	 * split into a {@link Template} (every key a plain `Identifier`) or a {@link Projection} (at least
	 * one `name=expression` binding).
	 */
	function validateElement(
		value: unknown,
		range: RangeShape,
		depth: number | undefined
	): undefined | Trace {

		const { variants } = range;

		if ( variants.length > 1 ) {

			// a union-typed slot is addressable only through the indexed form; a plain placeholder,
			// whichever single branch it may resemble, is rejected

			return isUnion(value)
				? validateUnion(value, variants, (v, variant) =>
					validatePlaceholders(v, { ...range, variants: [variant], maxCount: 1 }, depth)
				)
				: "expected union form";

		} else {

			const [shape] = variants;

			switch ( shape.kind ) {

				case "boolean":

					return isBoolean(value) ? undefined : `expected <${shape.kind}> value`;

				case "number":

					return isNumber(value) ? undefined : `expected <${shape.kind}> value`;

				case "string":

					return isString(value) ? undefined : `expected <${shape.kind}> value`;

				case "reference":

					// a reference placeholder matches the `IRI-reference` production: the empty string,
					// the root-relative form, and relative or absolute references are all accepted, since
					// a placeholder is never resolved on decoding (reference values proper, the options
					// and operands of a selection, are resolved and absolute by validation time)

					return isString(value)
						? isIRI(value) ? undefined : `expected <${shape.kind}> IRI`
						: isObject(value) ? validateObjectElement(value, eager(shape.shape), depth)
							: "expected <template> value";

				case "resource":

					return isObject(value) ? validateObjectElement(value, shape, depth)
						: "expected <template> value";

				case "text":

					// a localised property is addressed through the locale placeholder, never as a query
					// element; unreachable for a well-formed effective type, reported rather than passed

					return "unexpected <text> element";

			}

		}

	}


	/**
	 * Routes a {@link Placeholders} value to its arm by shape kind and cardinality.
	 *
	 * Localised slots take the localised arm (locale cardinality applies per tag, not per value).
	 * Union slots take {@link validateUnion} when the value is a {@link Union} form (canonical
	 * variant-index keys); a multi-valued union slot with an array value routes instead to
	 * {@link validateQuery}, and any other value over a union slot is rejected (the indexed form is the
	 * only way to address a union). Non-union `maxCount === 1` slots delegate to
	 * {@link validatePlaceholder}; remaining (`maxCount !== 1`) slots route to {@link validateQuery}.
	 */
	function validatePlaceholders(
		value: unknown,
		range: RangeShape,
		depth: number | undefined
	): undefined | Trace {

		const { maxCount, variants } = range;

		if ( variants.length > 1 ) {

			// a multi-valued union slot with an array value carries a Query tuple; otherwise a
			// union-typed slot is addressable only through the indexed form, plain placeholders rejected

			return maxCount !== 1 && isArray(value)

				? validateQuery(value, range, depth)

				: isUnion(value)

					? validateUnion(value, variants, (v, variant) =>
						validatePlaceholders(v, { ...range, variants: [variant] }, depth))

					: "expected union form";

		}

		const [shape] = variants;

		if ( shape.kind === "text" ) {

			return validateQuery(value, range, depth);

		} else if ( maxCount === 1 ) {

			return collect(wrap(validatePlaceholder(value, shape, depth)));

		} else {

			return validateQuery(value, range, depth);

		}

	}

	function validatePlaceholder(
		value: unknown,
		shape: ValueShape,
		depth: number | undefined
	): undefined | Trace {

		const next = depth === undefined ? depth : depth-1;

		switch ( shape.kind ) {

			case "boolean":

				return isBoolean(value) ? undefined : `expected <${shape.kind}> value`;

			case "number":

				return isNumber(value) ? undefined : `expected <${shape.kind}> value`;

			case "string":

				return isString(value) ? undefined : `expected <${shape.kind}> value`;

			case "reference":

				// a reference placeholder matches the `IRI-reference` production (see validateElement);
				// reference values proper are resolved on decoding and absolute by validation time

				return isString(value)
					? isIRI(value) ? undefined
						: `expected <${shape.kind}> IRI`
					: isObject(value) ? validateTemplate(value, eager(shape.shape), next)
						: `expected <template> value`;

			case "resource":

				return isObject(value) ? validateTemplate(value, shape, next)
					: "expected <template> value";

		}

	}


	/**
	 * Validates an object {@link Query} element against a resource shape, with no inline
	 * {@link Selection} keys.
	 *
	 * Splits by key shape: every key a plain `Identifier` validates as a {@link Template} (each entry
	 * resolving to a {@link Placeholders} value); at least one `name=expression` `Binding` (with the
	 * rest still bindings) validates as a {@link Projection}. A key that is neither an `Identifier` nor
	 * a `Binding` (for example a selection operator, which belongs in the tuple's second slot) makes
	 * the object an invalid element. An empty object is an empty template, carrying no retrieval
	 * instructions.
	 */
	function validateObjectElement(
		value: Record<string, unknown>,
		shape: ResourceShape,
		depth: number | undefined
	): undefined | Trace {

		if ( depth !== undefined && depth < 0 ) {

			return "exceeded maximum nesting depth";

		} else if ( Object.keys(value).every(isIdentifier) ) {

			return validateTemplate(value, shape, depth);

		} else if ( Object.keys(value).every(isBinding) ) {

			return validateProjectionElement(value, shape, depth);

		} else {

			return collect(Object.fromEntries(Object.keys(value)
				.filter(k => !isBinding(k))
				.map(k => [k, "expected template identifier or projection binding"])
			));

		}

	}

	/**
	 * Validates a {@link Projection} {@link Query} element: every key a {@link Binding}, each mapping
	 * to a {@link Model} cell (a {@link Placeholder}, {@link Union}, or {@link Locale}).
	 *
	 * Binding identifiers (the part before `=` for computed bindings, or the whole key for plain
	 * identifiers) must be unique within the projection; collisions on the same projected property
	 * are rejected.
	 */
	function validateProjectionElement(
		value: Record<string, unknown>,
		shape: ResourceShape,
		depth: number | undefined
	): undefined | Trace {

		const ids = Object.keys(value).map(projection);
		const duplicates = new Set(ids.filter((id, i) => ids.indexOf(id) !== i));

		return collect(Object.fromEntries(Object.entries(value).map(([k, v]) => {

			const id = projection(k);

			return duplicates.has(id)
				? [k, `duplicate projection identifier <${id}>`]
				: [k, validateProjectionEntry(k, v, shape, depth)];

		})));


		function projection(key: string): string { // noinspection PointlessBitwiseExpressionJS
			return key.slice(0, key.indexOf("=")>>>0);
		}

	}

	/**
	 * Validates the optional second {@link Query} tuple element as a {@link Selection}.
	 *
	 * Every key must be a {@link Selection} operator (gated by {@link isSelector}) dispatched through
	 * {@link validateSelectionEntry}; a non-operator key is rejected.
	 */
	function validateSelection(
		value: unknown,
		variants: readonly ValuesShape[],
		depth: number | undefined
	): undefined | Trace {

		if ( isObject(value) ) {

			return collect(Object.fromEntries(Object.entries(value).map(([k, v]) => isSelector(k)
				? [k, validateSelectionEntry(k, v, variants, { depth, plain, limit })]
				: [k, "expected selection operator"]
			)));

		} else {

			return "expected selection object";

		}


		/**
		 * Validates a single {@link Selection} operator entry.
		 *
		 * Callers gate on {@link isSelector} before dispatching, so `key` is normally a well-formed
		 * selector probe. Checks the entry against the per-operator value domain: the shape-independent
		 * operators `@` (non-negative integer offset) and `#` (non-negative integer limit) are validated
		 * directly; the path-bearing
		 * operators `<`, `>`, `<=`, `>=`, `~`, `?`, `!`, `+`, `^` resolve their probe path through
		 * {@link apply} and dispatch the value through a shape-kind-appropriate check. The matching and
		 * filtering operators (`<`/`>`/`<=`/`>=`, `~`, `?`/`!`) accept a coalesced localised target at any
		 * cardinality, matched existentially over its coalesced value set. Sort `^` validates the
		 * `"asc"` / `"desc"` / number operand and additionally requires a single-valued key: a multi-valued
		 * path is rejected unless reduced through a `min`/`max` aggregate. A coalesced localised key
		 * qualifies only when it resolves single-valued (a single-string-per-tag leaf with no multi-valued
		 * prefix); behind a multi-valued prefix the path product makes it multi-valued and it is rejected.
		 * The `opts` gates are enforced up-front: path length against `depth`, aggregate
		 * transforms against `plain`. When the probe fails to resolve in every variant,
		 * {@link apply}'s atomic trace is surfaced as the per-key entry without further dispatch. Defensive
		 * against divergence between qest's {@link isSelector} and {@link decodeProbe}: any decoder failure
		 * surfaces as a single per-key trace entry carrying the decoder's error.
		 *
		 * @param key The selection operator key
		 * @param value The operand paired with the key
		 * @param variants The element's reachable value shapes; the selector sub-path resolves against each and
		 *     the operator is checked existentially over the enveloped survivors

		 * @param opts Optional well-formedness gates
		 * @param opts.depth Caps probe path length; longer paths surface as `exceeded maximum path length`
		 * @param opts.plain When `true`, rejects aggregate transforms as `disabled aggregate transforms`
		 * @param opts.limit Caps the `#` pagination operand; a client `#` of `0` or greater than `limit`
		 *     surfaces as `exceeded maximum result set limit <limit>`
		 *
		 * @returns A trace describing the violation, or `undefined` when the entry passes
		 */
		function validateSelectionEntry(key: string, value: unknown, variants: readonly ValuesShape[], opts?: {

			readonly plain?: boolean;
			readonly depth?: number;
			readonly limit?: number;

		}): undefined | Trace {

			const { depth, plain, limit } = opts ?? {};

			try {

				const probe = decodeProbe(key);

				// resolve the selector sub-path against each element variant and envelope the survivors: the
				// operator is checked existentially over the union of reachable variants (SHACL sh:or)

				const reached = variants.map(variant => apply(probe, variant));
				const focuses = reached.filter((r): r is RangeShape => !isString(r) && r.kind === "range");

				const range: undefined | RangeShape | Extract<Trace, string> = focuses.length > 0
					? {
						kind: "range",
						maxCount: focuses.map(f => f.maxCount).reduce((a, b) =>
							a === undefined || b === undefined ? undefined : Math.max(a, b)),
						variants: focuses.flatMap(f => f.variants)
					}
					: reached.find(isString);

				if ( depth !== undefined && probe.path.length > depth ) {

					return "exceeded maximum path length";

				} else if ( plain && probe.pipe.some(isAggregate) ) {

					return "disabled aggregate transforms";

				} else if ( isString(range) ) { // error trace

					return range;

				} else if ( range === undefined ) {

					// an absent shape or a statically known undefined value (a processing-space literal transformed
					// outside its domain): no shape to constrain, so every constraint check is vacuously valid

					return undefined;

				} else {

					const { variants } = range;

					switch ( probe.target ) {

						// filtering

						case "<":
						case ">":
						case "<=":
						case ">=":

							return validateLimit(value, variants);

						case "~":

							return validateKeywords(value, variants);

						case "?":
						case "!":

							// set matching is an existential equality check over the option set, valid for
							// single- or multi-valued targets

							return validateOptions(value, variants);

						// sorting

						case "+":

							// the matching and filtering operators above accept a coalesced localised target at
							// any cardinality (existential); sort focus ranks one value per resource, so it is
							// the surviving single-valued gate and rejects a multi-valued key

							return range?.maxCount === 1
								? validateOptions(value, variants)
								: "expected single-valued sort focus key";

						case "^":

							return validateOrder(value, range);

						// paging

						case "@":

							return !isNumber(value) ? "expected number value"
								: !Number.isInteger(value) || value < 0 ? "expected non-negative integer"
									: undefined;

						case "#":

							// under a positive `limit`, reject a client `#` of `0` (unbounded) or above the cap

							return !isNumber(value) ? "expected number value"
								: !Number.isInteger(value) || value < 0 ? "expected non-negative integer"
									: limit && (value === 0 || value > limit) // limit === 0 effectively unbounded
										? `exceeded maximum result set limit <${limit}>`
										: undefined;

						default:

							return "expected selection operator";

					}
				}

			} catch ( e ) {

				return message(e);

			}

		}


		function validateLimit(value: unknown, variants: readonly ValuesShape[]): undefined | Trace {

			// empty variants: no shape to constrain (absent or statically null), template immaterial

			if ( variants.length === 0 ) {

				return undefined;

			} else if ( variants.length > 1 ) {

				return variants.some(variant => validateLimit(value, [variant]) === undefined)
					? undefined : "expected limit matching at least a union variant";

			} else {

				const [shape] = variants;

				switch ( shape.kind ) {

					case "boolean":

						return isBoolean(value) ? undefined
							: `expected <${shape.kind}> value`;

					case "number":

						return isNumber(value) ? undefined
							: `expected <${shape.kind}> value`;

					case "string":

						return isString(value) ? undefined
							: `expected <${shape.kind}> value`;

					case "text":  // a localised property coalesces to a string set the bound filters existentially

						return isString(value) ? undefined : "expected string value";

					case "reference":
					case "resource":

						return `unsupported constraint for <${shape.kind}> value`;

				}

			}

		}

		function validateKeywords(value: unknown, variants: readonly ValuesShape[]): undefined | Trace {

			if ( variants.length === 0 ) {

				return undefined;

			} else if ( variants.length > 1 ) {

				return variants.some(variant => validateKeywords(value, [variant]) === undefined)
					? undefined : "expected keywords matching at least a union variant";

			} else {

				const [shape] = variants;

				switch ( shape.kind ) {

					case "string":

						return isString(value) ? undefined : "expected string value";

					case "text": // `~` searches the coalesced string set of a localised property existentially

						return isString(value) ? undefined : "expected string value";

					case "boolean":
					case "number":
					case "reference":
					case "resource":

						return `unsupported constraint for <${shape.kind}> value`;

				}

			}

		}

		function validateOptions(value: unknown, variants: readonly ValuesShape[]): undefined | Trace {

			if ( variants.length === 0 ) {

				return undefined;

			} else if ( variants.length > 1 ) {

				// per-branch admissibility: each option independently matches at least one declared
				// variant, so a mixed-type set may select different branches per option; a null
				// option is typeless and exempt (it matches within every variant arm)

				function matches(option: unknown): boolean {
					return variants.some(variant => validateOptions(option, [variant]) === undefined);
				}

				return isArray(value)
					? collect(Object.fromEntries(value.map((option, index) => [`[${index}]`,
						matches(option) || "expected option matching at least a union variant"
					])))
					: matches(value) ? undefined
						: "expected option matching at least a union variant";

			} else {

				const [shape] = variants;

				if ( shape.kind === "text" ) {

					// the tag map is the structural option (both arms); coalescing also admits a plain-string
					// option (single or array), matched existentially over the coalesced value set; plain and
					// tagged options MUST NOT be mixed within a set

					return value === null ? undefined
						: isObject(value) ? validateText([value], shape)
							: isArray(value) && value.some(v => isObject(v)) && value.some(v => isString(v))
								? "mixed plain and tagged options"
								: isString(value) || isArray(value, isString) ? undefined
									: `unsupported constraint for <${shape.kind}> value`;

				} else if ( isArray(value) ) {

					return collect(Object.fromEntries(value.map((element, index) =>
						[`[${index}]`, validateOption(element, shape)]
					)));

				} else {

					return validateOption(value, shape);

				}

			}

		}

		function validateOption(value: unknown, shape: ValueShape): undefined | Trace {

			if ( value === null ) {

				return undefined; // null is a valid option for any value type

			} else {

				switch ( shape.kind ) {

					case "boolean":

						return isBoolean(value) ? undefined
							: `expected <${shape.kind}> value`;

					case "number":

						return isNumber(value) ? undefined
							: `expected <${shape.kind}> value`;

					case "string":

						return isString(value) ? undefined
							: `expected <${shape.kind}> value`;

					case "reference":
					case "resource":

						return isReference(value) ? undefined
							: `expected <reference> value`;

				}

			}

		}

		function validateOrder(value: unknown, range: undefined | RangeShape): undefined | Trace {

			if ( value !== "asc" && value !== "desc" && !Number.isInteger(value) ) {

				// order is a 1-based precedence rank (`asc`/`desc` abbreviate `+1`/`-1`), so a
				// fractional value is meaningless

				return "expected <asc>, <desc>, or integer value";

			} else if ( range !== undefined && range.maxCount !== 1 ) {

				// a bare `^` requires a single-valued sort key; a coalesced localised key qualifies only
				// when it resolves single-valued (a single-string-per-tag leaf), a multi-valued prefix
				// having multiplied it into the path product

				return "expected single-valued sort key";

			} else {

				return undefined;

			}

		}

	}


	/**
	 * Validates a {@link Union} template against a union shape.
	 *
	 * A `Union` is an object whose keys are canonical non-negative integer strings, each indexing a
	 * variant in the shape's declared ordering and mapping to the per-branch {@link Placeholder} to
	 * retrieve. Any subset of the variants may appear; an empty object carries no retrieval
	 * instructions and is elided. Out-of-range indices are rejected.
	 *
	 * Callers gate on {@link isUnion} (every key a canonical integer), so non-union forms never
	 * reach here: a plain {@link Placeholder} over a union slot is rejected by the caller, the indexed
	 * form being the only way to address a union-typed property.
	 */
	function validateUnion(
		value: Record<string, unknown>,
		variants: readonly ValuesShape[],
		validateBranch: (value: unknown, variant: ValuesShape) => undefined | Trace
	): undefined | Trace {

		return collect(Object.fromEntries(Object.keys(value).map(k => {

			const index = Number(k);

			return index >= variants.length
				? [k, `expected variant index in [0, ${variants.length})`]
				: [k, validateBranch(value[k], variants[index])];

		})));

	}


	function isUnion(value: unknown): value is Record<string, unknown> {

		return isObject(value) && Object.keys(value).every(key => isUnionIndex(key));

	}

	function validateTemplateEntry(
		key: string,
		value: unknown,
		shape: ResourceShape,
		depth: number | undefined
	): undefined | Trace {

		// per qest: `Template = { [Identifier]: undefined | Placeholders }`; undefined marks
		// an optional slot that exists in the schema but may be absent at runtime

		if ( value === undefined ) {

			return undefined;

		} else {

			const range = apply({ target: key, pipe: [], path: [key] }, shape);

			return isString(range) ? range // error trace
				: range.kind === "null" ? undefined // accepted probe resolving to a known undefined value
					: validatePlaceholders(value, range, depth);

		}

	}

	function validateProjectionEntry(
		key: string,
		value: unknown,
		shape: ResourceShape,
		depth: number | undefined
	): undefined | Trace {

		// per qest: `Projection = { [Binding]: undefined | Model }` (Model = Placeholder | Union | Locale);
		// undefined marks an optional binding elided at construction time (for example,
		// conditionally included aggregates); a localised cell carries a Locale map whose per-tag value
		// is pinned to the property's per-tag cardinality (qest §5.3), yielding one cell per row

		if ( value === undefined ) {

			return undefined;

		}

		try {

			const probe = decodeProbe(key);

			if ( depth !== undefined && probe.path.length > depth ) {

				return "exceeded maximum path length";

			} else if ( plain && probe.pipe.some(isAggregate) ) {

				return "disabled aggregate transforms";

			} else {

				const range = apply(probe, shape);

				// the coalesced array placeholder `[""]` over an array-per-tag localised target is the only
				// array admitted in a projection value; any other tuple is rejected before dispatch

				return isString(range) ? range : // error trace
					range.kind === "null" ? undefined : // accepted probe resolving to a known undefined value
						isArray(value) && !(
							range.variants.length === 1 && range.variants[0].kind === "text" && range.maxCount !== 1
						)
							? "unexpected tuple in projection value"
							: validateProjectionRange(value, range, depth);

			}

		} catch ( e ) {

			return message(e);

		}


		// Projection: value is a single Placeholder, so validatePlaceholder handles the literal /
		// reference / template case directly; union and localised resolved ranges are dispatched here
		// since validatePlaceholder mirrors the `Placeholder = Literal | Reference | Template` type
		// definition and intentionally has no cases for them. Per qest's `Projection` type, a
		// localised cell carries a Locale map whose per-tag value is pinned to the property's per-tag
		// cardinality (qest §5.3); the structural map is one cell, fanning out at the row level, not per-tag

		function validateProjectionRange(
			value: unknown,
			range: RangeShape,
			depth: number | undefined
		): undefined | Trace {

			const { variants } = range;

			if ( variants.length > 1 ) {

				// a union-typed binding takes the indexed form, one placeholder per branch; a plain
				// placeholder is rejected

				return isUnion(value)
					? validateUnion(value, variants, (v, variant) =>
						validateProjectionRange(v, { ...range, variants: [variant] }, depth))
					: "expected union form";

			}

			const [shape] = variants;

			if ( shape.kind === "text" ) {

				// both the coalesced placeholder and the structural tag-map are pinned to the property's
				// per-tag cardinality (qest §5.3): single-string-per-tag takes a bare string or a
				// single-string map; array-per-tag takes a single-element string array (`[""]`) or a
				// singleton-tuple map

				const single = range.maxCount === 1;

				return single
					? validateLocaleString(value)
					: validateLocaleStrings(value);

			} else {

				return collect(wrap(validatePlaceholder(value, shape, depth)));

			}

		}

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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

		const parents = [shape.extends ?? []].flat().map(p => eager(p));

		const merged = mergeResource(shape, parents.reduce(mergeResource, {

			kind: "resource",
			model: {},

			properties: {}

		}));

		const trace = collect({

			...wrap(checkParents(shape, parents)),
			...wrap(checkSingletons(Object.values(merged.properties))),
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
							range: { ...range, shape: { ...inner, shape: () => eager(inner.shape) } }
						}];

					case "union":

						return [name, {
							...entry, range: {
								...range,
								shape: {
									...inner,
									variants: inner.variants.map(variant =>
										variant.kind === "resource" ? flatten(variant) : variant
									)
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
 * Post-processes a validated retrieval template to enforce server-side policies that cannot be
 * expressed as pure structural constraints.
 *
 * Drives a shape-aware recursive descent that mirrors {@link validateTemplate}'s dispatch: each
 * template slot is resolved to its effective {@link RangeShape} via {@link apply} and visited under its
 * declared cardinality and form (scalar / collection, plain / indexed union, localised). A
 * collection is a one- or two-element `[element, Selection?]` tuple; descent into nested templates
 * follows the leading element (keyed by identifier-initial keys: both plain
 * {@link https://www.w3.org/TR/xml/#NT-Name | identifiers} and `identifier=expression` projection
 * bindings), while the optional second {@link Selection} element is left to the policy rewrites.
 *
 * The walk itself is policy-agnostic and can host additional rewrites; the {@link opts} record is
 * shaped as a bag of independent enforcement switches so that new policies can be layered without
 * disturbing the traversal scaffold. When every switch is omitted the input is returned unchanged.
 *
 * Assumes `value` has already been validated against `shape`; malformed inputs are returned
 * unchanged rather than flagged.
 *
 * ## Policies
 *
 * ### `limit` — default pagination constraint
 *
 * Injects `#: limit` into the {@link Selection} slot of every collection placeholder that does not
 * already specify a `#` constraint, forcing a bounded result set even when the client omits
 * pagination. Each collection is normalised to a two-element `[element, Selection]` tuple with the
 * limit carried in the second slot. Rewrites by slot kind:
 *
 * - **object collections** ({@link ResourceShape | resource} / {@link Reference | reference} with
 *   nested template) — the element template is recursed into (so inner nested collections are
 *   enforced independently) and `#: limit` is added to the tuple's Selection slot when absent
 * - **primitive collections** (e.g. `[""]`, `[0]`, `[false]`) — the bare element is preserved and
 *   `#: limit` is added in the Selection slot: `["", { "#": limit }]`
 * - **bare IRI reference collections** — the bare IRI element is preserved and `#: limit` is added
 *   in the Selection slot
 * - **collection unions** — canonical variant-index entries (`{ "0": …, "1": …, … }`) recurse into
 *   each branch with its matching variant shape, and `#: limit` is added in the Selection slot
 * - **scalar (`maxCount === 1`) slots** — returned unchanged at the slot level (pagination is a
 *   collection concern) but recursed into when the payload is a nested template
 * - **localised slots** — returned unchanged at every cardinality, since `#` cannot attach to a
 *   locale template
 *
 * @param value The validated template to enforce
 * @param shape The resource shape the template was validated against
 * @param opts Enforcement options; all entries are optional and independently applied
 * @param opts.limit The pagination limit to inject as the default `#` constraint; if omitted,
 *     no `#` rewrites are performed
 *
 * @returns A structurally equivalent template with enforced policies applied
 */
export function enforce(value: unknown, shape: ResourceShape, {

	limit

}: {

	readonly limit?: number

} = {}): unknown {

	return limit
		? walkTemplate(value, shape) // a `0` or omitted limit is unbounded: no injection
		: value;


	function walkTemplate(value: unknown, shape: ResourceShape): unknown {

		if ( isObject(value) ) {

			return Object.fromEntries(Object.entries(value).map(([k, v]) => {

				const range = apply(decodeProbe(k), shape);

				// only a resolved RangeShape carries something to walk; a trace or absent range leaves the value as-is

				return [k, isObject(range) && range.kind === "range" ? walkRange(v, range) : v];

			}));

		} else {

			return value;

		}

	}

	function walkRange(value: unknown, range: RangeShape): unknown {

		const { variants, maxCount } = range;
		const [variant] = variants;

		return variants.length > 1 ? walkUnion(value, variants, maxCount === 1)
			: variant.kind === "text" ? value
				: maxCount === 1 ? walkNested(value, variant)
					: isArray(value) ? [walkNested(value[0], variant), limitSelection(value[1])]
						: value;

	}

	function walkNested(value: unknown, shape: ValuesShape): unknown {

		// a single-variant union flattens to a length-1 RangeShape, so its indexed-form payload (`{ "0": … }`)
		// arrives here rather than through walkUnion; hand it to the union unwrapper

		return isUnion(value) ? walkVariants(value, [shape])
			: shape.kind === "resource" && isObject(value) ? walkTemplate(value, shape)
				: shape.kind === "reference" && isObject(value) ? walkTemplate(value, eager(shape.shape))
					: value;

	}

	function walkUnion(value: unknown, variants: readonly ValuesShape[], scalar: boolean): unknown {

		return scalar ? walkVariants(value, variants)
			: isArray(value) ? [walkVariants(value[0], variants), limitSelection(value[1])]
				: value;

	}

	function walkVariants(value: unknown, variants: readonly ValuesShape[]): unknown {

		// recurse canonical variant indices into their branch; other keys pass through unchanged

		if ( isObject(value) ) {

			return Object.fromEntries(Object.entries(value).map(([k, v]) =>
				isUnionIndex(k) && Number(k) < variants.length
					? [k, walkNested(v, variants[Number(k)])]
					: [k, v]
			));

		} else {

			return value;

		}

	}


	function limitSelection(selection: unknown): object {

		return isObject(selection)
			? "#" in selection ? selection : { ...selection, "#": limit }
			: { "#": limit };

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Tests whether a shape accepts a nested Resource value, directly (`reference` / `resource`
 * kinds) or as a variant of a union. Used to gate the `{}` absence rule at property-value
 * validation.
 *
 * @param shape The shape to test
 *
 * @returns `true` if the shape admits a nested Resource value
 */
function acceptsResource(shape: Shape): boolean {

	return shape.kind === "reference"
		|| shape.kind === "resource"
		|| shape.kind === "union" && shape.variants.some(v =>
			v.kind === "reference" || v.kind === "resource"
		);

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
