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

import {
	type Identifier,
	isArray,
	isBoolean,
	isIdentifier,
	isNumber,
	isObject,
	isString,
	type Lazy
} from "@metreeca/core";
import { equals, immutable, seal } from "@metreeca/core/deep";
import { isTagRange, matchTag } from "@metreeca/core/language";
import { type IRI, isIRI } from "@metreeca/core/resource";
import { defaultBase, isReference, type Reference } from "@metreeca/qest";
import { type Resource } from "@metreeca/qest/resource";
import {
	type Binding,
	decodeProbe,
	isAggregate,
	isBinding,
	isQuery,
	isSelector,
	isTemplate,
	isUnion,
	isUnionKey,
	isVacuous,
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
import { validateBoolean } from "./boolean.core.js";
import { collect, normalise, TraceError, wrap } from "./index.core.js";
import type { Trace } from "./index.js";
import { validateNumber } from "./number.core.js";
import { getShapeTarget, validateReference } from "./reference.core.js";
import { type ReferenceShape } from "./reference.js";
import type { Property, ResourceShape } from "./resource.js";
import { validateString } from "./string.core.js";
import { validateLocaleString, validateLocaleStrings, validateText, validateTextSet } from "./text.core.js";
import type { TextShape } from "./text.js";
import { getShapeVariants, validateUnion } from "./union.core.js";
import {
	deriveValues,
	eager,
	effective,
	getMultiVariants,
	mergeValues,
	narrowsValues,
	validateValue
} from "./value.core.js";
import { type RangeShape, type SetShape, type Shape, type ValueShape, type ValuesShape } from "./value.js";


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
 * Inherit fields (`namespace` on resources; `hidden`, `computed` on entries) require all sibling
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

		"{namespace}": shape.namespace !== undefined
			|| parents.every(p => p.namespace?.[""] === parents[0].namespace?.[""])
			|| `conflicting parent values <${parents[0].namespace?.[""]}>  vs <${parents.find(p =>
				p.namespace?.[""] !== parents[0].namespace?.[""])?.namespace?.[""]
			}>  without child override`,

		// property-level inherit fields

		...Object.fromEntries([...new Set(parents.flatMap(p => Object.keys(p.entries)))]

			// skip entries defined by a single parent: no conflict possible

			.filter(key => parents.filter(p => p.entries[key]?.kind === "property").length > 1)

			.flatMap(key => {

				const override = shape.entries[key]?.kind === "property" ? shape.entries[key] : undefined;
				const inherited = parents.map(p => p.entries[key]).filter(e => e?.kind === "property");

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
 * Checks that at most one `id` entry and at most one `type` entry exist across all entries.
 *
 * This check applies to the full set of entries after inheritance merging, ensuring that
 * singleton entries are not duplicated across the inheritance hierarchy.
 *
 * @param properties The merged property entries to check
 *
 * @returns A keyed trace of violations, or `undefined` if no duplicates exist
 */
export function checkSingletons(properties: readonly { readonly kind?: string }[]): undefined | Trace {

	return collect({

		"{id}": properties.filter(p => p.kind === "id").length <= 1
			|| `duplicate entry (<${properties.filter(p => p.kind === "id").length}> found)`,

		"{type}": properties.filter(p => p.kind === "type").length <= 1
			|| `duplicate entry (<${properties.filter(p => p.kind === "type").length}> found)`

	});

}

/**
 * Checks for duplicate predicate IRIs across entries in a flattened resource shape.
 *
 * Forward and reverse predicates are checked independently: the same IRI may appear in both sets without conflict,
 * but no two entries may share the same forward IRI, and no two may share the same reverse IRI.
 *
 * @param shape The flattened resource shape to check
 *
 * @returns A keyed trace of violations, or `undefined` if no duplicates exist
 */
export function checkPredicates(shape: ResourceShape): undefined | Trace {

	const properties = Object.entries(shape.entries)
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
 * Checks that no property embeds a resource shape declaring an identifier.
 *
 * An embedded (inline `resource`-kind) range has no independent identity, so it must not declare a `kind: "id"`
 * property. A standalone resource or a reference target legitimately carries one and is not flagged; union ranges are
 * inspected per variant. Only the shape's own entries are examined, since every embedded resource is itself checked
 * when {@link validateResource} recurses into it.
 *
 * This check runs in {@link validateResource} against an actual resource state, not in {@link flatten} at construction.
 * At construction an id-bearing `resource`-kind range cannot be told apart from an expanded reference, whose target
 * legitimately carries an id; the two are distinguishable only once a concrete state value is checked against the
 * shape.
 *
 * @param shape The flattened resource shape to check
 *
 * @returns A keyed trace of violations, or `undefined` if no embedded resource declares an identifier
 */
export function checkId(shape: ResourceShape): undefined | Trace {

	return collect(Object.fromEntries(Object.entries(shape.entries)
		.filter((e): e is [string, Property] => e[1].kind === "property")
		.flatMap(([name, { range }]) => getShapeVariants(range.shape)
			.filter(s => s.kind === "resource")
			.filter(s => getShapeId(s) !== undefined)
			.map(() => [`{${name}}`, `unexpected <id> entry in embedded resource`])
		)
	));

}

/**
 * Checks that a shape declaring a `type` property also declares a target `class`.
 *
 * A `type` value materialises the resource's own declared class, so a shape carrying a `kind: "type"` property but no
 * own `class` has nothing to match that value against and is rejected: a type field may not be declared without a
 * class. Inherited classes (`classes`) are ignored; each shape declares its own class.
 *
 * @param shape The flattened resource shape to check
 *
 * @returns A keyed trace of violations, or `undefined` when no type property lacks a declared class
 */
export function checkType(shape: ResourceShape): undefined | Trace {

	return collect({

		"{class}": shape.class !== undefined
			|| !Object.values(shape.entries).some(p => p.kind === "type")
			|| `<type> property without a declared class`

	});

}


/**
 * Reports whether a target IRI pattern narrows a source pattern.
 *
 * Only trailing `/*` wildcards admit narrowing: the target may replace `/*` with more specific segments, provided the
 * fixed prefix matches. All other cases require exact equality.
 *
 * @param target The overriding child pattern
 * @param source The inherited parent pattern
 *
 * @returns `true` if the target narrows or equals the source
 */
function narrowsPattern(target: string, source: string): boolean {

	return target === source ? true
		: source.endsWith("/*") ? target.startsWith(source.slice(0, -1))
			: false;

}

/**
 * Reports whether an overriding resource shape narrows an inherited base shape.
 *
 * Tests the override relation without building the merged shape: returns `undefined` when the `pattern` stays
 * compatible, the `in` intersection is non-empty, every shared entry keeps its kind and (for `property` entries)
 * narrows via {@link narrowsProperty}, and the merged constraints stay consistent; returns a keyed {@link Trace} of
 * obstacles otherwise.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns A keyed trace of narrowing obstacles, or `undefined` when `target` narrows `source`
 */
export function narrowsResource(target: ResourceShape, source: ResourceShape): undefined | Trace {

	// conjunctive: in — intersection

	const allowed = target.in !== undefined && source.in !== undefined
		? target.in.filter(v => source.in!.includes(v))
		: target.in ?? source.in;

	// conjunctive: hasValue — union

	const hasValue = target.hasValue !== undefined && source.hasValue !== undefined
		? [...new Set([...target.hasValue, ...source.hasValue])]
		: target.hasValue ?? source.hasValue;

	const keys = [...new Set([

		...Object.keys(target.entries),
		...Object.keys(source.entries)

	])];

	return collect({

		// conjunctive: pattern — IRI pattern compatibility

		"{pattern}": target.pattern === undefined || source.pattern === undefined
			|| narrowsPattern(target.pattern, source.pattern)
			|| `incompatible IRI templates <${target.pattern}> and <${source.pattern}>`,

		// conjunctive: in — empty intersection

		"{in}": target.in === undefined || source.in === undefined
			|| allowed!.length !== 0
			|| `disjoint sets [${target.in}] and [${source.in}]`,

		// per shared entry: kind must match, and property entries must narrow

		...Object.fromEntries(keys.flatMap((key): (readonly [string, undefined | Trace])[] => {

			const t = target.entries[key];
			const s = source.entries[key];

			return t === undefined || s === undefined ? []
				: t.kind !== s.kind ? [[`{${key}}`, `mismatched entry kinds <${t.kind}> vs <${s.kind}>`]]
					: t.kind === "property" && s.kind === "property" ? [[`{${key}}`, narrowsProperty(t, s)]]
						: [];

		})),

		// post-merge constraint consistency

		...wrap(checkResource({

			in: allowed,
			hasValue

		}))

	});

}

/**
 * Reports whether an overriding property narrows an inherited base property.
 *
 * Tests the override relation without building the merged property: returns `undefined` when the non-overridable
 * fields (`name`, `description`, `forward`, `reverse`) are not redefined and the child `range` narrows the base range
 * via {@link narrowsValues}; returns a keyed {@link Trace} of obstacles otherwise.
 *
 * @param target The overriding child property
 * @param source The inherited parent property
 *
 * @returns A keyed trace of narrowing obstacles, or `undefined` when `target` narrows `source`
 */
export function narrowsProperty(target: Property, source: Property): undefined | Trace {

	return collect({

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
			|| `unexpected <reverse> redefinition`,

		// range: child range must narrow the base range

		"{range}": narrowsValues(target.range, source.range)

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

	const trace = narrowsResource(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible resource shape override", trace);
	}

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

	// conjunctive: entries — union with per-key merge

	const keys = [...new Set([

		...Object.keys(target.entries),
		...Object.keys(source.entries)

	])];

	const properties = Object.fromEntries(keys.map(key => {

		const t = target.entries[key];
		const s = source.entries[key];

		if ( t === undefined || s === undefined ) {

			return [key, t ?? s];

		} else if ( t.kind === "property" && s.kind === "property" ) {

			return [key, mergeProperty(t, s)];

		} else {

			return [key, t]; // immutable (id/type) or validated by narrowsResource

		}

	}));

	// build shape — casts are safe: non-emptiness validated above

	return immutable({

		kind: target.kind,

		model: {

			...source.model,

			...Object.fromEntries(Object.entries(properties).map(([name, entry]) => [name,
				entry.kind === "id" || entry.kind === "type" ? defaultBase : entry.range.model
			]))

		} as Template,

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

		entries: properties

	});

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

	const trace = narrowsProperty(target, source);

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


/**
 * Derives the retrieval template for a resource shape.
 *
 * Projects each property to its retrieval placeholder, deriving the per-property value through
 * {@link value!deriveValue | deriveValue}; `id` and `type` entries project the {@link defaultBase}. Cardinality
 * wrapping (a scalar for `maxCount === 1`, otherwise a singleton `[value]` tuple carrying any selection) and the
 * per-tag localised form mirror the {@link value!cardinality | cardinality} projection.
 *
 * @param shape The resource shape whose template to derive
 *
 * @returns The derived resource template
 */
export function deriveResource(shape: ResourceShape) {

	return immutable(Object.fromEntries(Object.entries(shape.entries).map(([name, entry]) =>
		[name, entry.kind === "id" || entry.kind === "type" ? defaultBase : deriveValues(entry.range)]
	)));

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
 * Foreign reference entries (and unions whose variants are *all* foreign references)
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
 * An embedded (inline, non-reference) resource state may not carry an `id`: embedded resources have
 * no independent identity, so a nested state bearing an identifier is rejected here. This check is
 * deferred to validation rather than shape construction because an id-bearing embedded range is
 * indistinguishable from an expanded captive reference target until a state is checked against it.
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

	return collect({

		// embedded-resource id rejection runs here against the state, not in flatten (see checkId)

		...wrap(checkId(shape)),

		"{kind}": mistyped === 0
			|| `expected <${shape.kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		...Object.fromEntries(matching.map((resource, index) => [key(resource, shape, index),

			collect(Object.fromEntries([

				// property validation — validate merged shape entries

				...Object.entries(shape.entries).map(([name, declared]) => [name,
					declared.kind === "id" ? validateId(resource[name], shape, entry)
						: declared.kind === "type" ? validateType(resource[name], shape)
							: declared.kind === "property" ? validateProperty(resource[name], declared, depth)
								: undefined
				]),

				// envelope validation — reject unknown entries

				...Object.keys(resource)
					.filter(key => !Object.hasOwn(shape.entries, key))
					.map(key => [key, "unexpected property"]),

				// custom validators // ;(cast) object confirmed by isObject; the validator owns its own shape checks

				...(shape.validators ?? [])
					.map(validator => [validator.name, normalise(validator(resource as Resource))] as const)
					.filter(([, trace]) => trace !== undefined)
					.map(([name, trace], i) => [`{${name || `validator[${i}]`}}`, trace])

			]))

		]))

	});


	function validateProperty(value: unknown, { range }: Property, depth: undefined | number): undefined | Trace {

		const { shape } = range;

		// foreign references belong to the target resource, not the source state: reject a present
		// value, pruning foreign variants from a union and rejecting a wholly-foreign one

		if ( shape.kind === "union" ) {

			const owned = shape.variants.filter(v => !(v.kind === "reference" && v.foreign));

			return owned.length > 0 ? validateValues(value, { ...range, shape: { ...shape, variants: owned } }, depth)
				: value !== undefined ? "unexpected foreign property"
					: undefined;

		} else if ( shape.kind === "reference" && shape.foreign ) {

			return value !== undefined
				? "unexpected foreign property"
				: undefined;

		} else {

			return validateValues(value, range, depth);

		}

	}

	function validateValues(value: unknown, {

		minCount,
		maxCount,

		shape

	}: SetShape, depth: undefined | number): undefined | Trace {

		const effective = value === undefined || isArray(value, []) ? undefined : value;

		if ( shape.kind === "text" ) {

			return validateTextSet(effective, { minCount, maxCount }, shape);

		} else {

			// an empty object counts as absence for a nesting shape

			const present = isObject(effective, {}) && isNesting(shape) ? undefined : effective;

			// the values to validate; a nesting shape drops empty-object elements as absence

			const values = present === undefined ? []
				: !isArray(present) ? [present]
					: isNesting(shape) ? present.filter(v => !isObject(v, {}))
						: present;

			const arity = maxCount === 1
				? isArray(present)
					? collect({ "{kind}": "expected scalar value" })
					: undefined
				: present !== undefined && !isArray(present)
					? collect({ "{kind}": "expected array value" })
					: undefined;

			// report the arity error first, then per-value errors, then cardinality

			return arity
				?? validateValueSet(values, shape, depth)
				?? collect({

					"{minCount}": minCount === undefined || values.length >= minCount
						|| `expected at least <${minCount}> value(s)`,

					"{maxCount}": maxCount === undefined || values.length <= maxCount
						|| `expected at most <${maxCount}> value(s)`

				});

		}

	}

	function validateValueSet(values: readonly unknown[], shape: Shape, depth: undefined | number): undefined | Trace {

		switch ( shape.kind ) {

			case "reference":

				return shape.captive

					? collect(Object.fromEntries(values.map((value, index) =>
						[`[${index}]`, validateReferenceElement(value, shape, depth)]
					)))

					: validateReference(values, shape);

			case "resource":

				return validateResource(values, shape, { depth });

			case "union":

				return validateUnion(values, shape.variants, {
					match: (value, variant) =>
						variant.kind === "reference" ? validateReferenceElement(value, variant, depth) === undefined
							: variant.kind === "resource" ? validateResource([value], variant, { depth }) === undefined
								: validateValue([value], variant) === undefined
				});

			default:

				return validateValue(values, shape);

		}

	}

	function validateReferenceElement(
		value: unknown,
		shape: ReferenceShape,
		depth: undefined | number
	): undefined | Trace {

		const next = depth === undefined ? undefined : depth-1;

		return !isObject(value) || !shape.captive ? validateReference([value], shape)
			: depth === undefined || depth > 0 ? validateResource([value], eager(shape.shape), { depth: next })
				: "exceeded maximum nesting depth";

	}

}

/**
 * Validates retrieval results against a {@link ResourceShape} narrowed by a retrieval {@link Template}.
 *
 * A `Template`'s keys are plain property {@link Identifier | identifiers} (projection bindings and selection
 * operators belong to a {@link Projection} / {@link Selection} and are validated by {@link validateTemplate},
 * not here). Walks each response and validates every requested key against its declared shape entry, dispatched
 * by kind exactly like {@link validateResource} but narrowed by the key's nested sub-model:
 *
 * - **`id`** — single absolute IRI matching the shape's `pattern` / `in` / `hasValue` constraints and,
 *   when supplied, the `entry` reference
 * - **`type`** — single absolute IRI
 * - **property** — value validated against the property's range narrowed by the nested sub-model in
 *   `model`, with cardinality bounds enforced through the range's `minCount` / `maxCount`
 *
 * A key naming no declared shape entry is a client-side projection error, rejected as an
 * `undefined property`.
 *
 * Reference slots accept either a bare {@link Reference} or an expanded nested resource; expanded
 * resources are validated against the linked resource's target shape narrowed by the nested sub-model
 * in `model`.
 *
 * A localised slot is validated against the form its model requested:
 *
 * - a **coalesced placeholder** (a plain-string model entry `""` for single-string-per-tag, a
 *   single-element string array `[""]` for array-per-tag) requests the coalesced label: the response
 *   is the winning tag's rendered string(s), length-checked against the shape's `minLength` /
 *   `maxLength` per value; `languageIn` is not enforced, since coalescing discards the winning tag,
 *   and a tag-map response is rejected
 * - a **tag-map model** (`{ en: "" }`, `[{ en: "" }]`, or the wildcard `{ "*": "" }`) narrows the
 *   response to the listed tags (any present tag under the wildcard): each requested tag must carry a
 *   string within the shape's `minLength` / `maxLength` bounds and, when `languageIn` is declared, a
 *   tag it admits
 * - any other model keeps the canonical `und`-keyed tag-map contract
 *
 * Differs from {@link validateResource} in three ways:
 *
 * - **Partial resources** — shape constraints on keys absent from `model` are not enforced; unrequested
 *   required fields do not trigger `minCount` violations.
 * - **Expanded nested references** — reference slots accept an expanded nested resource in addition to
 *   a bare IRI, validated against the target shape narrowed by the nested sub-model in `model`.
 * - **Client expectations** — closed-shape enforcement is run against the narrowed surface (the
 *   intersection of `shape` and `model`): entries present in the response but absent from `model`
 *   are rejected as `unexpected property`, even when declared in the full `shape`.
 *
 * Custom {@link ResourceConstraints.validators | validators} declared on the shape run after the
 * structural pass and may attach per-response trace entries keyed by validator name.
 *
 * @param values The response instances to validate
 * @param shape The resource shape defining the admissible surface
 * @param model The retrieval template narrowing the admissibility check
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

	const matching = values.filter(value => isObject(value));
	const mistyped = values.length-matching.length;

	return collect({

		"{kind}": mistyped === 0
			|| `expected <${shape.kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		...Object.fromEntries(matching.map((resource, index) => [key(resource, shape, index),

			collect(Object.fromEntries([

				// requested property validation — one entry per non-vacuous model key; vacuous slots
				// (empty-template `{}` and other elided forms) carry no contract and bypass validation

				...Object.keys(model)
					.filter(k => !isVacuous(model[k]))
					.map(k => {

						const value = resource[k];
						const property = shape.entries[k];
						const nested = model[k];

						return [k, property === undefined ? "undefined property"
							: property.kind === "id" ? validateId(value, shape, entry)
								: property.kind === "type" ? validateType(value, shape)
									: validateRange(value, property.range, nested)
						];

					}),

				// envelope validation — reject response keys absent from the model (client expectations)

				...Object.keys(resource)
					.filter(k => !Object.hasOwn(model, k))
					.map(k => [k, "unexpected property"]),

				// custom validators // ;(cast) object confirmed by isObject; the validator owns its own shape checks

				...(shape.validators ?? [])
					.map(validator => [validator.name, normalise(validator(resource as Resource))] as const)
					.filter(([, trace]) => trace !== undefined)
					.map(([name, trace], i) => [`{${name || `validator[${i}]`}}`, trace])

			]))

		]))

	});


	function validateRange(value: unknown, shape: SetShape, model: unknown): undefined | Trace {

		const variants = getMultiVariants(shape);

		return variants.length === 1 && variants[0].kind === "text"
			? validateLocalised(value, shape, variants[0], model)
			: validateValues(value, shape, model);

	}


	function validateValues(value: unknown, shape: SetShape, model: unknown): undefined | Trace {

		const { minCount, maxCount } = shape;

		const variants = getMultiVariants(shape);
		const nests = variants.some(isNesting);
		const isScalar = maxCount === 1;

		// absence normalisation (mirrors the state-side contract): `undefined`, `[]`, and `{}` on a
		// resource-nesting slot are property omission

		const present = value === undefined
		|| isArray(value) && value.length === 0
		|| isObject(value) && Object.keys(value).length === 0 && nests
			? undefined : value;

		if ( present === undefined ) {

			return minCount !== undefined && minCount >= 1
				? collect({ "{minCount}": `expected at least <${minCount}> value(s)` })
				: undefined;

		} else if ( isScalar === isArray(present) ) {

			// a scalar slot rejects an array and an array slot rejects a scalar

			return collect({ "{kind}": isScalar ? "expected scalar value" : "expected array value" });

		} else {

			// a nesting slot drops empty-object elements as absence before per-element validation

			const elements = (isArray(present) ? present : [present])
				.filter(v => !(nests && isObject(v) && Object.keys(v).length === 0));

			return validateElements(elements, variants, model) ?? collect(validateCardinality(elements.length, shape));

		}

	}

	function validateElements(
		values: readonly unknown[],
		shape: readonly ValuesShape[],
		model: unknown
	): undefined | Trace {

		if ( shape.length !== 1 ) {

			// a disjunction (or empty set): every value must single out exactly one reachable variant

			return collect(Object.fromEntries(values.map((v, i) => [`[${i}]`,
				validateBranch(v, shape, model)
			])));

		}

		const [variant] = shape;

		if ( variant.kind === "reference" ) {

			// a reference admits a bare IRI (legal for its target) or an expanded resource, validated
			// against the target shape narrowed by the nested projection

			return collect(Object.fromEntries(values.map((v, i) => [`[${i}]`,
				isString(v) ? isReference(v) ? undefined : `expected absolute IRI`
					: isObject(v) ? validateResult([v], { shape: eager(variant.shape), model: nestedTemplate(model) })
						: "expected IRI or nested resource"
			])));

		} else if ( variant.kind === "resource" ) {

			// an embedded resource expands inline, validated against the nested projection

			return collect(Object.fromEntries(values.map((v, i) => [`[${i}]`,
				isObject(v) ? validateResult([v], { shape: variant, model: nestedTemplate(model) })
					: "expected nested resource"
			])));

		} else {

			return validateValue(values, variant);

		}

	}

	function validateBranch(
		value: unknown,
		shape: readonly ValuesShape[],
		nested: unknown
	): undefined | Trace {

		// keys are immaterial: a value must single out exactly one variant (`sh:xone`) by shape. A keyed
		// `Union` supplies a per-branch sub-model; a plain projection forwards unchanged to every variant.

		const model = isArray(nested) && nested.length > 0 ? nested[0] : nested;
		const fields: Record<string, unknown> = isObject(model) ? model : {};

		const keys = Object.keys(fields);
		const keyed = keys.length > 0 && keys.some(key => !isIdentifier(key));

		if ( keyed ) {

			// every key must be a structurally valid (canonical integer string) union key

			const malformed = keys.filter(key => !isUnionKey(key));

			if ( malformed.length > 0 ) {

				return collect(Object.fromEntries(malformed.map(key => [key, "expected union variant key"])));

			} else {

				// the value must single out exactly one variant across the listed branches

				return validateUnion(value, shape, {
					match: (value, variant) => keys.some(key => admits(value, variant, fields[key]))
				});

			}

		} else {

			return validateUnion(value, shape, {
				match: (value, variant) => admits(value, variant, nested)
			});

		}


		function admits(value: unknown, variant: ValuesShape, branch: unknown): boolean {

			// admission is a yes/no verdict feeding the `sh:xone` count; the failure traces are immaterial

			switch ( variant.kind ) {

				case "resource": // an embedded resource is addressed only through an object projection

					return isObject(branch) && validateElements([value], [variant], branch) === undefined;

				case "reference": // a reference admits a bare IRI (legal for its target) or an expanded resource

					return !isObject(value)
						? validateValue([value], variant) === undefined
						: validateElements([value], [variant], branch) === undefined;

				default: // a scalar variant is selected only when both the value and the branch placeholder fit it

					return !isObject(branch)
						&& validateValue([value], variant) === undefined
						&& validateValue([branch], variant) === undefined;

			}

		}

	}


	function validateLocalised(
		value: unknown,
		range: SetShape,
		textShape: TextShape,
		model: unknown
	): undefined | Trace {

		// normalise absence (mirrors the state-side contract): `undefined`, `[]`, and an empty map `{}`

		const present = value === undefined
		|| isArray(value) && value.length === 0
		|| isObject(value) && Object.keys(value).length === 0
			? undefined : value;

		// a coalesced model requests the coalesced label (a bare string, or a single-element string array
		// `[""]` for array-per-tag); a tag-map model (`{ en: "" }`, `[{ en: "" }]`, or the wildcard
		// `{ "*": "" }`) narrows to those tags; any other model keeps the canonical `und`-keyed contract

		const coalesced = range.maxCount === 1 ? isString(model) : isArray(model, [isString]);

		// the tag set a tag-map model projects (`"*"` included for the wildcard form); empty otherwise

		const head = isArray(model) ? model[0] : model;
		const tags = isObject(head) ? Object.keys(head).filter(isTagRange) : [];

		return coalesced ? validateCoalesced(present, range, textShape)
			: tags.length > 0 ? validateProjectedText(present, range, textShape, tags)
				: validateTextSet(present, range, textShape);

	}

	function validateCoalesced(present: unknown, range: SetShape, textShape: TextShape): undefined | Trace {

		if ( present === undefined ) {

			return collect(validateCardinality(0, range));

		} else if ( range.maxCount === 1 ) {

			// single-string-per-tag: the one rendered string

			return isString(present) ? validateLength(present, textShape)
				: collect({ "{kind}": "expected coalesced string value" });

		} else {

			// array-per-tag: the winning tag's value set as a string array, length-checked per element

			return isArray<string>(present, isString) ? collect({

				...Object.fromEntries(present.map((element, index) =>
					[`[${index}]`, validateLength(element, textShape)]
				)),

				...validateCardinality(present.length, range)

			}) : collect({ "{kind}": "expected coalesced string array value" });

		}

	}

	function validateProjectedText(
		present: unknown,
		range: SetShape,
		textShape: TextShape,
		tags: readonly string[]
	): undefined | Trace {

		const isScalar = range.maxCount === 1;
		const wildcard = tags.includes("*");
		const explicit = tags.filter(t => t !== "*");

		if ( present === undefined ) {

			return collect(validateCardinality(0, range));

		} else if ( isScalar === isArray(present) ) {

			// a scalar slot rejects an array and an array slot rejects a scalar

			return collect({ "{kind}": isScalar ? "expected scalar value" : "expected array value" });

		} else {

			// drop empty-map elements (`{}`): empty entries carry no contract and skip element-presence checks

			const elements = (isArray(present) ? present : [present])
				.filter(el => !(isObject(el) && Object.keys(el).length === 0));

			return collect({

				...Object.fromEntries(elements.map((el, i) => [`[${i}]`,
					isObject(el)
						? collect(Object.fromEntries((wildcard ? Object.keys(el) : explicit).map(tag =>
							[tag, validateProjectedTag(el[tag], tag, textShape)]
						)))
						: "expected tag-map value"
				])),

				...validateCardinality(elements.length, range)

			});

		}

	}

	function validateProjectedTag(tagValue: unknown, tag: string, {

		minLength,
		maxLength,
		languageIn

	}: TextShape): undefined | Trace {

		return tagValue === undefined ? "missing projected tag"
			: !isString(tagValue) ? "expected string value"
				: collect({

					"{minLength}": minLength === undefined || tagValue.length >= minLength
						|| `expected string length >= <${minLength}>`,

					"{maxLength}": maxLength === undefined || tagValue.length <= maxLength
						|| `expected string length <= <${maxLength}>`,

					"{languageIn}": languageIn === undefined
						|| languageIn.some(range => matchTag(tag, range))
						|| `unsupported tag for allowed languages [${languageIn.join(", ")}]`

				});

	}

	function validateCardinality(count: number, { minCount, maxCount }: SetShape): Record<string, true | Trace> {
		return {

			"{minCount}": minCount === undefined || count >= minCount
				|| `expected at least <${minCount}> value(s)`,

			"{maxCount}": maxCount === undefined || count <= maxCount
				|| `expected at most <${maxCount}> value(s)`

		};
	}

	function validateLength(value: string, { minLength, maxLength }: TextShape): undefined | Trace {
		return collect({

			"{minLength}": minLength === undefined || value.length >= minLength
				|| `expected string length >= <${minLength}>`,

			"{maxLength}": maxLength === undefined || value.length <= maxLength
				|| `expected string length <= <${maxLength}>`

		});
	}


	function nestedTemplate(nested: unknown): Template {

		// unwrap the per-item element of a collection-shaped `Query` placeholder, then narrow to the nested
		// retrieval `Template`; an IRI-only (`""`) or otherwise non-template placeholder projects no nested
		// surface, so every expanded property surfaces as over-fetch against the empty template

		const element = isQuery(nested) ? nested[0] : nested;

		return isTemplate(element) ? element : {};

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
 * - otherwise (some key is not a bare identifier), the element is validated as a {@link Projection};
 *   every key must be an explicit `name=expression` {@link Binding}, and any key that is not a valid
 *   binding (a bare identifier or a stray selection operator) is rejected under its own key
 *
 * Within the projection arm, binding identifiers (the part before `=`) must be unique within the
 * element; collisions on the same projected property are rejected with a `duplicate projection
 * identifier` trace. Projection cells over a localised property carry a `Locale` map whose per-tag
 * value is pinned to the property's per-tag cardinality (single strings for single-string-per-tag,
 * singleton tuples for array-per-tag), or the matching coalesced placeholder; the structural map is
 * one cell, fanning out at the row level rather than per tag (qest §5.3, §5.6).
 *
 * **Selection slot dispatch** — the optional second tuple element is validated as a
 * {@link Selection}: every key must be a selection operator, dispatched by prefix into filtering
 * (`<`, `>`, `<=`, `>=`, `~`, `?`, `!`), ordering (`+`, `^`), and paging (`@`, `#`) validators,
 * mirroring the `isSelector` layout.
 *
 * Value constraints, cardinality bounds, and custom validators are skipped, since a template
 * describes a retrieval projection rather than actual data. Bindings whose probe (`path` and
 * `pipe`) fails to resolve against the shape are rejected with the atomic trace surfaced by
 * {@link effective}; missing entries are accepted as not requested. Property entries may map to
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

	return collect({

		"{kind}": mistyped === 0
			|| `expected <${shape.kind}> values${mistyped > 1 ? ` (${mistyped}/${values.length})` : ""}`,

		...Object.fromEntries(matching.map((template, index) =>
			[key(template, shape, index), validateTemplate(template, shape, depth)]
		))

	});


	function validateTemplate(
		value: unknown,
		shape: ResourceShape,
		depth: undefined | number
	): undefined | Trace {

		if ( !isObject(value) ) {

			return "expected <template> value";

		} else if ( depth !== undefined && depth < 0 ) {

			return "exceeded maximum nesting depth";

		} else {

			return collect(Object.fromEntries(Object.entries(value).map(([k, v]) => {

				if ( !isIdentifier(k) ) {

					return [k, "expected property identifier"];

				} else if ( v === undefined ) {

					return [k, undefined];

				} else if ( !Object.hasOwn(shape.entries, k) ) {

					return [k, "undefined property path"];

				} else {

					const entry = shape.entries[k];

					return [k, entry.kind === "property"
						? validatePlaceholders(v, entry.range, depth)
						: isIRI(v) ? undefined : "expected <IRI> value" // id/type
					];

				}

			})));

		}

	}


	function validatePlaceholders(
		value: unknown,
		shape: SetShape,
		depth: undefined | number
	): undefined | Trace {

		const variants = getMultiVariants(shape);
		const [variant] = variants;

		return shape.maxCount === 1 || variants.length === 1 && variant.kind === "text"
			? validateModel(value, shape, depth)
			: validateQuery(value, shape, depth);

	}

	function validatePlaceholder(
		value: unknown,
		shape: ValueShape,
		depth: undefined | number
	): undefined | Trace {

		const next = depth === undefined ? depth : depth-1;

		switch ( shape.kind ) {

			case "boolean":

				return validateBoolean([value], shape);

			case "number":

				return validateNumber([value], shape, { scope: "model" });

			case "string":

				return validateString([value], shape, { scope: "model" });

			case "reference":

				return isObject(value)
					? validateTemplate(value, eager(shape.shape), next)
					: validateReference([value], shape, { scope: "model" });

			case "resource":

				return validateTemplate(value, shape, next);

		}

	}


	function validateModel(
		value: unknown,
		shape: SetShape | RangeShape,
		depth: undefined | number,
		local: boolean = false
	): undefined | Trace {

		const variants = getMultiVariants(shape);
		const [variant] = variants;

		return variants.length > 1 ? validateUnionValue(value, shape, depth, local)
			: variant.kind === "text" ? validateLocale(value, shape)
				: collect(wrap(validatePlaceholder(value, variant, depth)));

	}

	function validateQuery(
		value: unknown,
		shape: SetShape,
		depth: undefined | number
	): undefined | Trace {

		if ( !isArray(value) || value.length < 1 || value.length > 2 ) {

			return "expected collection tuple <[element, selection?]>";

		} else {

			const [element, selection] = value;

			const elementTrace = validateElement(element, shape, depth);
			const selectionTrace = validateSelection(selection, shape, depth);

			// the grouped-ordering cross-check needs a structurally valid element and selection, so it runs
			// only once both pass, reporting offending sort keys under their own selector keys

			const groupingTrace = selection !== undefined && elementTrace === undefined && selectionTrace === undefined
				? validateGroupedOrdering(element, selection)
				: undefined;

			// element keys (variant indices, identifiers, bindings) and selection operator keys are disjoint, so
			// the per-slot traces merge into one: a keyed trace spreads its own keys, an atomic one is filed
			// under its tuple position, and collect drops the undefined slots (grouping is never atomic)

			return collect({
				...(isObject(elementTrace) ? elementTrace : { "[0]": elementTrace }),
				...(isObject(selectionTrace) ? selectionTrace : { "[1]": selectionTrace }),
				...(isObject(groupingTrace) ? groupingTrace : {})
			});

		}

		function validateGroupedOrdering(element: unknown, selection: unknown): undefined | Trace {

			if ( !isObject(selection) ) { return undefined; }

			const aggregate = (probe: Probe): boolean => probe.pipe.some(isAggregate);
			const signature = (probe: Probe): string => `${probe.path.join(".")}|${probe.pipe.join(":")}`;

			const bindings = isObject(element) ? Object.keys(element).filter(isBinding).map(decodeProbe) : [];
			const selectors = Object.keys(selection).map((k): [string, Probe] => [k, decodeProbe(k)]);

			// grouping is fixed by the projection alone (qest §5.8.2.1): an aggregate binding groups the query,
			// and the non-aggregate bindings are then the grouping keys; an aggregate in the selection alone is
			// a per-item reduction, not grouping

			const grouped = bindings.some(aggregate);
			const groupingKeys = new Set(bindings.filter(probe => !aggregate(probe)).map(signature));

			// a non-aggregate `^` ordering or `+` focus must reference a grouping key; an aggregate one ranks
			// by its post-aggregation value and is always admissible

			return !grouped ? undefined : collect(Object.fromEntries(selectors
				.filter(([, probe]) =>
					(probe.target === "^" || probe.target === "+") && !aggregate(probe) && !groupingKeys.has(signature(probe))
				)
				.map(([k]) => [k, "expected a grouping-key or aggregate ordering/focus expression under grouping"])
			));

		}

	}


	function validateElement(
		value: unknown,
		shape: SetShape,
		depth: undefined | number
	): undefined | Trace {

		const variants = getMultiVariants(shape);
		const [variant] = variants;

		if ( depth !== undefined && depth < 0 ) {

			return "exceeded maximum nesting depth";

		} else if ( variants.length > 1 ) {

			return validateUnionValue(value, shape, depth);

		} else {

			switch ( variant.kind ) {

				case "boolean":
				case "number":
				case "string":

					return validatePlaceholder(value, variant, depth);

				case "reference":
				case "resource":

					const next = depth === undefined ? depth : depth-1;
					const target = variant.kind === "reference" ? eager(variant.shape) : variant;

					return !isObject(value) ? validatePlaceholder(value, variant, depth)
						: Object.keys(value).every(isIdentifier) ? validateTemplate(value, target, next)
							: validateProjection(value, target, next);

				case "text":

					return "unexpected <text> element";

			}

		}

	}


	function validateLocale(
		value: unknown,
		shape: SetShape | RangeShape
	): undefined | Trace {

		return shape.maxCount === 1
			? validateLocaleString(value)
			: validateLocaleStrings(value);

	}

	function validateUnionValue(
		value: unknown,
		shape: SetShape | RangeShape,
		depth: undefined | number,
		local: boolean = false
	): undefined | Trace {

		const variants = getMultiVariants(shape);

		if ( isObject(value, (_, key) => isUnionKey(key)) ) {

			return collect(Object.fromEntries(Object.entries(value).map(([key, branch]) => {

				return [key, validateUnion(branch, variants, {
					model: true,
					match: (branch, variant) => variant.kind === "text"
						? local && validateLocaleString(branch) === undefined
						: validatePlaceholder(branch, variant, depth) === undefined
				})];

			})));

		} else {

			return "expected union variant map";

		}

	}


	function validateProjection(
		value: unknown,
		shape: ResourceShape,
		depth: undefined | number
	): undefined | Trace {

		if ( !isObject(value) ) {

			return "expected <projection> value";

		} else if ( depth !== undefined && depth < 0 ) {

			return "exceeded maximum nesting depth";

		} else {

			const probes = new Map<Binding, Probe>(Object
				.keys(value)
				.filter(isBinding)
				.map(key => [key, decodeProbe(key)])
			);

			return collect(Object.fromEntries(Object.entries(value).map(([binding, model]) => {

					const probe = isBinding(binding) ? probes.get(binding) : undefined;

					if ( probe === undefined ) {

						return [binding, "expected projection binding"];

					} else if ( depth !== undefined && probe.path.length > depth ) {

						return [binding, "exceeded maximum path length"];

					} else if ( plain && probe.pipe.some(isAggregate) ) {

						return [binding, "disabled aggregate transforms"];

					} else if ( Array.from(probes.values()).filter(p => p.target === probe.target).length > 1 ) {

						return [binding, `duplicate projection identifier <${probe.target}>`];

					} else if ( model === undefined ) {

						return [binding, undefined];

					} else {

						const range = effective(shape, probe);

						if ( isString(range) ) {

							return [binding, range]; // error trace

						} else {

							// the coalesced array placeholder `[""]` over an array-per-tag localised target is the
							// only array admitted in a projection value; any other tuple is rejected before dispatch

							const locales =
								range.variants.length === 1
								&& range.variants[0].kind === "text"
								&& range.maxCount !== 1;

							return [binding, isArray(model) && !locales
								? "unexpected array in projection value"
								: validateModel(model, range, depth, true)
							];

						}

					}
				}
			)));

		}

	}

	function validateSelection(
		value: unknown,
		shape: SetShape,
		depth: undefined | number
	): undefined | Trace {

		// a selector path resolves through the collection element, one level below the collection itself

		const next = depth === undefined ? depth : depth-1;


		if ( value === undefined ) { // a one-element collection tuple carries no selection slot

			return undefined;

		} else if ( !isObject(value) ) {

			return "expected selection object";

		} else if ( next !== undefined && next < 0 ) {

			return "exceeded maximum nesting depth";

		} else {

			return collect(Object.fromEntries(Object.entries(value).map(([k, v]) => {

				if ( !isSelector(k) ) {

					return [k, "expected selection operator"];

				} else {

					const probe = decodeProbe(k);
					const range = effective(shape.shape, probe);

					if ( next !== undefined && probe.path.length > next ) {

						return [k, "exceeded maximum path length"];

					} else if ( plain && probe.pipe.some(isAggregate) ) {

						return [k, "disabled aggregate transforms"];

					} else if ( isString(range) ) { // error trace

						return [k, range];

					} else {

						const { variants } = range;

						switch ( probe.target ) {

							case "<":
							case ">":
							case "<=":
							case ">=":

								return [k, validateBound(v, variants)];

							case "~":

								return [k, validateKeywords(v, variants)];

							case "?":
							case "!":

								return [k, validateOptions(v, variants)];

							case "+": // sort focus ranks one value per resource, so it rejects a multi-valued key

								return [k, range.maxCount === 1
									? validateOptions(v, variants)
									: "expected single-valued sort focus key"
								];

							case "^":

								return [k, validateOrder(v, range)];

							case "@":

								return [k, validateOffset(v)];

							case "#":

								return [k, validateLimit(v)];

							default:

								return [k, "expected selection operator"];

						}

					}

				}

			})));

		}


		function validateBound(value: unknown, variants: readonly ValuesShape[]): undefined | Trace {

			if ( variants.length === 0 ) { // no shape to constrain, template immaterial

				return undefined;

			} else if ( variants.length > 1 ) {

				return validateUnion(value, variants, {
					match: (value, variant) => validateBound(value, [variant]) === undefined
				});

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

					case "text": // a localised property coalesces to a string set the bound filters existentially

						return isString(value) ? undefined
							: "expected string value";

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

				// `~` is a search string applied to every string branch at once, not a discriminating value

				return validateUnion(value, variants, {
					model: true,
					match: (value, variant) => validateKeywords(value, [variant]) === undefined
				});

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

				return isArray(value)
					? collect(Object.fromEntries(value.map((option, index) => [`[${index}]`, validate(option)])))
					: validate(value);


				// each option singles out exactly one variant (`sh:xone`); a null option is typeless and exempt

				function validate(option: unknown): undefined | Trace {
					return option === null ? undefined : validateUnion(option, variants, {
						match: (option, variant) => validateOptions(option, [variant]) === undefined
					});
				}

			} else {

				const [shape] = variants;

				if ( shape.kind === "text" ) {

					// a tag map, or a coalesced plain-string option (single or array), is admitted;
					// plain and tagged options MUST NOT be mixed within a set

					return value === null || isString(value) || isArray(value, isString) ? undefined
						: isObject(value) ? validateText([value], shape)
							: isArray(value) && value.some(v => isObject(v)) && value.some(v => isString(v))
								? "mixed plain and tagged options"
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


		function validateOffset(v: any) {
			return !isNumber(v) ? "expected number value"
				: !Number.isInteger(v) || v < 0 ? "expected non-negative integer"
					: undefined;
		}

		function validateLimit(v: any) {
			return !isNumber(v) ? "expected number value"
				: !Number.isInteger(v) || v < 0 ? "expected non-negative integer"
					: limit && (v === 0 || v > limit) ? `exceeded maximum result set limit <${limit}>`
						: undefined;
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

			entries: {}

		}));

		const trace = collect({

			...wrap(checkParents(shape, parents)),
			...wrap(checkSingletons(Object.values(merged.entries))),
			...wrap(checkPredicates(merged)),

			// checkId is deferred to validateResource, not run here at construction (see checkId)

			...wrap(checkType(merged))

		});

		if ( trace !== undefined ) {
			throw new TraceError("incompatible flattened shape", trace);
		}

		// recursively flatten nested resource shapes within property ranges

		const entries = Object.fromEntries(Object.entries(merged.entries).map(([name, entry]) => {

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

		return seal({ ...merged, entries }, Flattened, null);

	}

}

/**
 * Post-processes a validated retrieval template to enforce server-side policies that cannot be
 * expressed as pure structural constraints.
 *
 * Drives a shape-aware recursive descent that mirrors {@link validateTemplate}'s dispatch: each
 * template slot is resolved to its effective {@link RangeShape} via {@link effective} and visited under its
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

				// a projection binding decodes through the grammar; a bare template identifier resolves as a
				// self-probe, since bindings now require an explicit `name=expression` form and no longer decode

				const probe = isBinding(k) ? decodeProbe(k)
					: isIdentifier(k) ? { target: k, pipe: [], path: [k] }
						: undefined;

				const range = probe && effective(shape, probe);

				// only a resolved RangeShape carries something to walk; a trace string leaves the value as-is

				return [k, isObject(range) ? walkRange(v, range) : v];

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
				isUnionKey(k) && Number(k) < variants.length
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
 * Resolves a shape's own class.
 *
 * Resolves `shape` to its {@link getShapeTarget | target} {@link ResourceShape | resource shape}, then takes its own
 * `class` (its target class). Yields `undefined` when `shape` resolves to no resource shape or it declares no class.
 *
 * @param shape One of the range {@link union!getShapeVariants | variants}
 *
 * @returns The own `class`, or `undefined` when absent
 */
export function getShapeClass(shape: Lazy<Shape>): undefined | Reference {
	return getShapeTarget(shape)?.class;
}

/**
 * Resolves a shape's inherited classes.
 *
 * Resolves `shape` to its {@link getShapeTarget | target} {@link ResourceShape | resource shape}, then takes its
 * `classes` (the supertypes it inherits). Yields `undefined` when `shape` resolves to no resource shape or it
 * declares none.
 *
 * @param shape One of the range {@link union!getShapeVariants | variants}
 *
 * @returns The inherited `classes`, or `undefined` when absent
 */
export function getShapeClasses(shape: Lazy<Shape>): undefined | readonly Reference[] {
	return getShapeTarget(shape)?.classes;
}

/**
 * Resolves a shape's identifier field name.
 *
 * Resolves `shape` to its {@link getShapeTarget | target} {@link ResourceShape | resource shape}, then takes the name
 * of its `kind: "id"` property, mapped to the JSON-LD `@id` keyword. Yields `undefined` when `shape` resolves to no
 * resource shape or declares no identifier property.
 *
 * @param shape One of the range {@link union!getShapeVariants | variants}
 *
 * @returns The identifier property's field name, or `undefined` when absent
 */
export function getShapeId(shape: Lazy<Shape>): undefined | Identifier {
	return Object.entries(getShapeProperties(shape)).find(([, p]) => p.kind === "id")?.[0];
}

/**
 * Resolves a shape's type field name.
 *
 * Resolves `shape` to its {@link getShapeTarget | target} {@link ResourceShape | resource shape}, then takes the name
 * of its `kind: "type"` property, mapped to the JSON-LD `@type` keyword. Yields `undefined` when `shape` resolves to
 * no resource shape or declares no type property.
 *
 * @param shape One of the range {@link union!getShapeVariants | variants}
 *
 * @returns The type property's field name, or `undefined` when absent
 */
export function getShapeType(shape: Lazy<Shape>): undefined | Identifier {
	return Object.entries(getShapeProperties(shape)).find(([, p]) => p.kind === "type")?.[0];
}

/**
 * Resolves a shape's entries.
 *
 * Resolves `shape` to its {@link getShapeTarget | target} {@link ResourceShape | resource shape}, then takes its
 * entries keyed by name. Yields an empty record when `shape` resolves to no resource shape.
 *
 * @param shape One of the range {@link union!getShapeVariants | variants}
 *
 * @returns The entries keyed by name, or an empty record when absent
 */
export function getShapeProperties(shape: Lazy<Shape>): ResourceShape["entries"] {
	return getShapeTarget(shape)?.entries ?? {};
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Reports whether a shape nests a Resource value, directly (`reference` / `resource` kinds) or through a
 * union variant. Gates the `{}` absence rule at property-value validation.
 *
 * @param shape The shape to test
 *
 * @returns `true` if the shape admits a nested Resource value
 */
function isNesting(shape: Shape): boolean {

	return shape.kind === "reference"
		|| shape.kind === "resource"
		|| shape.kind === "union" && shape.variants.some(isNesting);

}

/**
 * Resolves a trace key for a resource value.
 *
 * Reads the identifier property declared by `shape` from `value` and returns it as the trace key, wrapped as `<iri>`,
 * when it is an absolute IRI; otherwise, falls back to a positional `[{index}]` label.
 *
 * @param value The resource value to identify
 * @param shape The resource shape declaring the identifier property
 * @param index The positional index used as fallback label
 *
 * @returns The `<iri>` identifier key, or a positional `[{index}]` label when no absolute IRI is available
 */
function key(value: unknown, shape: ResourceShape, index: number) {

	const id = getShapeId(shape);
	const iri = id !== undefined && isObject(value) ? value[id] : undefined;

	return isReference(iri) ? `<${iri}>` : `[${index}]`;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates a resource identifier value against a {@link ResourceShape}'s `id` constraints.
 *
 * An absent value is vacuously valid (cardinality is enforced by the caller). A present value must be a single
 * absolute IRI matching the shape's `pattern` / `in` / `hasValue` constraints and, when supplied, the `entry`
 * reference. Shared by {@link validateResource} and {@link validateResult}.
 *
 * @param value The candidate identifier value
 * @param shape The resource shape declaring the identifier constraints
 * @param entry Expected {@link Reference} the value must match exactly, or `undefined` to skip the check
 *
 * @returns A keyed {@link Trace} of violations, or `undefined` when the value satisfies the constraints
 */
function validateId(value: unknown, shape: ResourceShape, entry: undefined | Reference): undefined | Trace {

	const { pattern, in: allowed, hasValue: required } = shape;

	return value === undefined ? undefined : collect({

		// format validation

		"{kind}": isArray(value) ? "expected scalar value"
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

/**
 * Validates a resource type value against a {@link ResourceShape}'s declared class.
 *
 * An absent value is vacuously valid (cardinality is enforced by the caller). A present value must be a single
 * absolute IRI equal to the shape's declared `class`; that a `type`-bearing shape declares a class is guaranteed
 * structurally by {@link checkType} at flatten time. Shared by {@link validateResource} and {@link validateResult}.
 *
 * @param value The candidate type value
 * @param shape The resource shape declaring the expected class
 *
 * @returns A keyed {@link Trace} of violations, or `undefined` when the value matches the declared class
 */
function validateType(value: unknown, shape: ResourceShape): undefined | Trace {

	const { class: clazz } = shape;

	return value === undefined ? undefined : collect({

		"{kind}": isArray(value) ? "expected scalar value"
			: !isReference(value) ? "expected absolute IRI"
				: undefined,

		// a type value materialises the resource's declared class and must match it

		"{class}": !isReference(value) || value === clazz
			|| `expected declared class <${clazz}>`

	});

}
