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
 * Range, Union, Entries, Entry), plus the resource/patch/model validators enforcing structural, cardinality, and value
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
import {
	decodeCriterion,
	isBinding,
	isLocalModel,
	isLocalsModel,
	isModel,
	isQuery,
	type Model,
	type Query
} from "@metreeca/qest/model";
import {
	isLocal as isLocalValue,
	isReference,
	isValue,
	type Patch,
	type Reference,
	type Resource,
	type Value
} from "@metreeca/qest/state";
import { collect, isValidator, isValueShape, materialize, validateValue } from "./index.core.js";
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

	name: (v: unknown) => isOptional(v, isLocalValue),
	description: (v: unknown) => isOptional(v, isLocalValue),
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

	name: (v: unknown) => isOptional(v, isLocalValue),
	description: (v: unknown) => isOptional(v, isLocalValue),

	forward: (v: unknown) => isOptional(v, v => isIRI(v, "absolute") || isFunction(v)),
	reverse: (v: unknown) => isOptional(v, v => isIRI(v, "absolute") || isFunction(v))

};


/**
 * Generic object type for resource values under validation.
 */
type Object = Record<string, unknown>;

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
				(isIdentifier(k) || isBinding(k)) && (isId(v) || isType(v) || isProperty(v))
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
 * @returns true if `value` has `kind: "range"`, optional `minCount`/`maxCount` numbers, and a valid `shape`;
 *     false otherwise
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
 * Validates that all keys are identifiers or bindings, and all values are valid {@link Entry entries}.
 *
 * @group Guards
 *
 * @param value The value to check
 *
 * @returns true if `value` is an object with valid entry keys and values; false otherwise
 */
export function isEntries(value: unknown): value is Entries {
	return isObject(value, (v, k) => (isIdentifier(k) || isBinding(k)) && isEntry(v));
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

	const { properties, overrides, validators } = resolveInheritance(shape);
	const labels = resolveLabels(properties);

	return values.flatMap(value => collect([

		[
			validateId(value, properties, shape),
			validateType(value, properties),
			validateEnvelope(value, labels),
			validateProperties(value, properties, overrides)
		],

		validators
			.filter(isFunction)
			.flatMap(validator => validator(value).filter(isString))

	]));

}

/**
 * Validates partial resource updates against a {@link ResourceShape}.
 *
 * Checks resource-level constraints, property value constraints, closed shape enforcement, and inherited properties.
 * The id property is required when defined in the shape. Unknown properties are rejected but missing regular properties
 * are accepted as not modified. Minimum cardinality constraints are skipped for absent properties. Custom validators
 * are skipped.
 *
 * Nested resources are validated using full {@link validateResource} semantics, not patch semantics. When a nested
 * resource is present, it represents a complete replacement value, so all required properties must be provided and
 * custom validators are enforced.
 *
 * @param values The patch instances to validate
 * @param shape The resource shape defining the expected structure
 *
 * @returns A trace of validation errors, empty if all patches are valid
 */
export function validatePatch(values: readonly Patch[], shape: ResourceShape): Trace {

	const { properties, overrides } = resolveInheritance(shape);
	const labels = resolveLabels(properties);

	return values.flatMap(value => collect([[

		validateId(value, properties, shape),
		validateType(value, properties),
		validateEnvelope(value, labels),
		validatePatchProperties(value, properties, overrides)

	]]));

}

/**
 * Validates query/projection models against a {@link ResourceShape}.
 *
 * Checks closed shape enforcement, property shape (scalar vs singleton tuple), and inherited properties. Value
 * constraints, minCount/maxCount cardinality, and custom validators are skipped as a model describes a projection shape
 * rather than actual data. Unknown properties are rejected but missing properties are accepted as not requested.
 *
 * @param values The model instances to validate
 * @param shape The resource shape defining the expected structure
 * @param depth Maximum nesting depth for reference and embedded resource expansion; `0` rejects any nested model or
 *     query while still accepting IRI references; `null` for unlimited
 *
 * @returns A trace of validation errors, empty if all models are valid
 */
export function validateModel(values: readonly Model[], shape: ResourceShape, depth?: null | number): Trace {

	const { properties } = resolveInheritance(shape);
	const labels = resolveLabels(properties);

	return values.flatMap(value => collect([[

		validateId(value, properties),
		validateType(value, properties),
		validateEnvelope(value, labels),
		validateModelProperties(value, properties, depth)

	]]));

}

/**
 * Validates query/projection models with filtering, ordering, and pagination criteria against a {@link ResourceShape}.
 *
 * Extends {@link validateModel} to handle query-specific keys: projection properties are validated for existence and
 * type compatibility; operator-prefixed filter and ordering keys are validated to ensure referenced expressions resolve
 * to properties defined in the shape; pagination keys are accepted structurally.
 *
 * @param values The query instances to validate
 * @param shape The resource shape defining the expected structure
 * @param depth Maximum nesting depth for reference and embedded resource expansion; `0` rejects any nested model or
 *     query while still accepting IRI references; `null` for unlimited
 *
 * @returns A trace of validation errors, empty if all queries are valid
 */
export function validateQuery(values: readonly Query[], shape: ResourceShape, depth?: null | number): Trace {

	const { properties } = resolveInheritance(shape);
	const labels = resolveLabels(properties);

	return values.flatMap(value => collect([[

		validateId(value, properties),
		validateType(value, properties),
		validateQueryEnvelope(value, labels),
		validateModelProperties(value, properties, depth),
		...validateQueryCriteria(value, properties)

	]]));

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Flattens the inheritance chain of a {@link ResourceShape} into merged properties, overrides, and validators.
 *
 * Walks `extends` references recursively, merging parent properties and validators left-to-right. Child definitions
 * override inherited ones for properties; validators are deduplicated using `Set` identity. When a child overrides
 * an inherited property, the inherited range is tracked in the overrides map for conjunctive constraint enforcement.
 *
 * @param shape The shape whose inheritance chain is to be resolved
 *
 * @returns The merged properties, inherited range overrides, and deduplicated validators
 */
function resolveInheritance(shape: ResourceShape): {
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

		// merge parent properties and validators

		const inherited = parentShapes
			.map(resolveInheritance)
			.reduce((acc, resolved) => ({
				properties: { ...acc.properties, ...resolved.properties },
				overrides: { ...acc.overrides, ...resolved.overrides },
				validators: [...new Set([...acc.validators, ...resolved.validators])]
			}), {
				properties: {} as Properties,
				overrides: {} as Record<string, readonly Range[]>,
				validators: [] as readonly Validator<Resource>[]
			});

		return {
			properties: { ...inherited.properties, ...shape.properties },
			overrides: collectOverrides(inherited.properties, inherited.overrides, shape.properties),
			validators: [...new Set([...inherited.validators, ...(shape.validators ?? [])])]
		};

	}

}


/**
 * Extracts the set of user-visible property labels from a properties map.
 *
 * Strips alias suffixes (after `=`) to produce the canonical label used for closed-shape envelope checks.
 *
 * @param properties The resolved properties map
 *
 * @returns The set of canonical property labels
 */
function resolveLabels(properties: Properties): Set<string> {

	return new Set(
		Object.keys(properties).map(key => key.includes("=") ? key.split("=")[0] : key)
	);

}

/**
 * Collects inherited ranges for properties overridden by local definitions.
 *
 * When a local property overrides an inherited one, the inherited property's range is added to the overrides map so
 * that both the local and inherited constraints are validated conjunctively. Propagates transitive overrides from
 * parent shapes.
 *
 * @param inheritedProperties The resolved inherited properties
 * @param inheritedOverrides The inherited overrides from parent shapes
 * @param localProperties The local properties that may override inherited ones
 *
 * @returns The updated overrides map including newly overridden ranges
 */
function collectOverrides(
	inheritedProperties: Properties,
	inheritedOverrides: Record<string, readonly Range[]>,
	localProperties: Properties
): Record<string, readonly Range[]> {
	return Object.entries(localProperties).reduce((overrides, [key, local]) => {

		const inherited = inheritedProperties[key];

		if ( inherited?.kind === "property" && local.kind === "property" ) {
			return { ...overrides, [key]: [...(overrides[key] ?? []), (inherited as Property).range] };
		} else {
			return overrides;
		}

	}, { ...inheritedOverrides } as Record<string, readonly Range[]>);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates the id property of a resource value.
 *
 * Checks format (single absolute IRI) and, when `shape` is provided, enforces `pattern`, `in`, and `hasValue`
 * constraints. Reports a required-id error only in shape-aware mode.
 *
 * @param value The resource value to validate
 * @param properties The resolved properties map
 * @param shape Optional resource shape for constraint and requiredness checks
 *
 * @returns A record mapping the id key to its validation trace, empty if valid or no id property is defined
 */
function validateId(value: Object, properties: Properties, shape?: ResourceShape): Record<string, Trace> {

	const idEntry = Object.entries(properties).find(([, p]) => p.kind === "id");

	if ( idEntry === undefined ) {

		return {};

	} else {

		const [key] = idEntry;
		const v = value[key];

		const formatTrace: Trace = v === undefined
			? (shape !== undefined ? [`expected required id`] : [])
			: [
				(!Array.isArray(v)) || `expected single value`,
				(isString(v) && isIRI(v, "absolute")) || `expected absolute IRI`
			].filter(isString);

		const constraintTrace: Trace = shape === undefined || !isString(v) ? []
			: [

				(shape.pattern === undefined || match(v as Reference, shape.pattern))
				|| `expected IRI matching pattern <${shape.pattern}>`,

				(shape.in === undefined || shape.in.includes(v as Reference))
				|| `expected IRI in [${shape.in.join(", ")}]`,

				(shape.hasValue === undefined || shape.hasValue.includes(v as Reference))
				|| `expected values to include [${shape.hasValue.join(", ")}]`

			].filter(isString);

		const trace = [...formatTrace, ...constraintTrace];

		return trace.length > 0 ? { [key]: trace } : {};

	}

}

/**
 * Validates the type property of a resource value.
 *
 * Checks that the type, when present, is a single absolute IRI. The type property is always optional.
 *
 * @param value The resource value to validate
 * @param properties The resolved properties map
 *
 * @returns A record mapping the type key to its validation trace, empty if valid or no type property is defined
 */
function validateType(value: Object, properties: Properties): Record<string, Trace> {

	const typeEntry = Object.entries(properties).find(([, p]) => p.kind === "type");

	if ( typeEntry === undefined ) {

		return {};

	} else {

		const [key] = typeEntry;
		const v = value[key];

		const trace: Trace = v === undefined
			? []
			: [
				(!Array.isArray(v)) || `expected single value`,
				(isString(v) && isIRI(v, "absolute")) || `expected absolute IRI`
			].filter(isString);

		return trace.length > 0 ? { [key]: trace } : {};

	}

}

/**
 * Enforces closed-shape semantics by rejecting properties not defined in the shape.
 *
 * @param value The resource value to validate
 * @param labels The set of known property labels from the shape
 *
 * @returns A record mapping each unexpected property key to an error trace
 */
function validateEnvelope(value: Object, labels: Set<string>): Record<string, Trace> {
	return Object.fromEntries(
		Object.keys(value)
			.filter(key => !labels.has(key))
			.map(key => [key, [`unexpected property`]])
	);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates all regular properties of a resource value against their local and inherited range definitions.
 *
 * Enforces conjunctive constraint semantics: when a child overrides a property, values must satisfy both the child's
 * constraints and all inherited constraints from parent shapes.
 *
 * @param value The resource value to validate
 * @param properties The resolved properties map
 * @param overrides The inherited ranges for overridden properties
 *
 * @returns A record mapping each invalid property label to its validation trace
 */
function validateProperties(value: Object, properties: Properties, overrides: Record<string, readonly Range[]>): Record<string, Trace> {
	return Object.fromEntries(
		Object.entries(properties)
			.filter(([, prop]) => prop.kind === "property")
			.map(([key, prop]) => {
				const name = key.includes("=") ? key.split("=")[0] : key;
				const inherited = overrides[key]?.flatMap(range => validateRange(value[name], range)) ?? [];
				return [name, [...validatePropertyRange(value[name], prop as Property), ...inherited]] as const;
			})
			.filter(([, trace]) => trace.length > 0)
	);
}

/**
 * Validates a property value against its range.
 *
 * @param value The property value to validate
 * @param prop The property definition containing the range specification
 *
 * @returns A trace of validation errors
 */
function validatePropertyRange(value: unknown, prop: Property): Trace {
	return validateRange(value, prop.range);
}

/**
 * Validates a property value against a single {@link Range}.
 *
 * Checks shape (scalar vs array), cardinality (`minCount`/`maxCount`), and delegates value-level checks to
 * {@link validateValue} for plain shapes or {@link validateUnion} for union shapes.
 *
 * @param value The property value to validate
 * @param range The range definition
 *
 * @returns A trace of validation errors
 */
function validateRange(value: unknown, range: Range): Trace {

	const { minCount, maxCount, shape } = range;

	const isScalar = maxCount === 1;
	const values: readonly Value[] = value === undefined
		? []
		: Array.isArray(value) ? value : [value];

	// shape validation (scalar vs array)

	const shapeTraces: Trace = [
		(value === undefined || isScalar !== Array.isArray(value))
		|| (isScalar ? `expected scalar value` : `expected array value`)
	].filter(isString);

	// cardinality validation

	const cardinalityTraces: Trace = [

		(minCount === undefined || values.length >= minCount)
		|| `expected at least ${minCount} value(s), got ${values.length}`,

		(maxCount === undefined || values.length <= maxCount)
		|| `expected at most ${maxCount} value(s), got ${values.length}`

	].filter(isString);

	// value validation — delegate to union matching when shape is a union

	const valueTraces = shape.kind === "union"
		? validateUnionValues(values, shape)
		: validateValue(values, shape);

	return [...shapeTraces, ...cardinalityTraces, ...valueTraces];

}

/**
 * Validates values against a {@link Union} of value shapes.
 *
 * Pure type matching: each individual value must match at least one variant. A value that fails all variants is
 * reported as a type mismatch. Cardinality is enforced by the enclosing {@link Range}, not here.
 *
 * @param values The values to validate
 * @param u The union definition
 *
 * @returns A trace of validation errors
 */
function validateUnionValues(values: readonly Value[], u: Union): Trace {

	const variantShapes = Object.values(u.variants);

	return values
		.filter(v => !variantShapes.some(shape => validateValue([v], shape).length === 0))
		.map(() => `value does not match any allowed type`);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates all regular properties of a patch value against their local and inherited range definitions.
 *
 * Enforces conjunctive constraint semantics: when a child overrides a property, present values must satisfy both the
 * child's constraints and all inherited constraints. Absent and `null` values are accepted.
 *
 * @param value The patch value to validate
 * @param properties The resolved properties map
 * @param overrides The inherited ranges for overridden properties
 *
 * @returns A record mapping each invalid property label to its validation trace
 */
function validatePatchProperties(value: Object, properties: Properties, overrides: Record<string, readonly Range[]>): Record<string, Trace> {
	return Object.fromEntries(
		Object.entries(properties)
			.filter(([, prop]) => prop.kind === "property")
			.map(([key, prop]) => {
				const name = key.includes("=") ? key.split("=")[0] : key;
				const v = value[name];
				const inherited = (v !== null && v !== undefined)
					? overrides[key]?.flatMap(range => validatePatchRange(v, range)) ?? []
					: [];
				return [name, [...validatePatchPropertyRange(v, prop as Property), ...inherited]] as const;
			})
			.filter(([, trace]) => trace.length > 0)
	);
}

/**
 * Dispatches patch property validation, accepting `null` (deletion) and `undefined` (absent) unconditionally.
 *
 * @param value The property value to validate
 * @param prop The property definition
 *
 * @returns A trace of validation errors
 */
function validatePatchPropertyRange(value: unknown, prop: Property): Trace {

	if ( value === null ) { // null is a deletion marker, always accepted

		return [];

	} else if ( value === undefined ) { // absent properties accepted in patch mode

		return [];

	} else {

		return validatePatchRange(value, prop.range);

	}

}

/**
 * Validates a present patch property value against a single {@link Range}.
 *
 * Skips `minCount` enforcement since absent properties are acceptable in patch mode.
 *
 * @param value The property value to validate
 * @param range The range definition
 *
 * @returns A trace of validation errors
 */
function validatePatchRange(value: unknown, range: Range): Trace {

	const { maxCount, shape } = range;

	const isScalar = maxCount === 1;
	const values: readonly Value[] = Array.isArray(value) ? value : [value];

	// shape validation (scalar vs array)

	const shapeTraces: Trace = [
		(isScalar !== Array.isArray(value))
		|| (isScalar ? `expected scalar value` : `expected array value`)
	].filter(isString);

	// cardinality: skip minCount for patches, enforce maxCount

	const cardinalityTraces: Trace = [

		(maxCount === undefined || values.length <= maxCount)
		|| `expected at most ${maxCount} value(s), got ${values.length}`

	].filter(isString);

	// value validation — delegate to union matching when shape is a union

	const valueTraces = shape.kind === "union"
		? validateUnionValues(values, shape)
		: validateValue(values, shape);

	return [...shapeTraces, ...cardinalityTraces, ...valueTraces];

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates properties of a model (projection) value, checking only type and shape compatibility.
 *
 * Absent properties are accepted as not requested. Cardinality and value constraints are skipped since a model
 * describes a projection shape rather than actual data.
 *
 * @param value The model value to validate
 * @param properties The resolved properties map
 *
 * @returns A record mapping each invalid property label to its validation trace
 */
function validateModelProperties(value: Object, properties: Properties, depth?: null | number): Record<string, Trace> {
	return Object.fromEntries(
		Object.entries(properties)
			.filter(([, prop]) => prop.kind === "property")
			.map(([key, prop]) => {
				const name = key.includes("=") ? key.split("=")[0] : key;
				return [name, validateModelPropertyRange(value[name], prop as Property, depth)] as const;
			})
			.filter(([, trace]) => trace.length > 0)
	);
}

/**
 * Dispatches model property validation, accepting `undefined` (absent) unconditionally.
 *
 * @param value The property value to validate
 * @param prop The property definition
 *
 * @returns A trace of validation errors
 */
function validateModelPropertyRange(value: unknown, prop: Property, depth?: null | number): Trace {

	if ( value === undefined ) { // absent properties accepted in model mode

		return [];

	} else {

		return validateModelRange(value, prop.range, depth);

	}

}

/**
 * Validates a model property value against a single {@link Range}.
 *
 * Checks type compatibility first; shape (scalar vs array) is verified only when the type matches. Cardinality
 * constraints are skipped entirely. When the range shape is a union, delegates to union type matching.
 *
 * @param value The property value to validate
 * @param range The range definition
 *
 * @returns A trace of validation errors
 */
function validateModelRange(value: unknown, range: Range, depth?: null | number): Trace {

	const { maxCount, shape } = range;

	const isScalar = maxCount === 1;
	const values: readonly Value[] = Array.isArray(value) ? value : [value];

	// type check — delegate to union matching when shape is a union

	const typeTraces = shape.kind === "union"
		? validateModelUnionValues(values, shape, depth)
		: validateModelValue(values, shape, depth);

	// shape validation (scalar vs array) - only when type matches

	const shapeTraces: Trace = typeTraces.length === 0 ? [
		(isScalar !== Array.isArray(value))
		|| (isScalar ? `expected scalar value` : `expected array value`)
	].filter(isString) : [];

	return [...shapeTraces, ...typeTraces];

}

/**
 * Validates model values against a {@link Union} of value shapes.
 *
 * Type-only matching: cardinality and value constraints are skipped.
 *
 * @param values The values to validate
 * @param u The union definition
 *
 * @returns A trace of validation errors
 */
function validateModelUnionValues(values: readonly Value[], u: Union, depth?: null | number): Trace {

	const variantShapes = Object.values(u.variants);

	return values
		.filter(v => !variantShapes.some(shape => validateModelValue([v], shape, depth).length === 0))
		.map(() => `value does not match any allowed type`);

}

/**
 * Validates model values for type compatibility only, without enforcing value constraints.
 *
 * For `reference` and `resource` shapes, recursively accepts references, queries, and nested models via
 * {@link validateQuery} and {@link validateModel}.
 *
 * @param values The values to type-check
 * @param shape The expected value shape
 *
 * @returns A trace of validation errors
 */
function validateModelValue(values: readonly Value[], shape: ValueShape, depth?: null | number): Trace {

	switch ( shape.kind ) {

		case "boolean":

			return values.flatMap(v => isBoolean(v) ? [] : [`expected boolean values`]);

		case "number":

			return values.flatMap(v => isNumber(v) ? [] : [`expected number values`]);

		case "string":

			return values.flatMap(v => isString(v) ? [] : [`expected string values`]);

		case "local":

			return values.flatMap(v => isLocalModel(v) ? [] : [`expected local values`]);

		case "locals":

			return values.flatMap(v => isLocalsModel(v) ? [] : [`expected locals values`]);

		case "reference":

			const targetShape = materialize(shape.shape);

			return values.flatMap(v =>
				isReference(v) ? []
					: (depth ?? 0) <= 0 && depth !== null ? [`exceeded maximum nesting depth`]
						: isQuery(v) ? validateQuery([v], targetShape, decrement(depth))
							: isModel(v) ? validateModel([v], targetShape, decrement(depth))
								: [`expected reference, model values, or query`]
			);

		case "resource":

			return values.flatMap(v =>
				(depth ?? 0) <= 0 && depth !== null ? [`exceeded maximum nesting depth`]
					: isQuery(v) ? validateQuery([v], shape, decrement(depth))
						: isModel(v) ? validateModel([v], shape, decrement(depth))
							: [`expected model values or query`]
			);

	}

}

/**
 * Decrements a depth counter, returning `null` unchanged.
 *
 * @param depth The current depth limit, or `null` for unlimited
 *
 * @returns `depth - 1` when a number; `null` otherwise
 */
function decrement(depth: null | number | undefined): null | number | undefined {
	return depth === null || depth === undefined ? depth : depth-1;
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Enforces closed-shape semantics for query values, filtering out operator-prefixed criterion keys before checking.
 *
 * Only plain identifier keys are validated against the shape; operator-prefixed keys are handled separately by
 * {@link validateQueryCriteria}.
 *
 * @param value The query value to validate
 * @param labels The set of known property labels from the shape
 *
 * @returns A record mapping each unexpected identifier key to an error trace
 */
function validateQueryEnvelope(value: Object, labels: Set<string>): Record<string, Trace> {

	return validateEnvelope(
		Object.fromEntries(Object.entries(value).filter(([key]) => isIdentifier(key))),
		labels
	);

}

/**
 * Validates operator-prefixed filter and ordering criterion keys in a query value.
 *
 * Decodes each criterion key and resolves the embedded property path through nested shapes via
 * {@link resolvePath}. Malformed keys are reported directly.
 *
 * @param value The query value to validate
 * @param properties The resolved properties map
 *
 * @returns A trace of validation errors for unresolvable or malformed criteria
 */
function validateQueryCriteria(value: Object, properties: Properties): Trace {

	return Object.keys(value)
		.filter(key => !isIdentifier(key) && key !== "@" && key !== "#")
		.flatMap(key => {

			try {

				const { path } = decodeCriterion(key);

				return resolvePath(path, properties);

			} catch {
				return [`malformed criterion <${key}>`];
			}

		});

}

/**
 * Resolves a criterion path against a shape's property hierarchy.
 *
 * Walks each segment of the path through nested shapes, resolving `reference` and `resource` properties
 * to their nested `ResourceShape`. For `union` properties, accepts if at least one variant resolves the
 * remaining path. Reports an error if a segment references an undefined property or a leaf shape that
 * cannot be traversed further.
 *
 * @param path The property path segments from {@link decodeCriterion}
 * @param properties The resolved properties to validate against
 *
 * @returns A trace of validation errors, empty if the full path resolves successfully
 */
function resolvePath(path: readonly string[], properties: Properties): Trace {

	const [segment, ...rest] = path;
	const entry = segment !== undefined ? properties[segment] : undefined;

	return segment === undefined ? []
		: entry === undefined || entry.kind !== "property" ? [`criterion references undefined property <${segment}>`]
			: rest.length === 0 ? []
				: resolvePath(rest, resolveRange(entry.range));

}

/**
 * Resolves the nested properties of a property range for criterion path traversal.
 *
 * For ranges with union shapes, merges properties from all variants to accept paths valid in any branch.
 *
 * @param range The property range to resolve
 *
 * @returns The nested properties, empty for leaf shapes
 */
function resolveRange(range: Range): Properties {
	return range.shape.kind === "union"
		? Object.assign({}, ...Object.values(range.shape.variants).map(v => resolveShape(v)))
		: resolveShape(range.shape);
}

/**
 * Extracts the properties from a value shape for criterion path traversal.
 *
 * Only `reference` and `resource` shapes carry nested properties; leaf shapes return an empty map.
 *
 * @param shape The value shape to resolve
 *
 * @returns The nested properties, empty for leaf shapes
 */
function resolveShape(shape: ValueShape): Properties {
	return shape.kind === "reference" ? resolveInheritance(materialize(shape.shape)).properties
		: shape.kind === "resource" ? resolveInheritance(shape).properties
			: {};
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
