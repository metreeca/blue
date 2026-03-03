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

import {
	isArray,
	isBoolean,
	isFunction,
	isIdentifier,
	isLazy,
	isNumber,
	isObject,
	isOptional,
	isSome,
	isString
} from "@metreeca/core";
import { isIRI } from "@metreeca/core/resource";
import { isIndexed } from "@metreeca/qest/index";
import { decodeProbe, type Model, type Probe, type Query } from "@metreeca/qest/model";
import {
	isLocal,
	isLocals,
	isReference,
	isValue,
	type Reference,
	type Resource,
	type Value
} from "@metreeca/qest/state";
import { apply, isValidator, isValueShape, materialize, validateValue } from "./index.core.js";
import type { Trace, Validator, ValueShape } from "./index.js";
import type {
	Entries,
	Entry,
	Id,
	Property,
	PropertyConstraints,
	Range,
	ReferenceShape,
	ResourceConstraints,
	ResourceShape,
	Type,
	Union
} from "./resource.js";


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


/**
 * Validation template for {@link ResourceConstraints} fields.
 */
const ResourceConstraintsTemplate = {

	virtual: (v: unknown) => isOptional(v, isBoolean),

	name: (v: unknown) => isOptional(v, isLocal),
	description: (v: unknown) => isOptional(v, isLocal),
	namespace: (v: unknown) => isOptional(v, isFunction),

	extends: (v: unknown) => isOptional(v, v => isSome(v, v => isLazy(v, isResourceShape))),
	class: (v: unknown) => isOptional(v, v => isIRI(v, "absolute")),

	pattern: (v: unknown) => isOptional(v, (v: unknown): v is string => isString(v) && PatternFormat.test(v)),

	in: (v: unknown) => isOptional(v, v => isArray(v, v => isIRI(v, "absolute"))),
	hasValue: (v: unknown) => isOptional(v, v => isArray(v, v => isIRI(v, "absolute"))),

	validators: (v: unknown) => isOptional(v, v => isArray(v, isValidator))

};

/**
 * Validation template for {@link PropertyConstraints} fields.
 */
const PropertyConstraintsTemplate = {

	hidden: (v: unknown) => isOptional(v, isBoolean),
	computed: (v: unknown) => isOptional(v, isBoolean),

	name: (v: unknown) => isOptional(v, isLocal),
	description: (v: unknown) => isOptional(v, isLocal),

	forward: (v: unknown) => isOptional(v, v => isIRI(v, "absolute") || isFunction(v)),
	reverse: (v: unknown) => isOptional(v, v => isIRI(v, "absolute") || isFunction(v))

};


/**
 * Shorthand for the properties map of a {@link ResourceShape}.
 */
type Properties = ResourceShape["properties"];


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks whether a value is a {@link ReferenceShape}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has `kind: "reference"`, a valid IRI `model`, and valid `backlink` and `shape` fields;
 *     false otherwise
 */
export function isReferenceShape(value: unknown): value is ReferenceShape {
	return isObject(value, {

		kind: v => v === "reference",
		model: v => isIRI(v),

		backlink: (v: unknown) => isOptional(v, isBoolean),
		shape: (v: unknown) => isLazy(v, isResourceShape)

	});
}


/**
 * Checks whether a value is a valid {@link ResourceShape}.
 *
 * Validates structural integrity including `kind`, `model`, constraints, and properties. Each property must be an
 * {@link Id}, {@link Type}, or {@link Property}, and at most one `Id` and one `Type` entry are allowed.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` is a structurally valid resource shape; false otherwise
 */
export function isResourceShape(value: unknown): value is ResourceShape {
	return isObject(value, {

		kind: v => v === "resource",
		model: v => isObject(v),

		...ResourceConstraintsTemplate,

		properties: v => {

			if ( isObject(v, (v, k) =>
				isIdentifier(k) && (isId(v) || isType(v) || isProperty(v))
			) ) {

				// at most one id and one type entry

				const values = Object.values(v);

				const ids = values.filter(isId);
				const types = values.filter(isType);

				return ids.length <= 1 && types.length <= 1;

			} else {

				return false;

			}
		}

	});
}

/**
 * Checks whether a value is a valid {@link ResourceConstraints} object.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has valid optional resource constraints; false otherwise
 */
export function isResourceConstraints(value: unknown): value is ResourceConstraints {
	return isObject(value, ResourceConstraintsTemplate);
}


/**
 * Checks whether a value is a valid {@link Id}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has `kind: "id"` and valid optional constraints; false otherwise
 */
export function isId(value: unknown): value is Id {
	return isObject(value, {

		kind: (v: unknown) => v === "id",

		hidden: (v: unknown) => isOptional(v, isBoolean)

	});
}

/**
 * Checks whether a value is a valid {@link Type}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has `kind: "type"` and valid optional constraints; false otherwise
 */
export function isType(value: unknown): value is Type {
	return isObject(value, {

		kind: (v: unknown) => v === "type",

		hidden: (v: unknown) => isOptional(v, isBoolean)

	});
}

/**
 * Checks whether a value is a valid {@link Property}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has `kind: "property"`, valid property constraints, and a `range` containing a
 *     {@link Range}; false otherwise
 */
export function isProperty(value: unknown): value is Property {
	return isObject(value, {

		kind: (v: unknown) => v === "property",

		...PropertyConstraintsTemplate,

		range: isRange

	});
}

/**
 * Checks whether a value is a valid {@link PropertyConstraints} object.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has valid optional property constraints; false otherwise
 */
export function isPropertyConstraints(value: unknown): value is PropertyConstraints {
	return isObject(value, PropertyConstraintsTemplate);
}


/**
 * Checks whether a value is a valid {@link Range}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has `kind: "range"`, optional `minCount`/`maxCount` numbers, and a `shape` that is a
 *     {@link ValueShape} or {@link Union}; false otherwise
 */
export function isRange(value: unknown): value is Range {
	return isObject(value, {

		kind: v => v === "range",

		minCount: (v: unknown) => isOptional(v, isNumber),
		maxCount: (v: unknown) => isOptional(v, isNumber),

		shape: v => isValueShape(v) || isUnion(v)

	});
}

/**
 * Checks whether a value is a valid {@link Union}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` has `kind: "union"` and a `variants` object mapping identifiers to
 *     {@link ValueShape value shapes}; false otherwise
 */
export function isUnion(value: unknown): value is Union {
	return isObject(value, {

		kind: v => v === "union",
		model: v => isIndexed(v, isValue),

		variants: v => isObject(v, (v, k) => isIdentifier(k) && isValueShape(v))

	});
}


/**
 * Checks whether a value is a valid {@link Entries} object.
 *
 * Validates that all keys are identifiers and all values are valid {@link Entry entries}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` is an object with valid entry keys and values; false otherwise
 */
export function isEntries(value: unknown): value is Entries {
	return isObject(value, (v, k) => isIdentifier(k) && isEntry(v));
}

/**
 * Checks whether a value is a valid {@link Entry}.
 *
 * An entry can be an {@link Id}, {@link Type}, {@link Range}, or {@link Property}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` is a valid entry; false otherwise
 */
export function isEntry(value: unknown): value is Entry {
	return isId(value) || isType(value) || isRange(value) || isProperty(value);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates reference values against a {@link ReferenceShape}.
 *
 * Resolves the lazy target {@link ResourceShape} and enforces its `pattern`, `in`, and `hasValue` constraints against
 * each reference value.
 *
 * @param values The reference values to validate
 * @param shape The reference shape containing the target resource shape
 *
 * @returns A trace of validation errors, empty if all values are valid
 */
export function validateReference(values: readonly Reference[], shape: ReferenceShape): Trace {

	const { pattern, in: allowed, hasValue } = materialize(shape.shape);

	return [

		...values.flatMap(value => [

			(pattern === undefined || match(value, pattern))
			|| `expected IRI matching pattern <${pattern}>`,

			(allowed === undefined || allowed.includes(value))
			|| `expected IRI in [${allowed.join(", ")}]`

		]).filter(isString),

		...(hasValue === undefined ? []
				: hasValue
					.filter(required => !values.includes(required))
					.map(required => `expected values to include <${required}>`)
		)

	];

}

/**
 * Validates complete resource states against a {@link ResourceShape}.
 *
 * Checks resource-level constraints (pattern, in, hasValue), property cardinality and value constraints, closed shape
 * enforcement, custom validators, and inherited properties. Unknown and missing properties are both rejected.
 *
 * @param values The resource instances to validate
 * @param shape The resource shape defining the expected structure
 *
 * @returns A trace of validation errors, empty if all resources are valid
 */
export function validateResource(values: readonly Resource[], shape: ResourceShape): Trace {

	const { properties, overrides, validators } = flatten(shape);

	const envelope = new Set(Object.keys(properties));


	return values.flatMap(value => [

		Object.fromEntries([

			// property validation — validate declared shape properties

			...Object.entries(properties).map(([key, entry]) => [key,

				entry.kind === "id" ? validateId(value[key])
					: entry.kind === "type" ? validateType(value[key])
						: entry.kind === "property" ? validateProperty(value[key], entry, overrides[key])
							: []

			]),

			// envelope validation — reject unknown properties

			...Object.keys(value)
				.filter(key => !envelope.has(key))
				.map(key => [key, [`unexpected property`]])

		]),

		...validators
			.filter(isFunction)
			.flatMap(validator => validator(value).filter(isString))

	]);


	function validateId(v: unknown): Trace {

		return [

			// format validation

			...(v === undefined ? [`expected required id`] : [
				(!Array.isArray(v)) || `expected single value`,
				(isString(v) && isIRI(v, "absolute")) || `expected absolute IRI`
			].filter(isString)),

			// constraint validation

			...(!isString(v) ? [] : [

				(shape.pattern === undefined || match(v as Reference, shape.pattern))
				|| `expected IRI matching pattern <${shape.pattern}>`,

				(shape.in === undefined || shape.in.includes(v as Reference))
				|| `expected IRI in [${shape.in.join(", ")}]`,

				(shape.hasValue === undefined || shape.hasValue.includes(v as Reference))
				|| `expected values to include [${shape.hasValue.join(", ")}]`

			].filter(isString))

		];

	}

	function validateType(v: unknown): Trace {

		return v === undefined ? [] : [
			(!Array.isArray(v)) || `expected single value`,
			(isString(v) && isIRI(v, "absolute")) || `expected absolute IRI`
		].filter(isString);

	}

	function validateProperty(v: unknown, entry: Property, inherited?: readonly Range[]): Trace {

		return [

			// range validation

			...validateRange(v, entry.range),

			// inherited range validation

			...inherited?.flatMap(range => validateRange(v, range)) ?? []

		];

	}

	function validateRange(value: unknown, range: Range): Trace {

		const { minCount, maxCount, shape } = range;

		const isScalar = maxCount === 1;

		const values: readonly Value[] = value === undefined ? [] : Array.isArray(value) ? value : [value];


		return [

			// shape validation (scalar vs array)

			...([
				(value === undefined || isScalar !== Array.isArray(value))
				|| (isScalar ? `expected scalar value` : `expected array value`)
			].filter(isString)),


			// cardinality validation

			...([

				(minCount === undefined || values.length >= minCount)
				|| `expected at least ${minCount} value(s), got ${values.length}`,

				(maxCount === undefined || values.length <= maxCount)
				|| `expected at most ${maxCount} value(s), got ${values.length}`

			].filter(isString)),

			// value validation — delegate to union matching when shape is a union

			...(shape.kind === "union"
					? validateUnion(values, shape)
					: validateValue(values, shape)
			)

		];

	}

	function validateUnion(values: readonly Value[], union: Union): Trace {

		const variants = Object.values(union.variants);

		return values
			.filter(v => !variants.some(shape => validateValue([v], shape).length === 0))
			.map(() => `value does not match any allowed type`);

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
 * subject to `depth` limits.
 *
 * @param values The model instances to validate
 * @param shape The resource shape defining the expected structure
 * @param depth Maximum nesting depth for reference and embedded resource expansion; `0` rejects any nested model
 *     while still accepting IRI references; `null` for unlimited
 *
 * @returns A trace of validation errors, empty if all models are valid
 */
export function validateModel(values: readonly Model[], shape: ResourceShape, depth: null | number): Trace {

	return values.flatMap(value => [

		Object.fromEntries(Object.entries(value).map(([key, v]) => {

			return [key, validateBinding(v, decodeProbe(key), shape, depth)];

		}))

	]);


	function validateBinding(v: unknown, binding: Probe, shape: ValueShape, depth: null | number): Trace {

		// probe target is already checked to be an Identifier by structural type guards

		const effective = apply(binding, shape);

		// undefined range means the binding cannot be populated at runtime; skip validation

		return effective === undefined ? [] : validateRange(v, effective, depth);

	}

	function validateRange(value: unknown, range: Range, depth: null | number): Trace {

		const { maxCount, shape } = range;

		const isScalar = maxCount === 1;

		const values = value === undefined ? [] : Array.isArray(value) ? value : [value];


		return [

			// shape validation (scalar vs singleton tuple); tuple arity already checked by structural type guards

			...([
				(value === undefined || isScalar !== Array.isArray(value))
				|| (isScalar ? `expected scalar value` : `expected array value`)
			].filter(isString)),

			// template validation — delegate to union matching or type-specific check

			...(shape.kind === "union"
					? validateUnion(values, shape, range, depth)
					: validateTemplate(values, range, depth)
			)

		];

	}

	function validateUnion(values: readonly unknown[], union: Union, range: Range, depth: null | number): Trace {

		const variants = Object.values(union.variants);

		return values
			.filter(v => !variants.some(variant => validateTemplate([v], { ...range, shape: variant }, depth).length === 0))
			.map(() => `value does not match any allowed type`);

	}

	function validateTemplate(values: readonly unknown[], range: Range, depth: null | number): Trace {

		const { maxCount, shape } = range;

		const collection = maxCount === undefined || maxCount > 1;


		switch ( shape.kind ) {

			case "boolean":

				return validate(values, isBoolean);

			case "number":

				return validate(values, isNumber);

			case "string":

				return validate(values, isString);

			case "local":

				return validate(values, isLocal);

			case "locals":

				return validate(values, isLocals);

			case "reference":

				return validateNested(values, collection, materialize(shape.shape), depth);

			case "resource":

				return validateNested(values, collection, shape, depth);

			default:

				return [];

		}


		function validate(values: readonly unknown[], guard: (v: unknown) => boolean): Trace {
			return values
				.filter(v => !guard(v))
				.map(() => `expected ${shape.kind} values`);
		}

	}

	function validateNested(values: readonly unknown[], collection: boolean, target: ResourceShape, depth: null | number): Trace {
		return values.flatMap(v => {

			if ( isReference(v) ) {

				return [];

			} else if ( !isObject(v) ) {

				return [];

			} else if ( depth !== null && depth <= 0 ) {

				return [`exceeded maximum nesting depth`];

			} else if ( collection ) {

				return validateQuery([v as Query], target, depth === null ? depth : depth-1);

			} else {

				return validateModel([v as Model], target, depth === null ? depth : depth-1);

			}

		});
	}

	function validateQuery(values: readonly Query[], shape: ResourceShape, depth: null | number): Trace {

		return values.flatMap(value => [

			Object.fromEntries(Object.entries(value).map(([key, v]) => {

				const probe = decodeProbe(key);
				const { target } = probe;

				if ( target === "@" || target === "#" ) {

					return [key, []]; // !!! validate paging parameters

				} else if ( target === "<" || target === ">" || target === "<=" || target === ">=" ) {

					return [key, []]; // !!! validate comparison operators

				} else if ( target === "~" || target === "?" || target === "!" || target === "*" ) {

					return [key, []]; // !!! validate filter operators

				} else if ( target === "^" ) {

					return [key, []]; // !!! validate sort operator

				} else {

					return [key, validateBinding(v, probe, shape, depth)];

				}

			}))

		]);

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Flattens the inheritance chain of a {@link ResourceShape} into merged properties, overrides, and validators.
 *
 * Overridden inherited ranges are tracked in the overrides map for conjunctive constraint enforcement.
 *
 * @param shape The shape whose inheritance chain is to be resolved
 *
 * @returns The merged properties, inherited range overrides, and deduplicated validators
 */
export function flatten(shape: ResourceShape): {
	properties: Properties;
	overrides: Record<string, readonly Range[]>;
	validators: readonly Validator<Resource>[];
} {

	const parents = shape.extends;

	if ( parents === undefined ) {

		return {
			properties: shape.properties,
			overrides: {},
			validators: shape.validators ?? []
		};

	} else {

		const parentShapes: readonly ResourceShape[] = Array.isArray(parents)
			? parents.map(p => materialize(p))
			: [materialize(parents)];

		// merge parent properties/validators left-to-right; deduplicate validators by Set identity

		const inherited = parentShapes
			.map(flatten)
			.reduce((inherited, resolved) => ({
				properties: { ...inherited.properties, ...resolved.properties },
				overrides: { ...inherited.overrides, ...resolved.overrides },
				validators: [...new Set([...inherited.validators, ...resolved.validators])]
			}), {
				properties: {} as Properties,
				overrides: {} as Record<string, readonly Range[]>,
				validators: [] as readonly Validator<Resource>[]
			});

		// collect inherited ranges overridden by local properties; propagate transitive overrides

		const overrides = Object.entries(shape.properties)
			.reduce((overrides, [key, local]) => {

				const parent = inherited.properties[key];

				if ( parent?.kind === "property" && local.kind === "property" ) {
					return { ...overrides, [key]: [...(overrides[key] ?? []), parent.range] };
				} else {
					return overrides;
				}

			}, {
				...inherited.overrides
			});

		return {
			properties: { ...inherited.properties, ...shape.properties },
			overrides,
			validators: [...new Set([...inherited.validators, ...(shape.validators ?? [])])]
		};

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
 */
export function match(iri: string, pattern: string): boolean {

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
