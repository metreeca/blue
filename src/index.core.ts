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
 * Value shape operators.
 *
 * @module
 */

import { isArray, isIdentifier, isObject } from "@metreeca/core";
import { immutable } from "@metreeca/core/deep";
import { mergeBoolean, validateBoolean } from "./boolean.core.js";
import type { BooleanShape } from "./boolean.js";
import { materialize } from "./core/cache.js";
import { collect, TraceError, wrap } from "./core/trace.js";
import type { SetShape, Trace, UnionShape, ValuesShape } from "./index.js";
import { mergeLocalised, validateLocalised } from "./localised.core.js";
import type { LocalisedShape } from "./localised.js";
import { mergeNumber, validateNumber } from "./number.core.js";
import type { NumberShape } from "./number.js";
import { mergeReference, mergeResource, validateReference, validateResource } from "./resource.core.js";
import { type ReferenceShape, type ResourceShape } from "./resource.js";
import { mergeString, validateString } from "./string.core.js";
import { type StringShape } from "./string.js";


/**
 * Checks internal consistency of {@link SetShape} constraints.
 *
 * @param constraints The constraint fields to check
 *
 * @returns A keyed trace of violations, or `undefined` if all constraints are consistent
 */
export function checkValues({

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
 * Validates values against a shape, dispatching to the appropriate type-specific validator.
 *
 * @param values The values to validate
 * @param shape The shape defining validation constraints
 *
 * @returns A keyed trace of validation errors, or `undefined` if all values are valid
 */
export function validateValue(values: readonly unknown[], shape: ValuesShape): undefined | Trace {

	switch ( shape.kind ) {

		case "boolean":

			return validateBoolean(values, shape);

		case "number":

			return validateNumber(values, shape);

		case "string":

			return validateString(values, shape);

		case "localised":

			return validateLocalised(values, shape);

		case "reference":

			return validateReference(values, shape);

		case "resource":

			return validateResource(values, shape);

	}

}

/**
 * Validates a scalar union value against a {@link UnionShape}.
 *
 * Expects an {@link @metreeca/qest!Indexed | Indexed} container with exactly one key matching a variant name.
 * The value is unwrapped and validated against the matched variant; reference variants are dereferenced through
 * their target resource shape.
 *
 * @param values The values to validate; at most one object value is expected
 * @param union The union shape defining the variant alternatives
 *
 * @returns A keyed trace of validation errors, or `undefined` if the value is valid
 *
 * @see {@link validateArrayUnion} for multi-valued union validation
 */
export function validateScalarUnion(values: readonly unknown[], union: UnionShape): undefined | Trace {

	if ( values.length === 0 ) {

		return undefined;

	} else if ( values.length > 1 ) {

		return collect({ "{kind}": "expected at most one <union> value" });

	} else if ( !values.every(v => isObject(v)) ) {

		return collect({ "{kind}": "expected <union> value" });

	} else {

		const entries = Object.entries(values[0]);
		const variants = Object.keys(union.variants);

		const invalid = entries.reduce((trace, [key, entry]) => {

			return !isIdentifier(key) ? { ...trace, [key]: "expected identifier key" }
				: !(key in union.variants) ? { ...trace, [key]: `expected variant key in [${variants.join(", ")}]` }
					: isArray(entry) ? { ...trace, [key]: "expected scalar value" }
						: entries.length > 1 ? { ...trace, [key]: "expected at most one variant key" }
							: trace;

		}, {});

		if ( Object.keys(invalid).length > 0 ) {

			return invalid;

		} else {

			return collect(Object.fromEntries(
				entries.map(([key, entry]) => {

					const variant = union.variants[key];

					// dereference through reference shapes to validate against the target resource

					return [key, variant.kind === "reference"
						? validateResource([entry], materialize(variant.shape))
						: validateValue([entry], variant)
					];

				})
			));

		}
	}
}

/**
 * Validates a multi-valued union record against a {@link UnionShape}.
 *
 * Expects an {@link @metreeca/qest!Indexed | Indexed} record mapping variant names to arrays of values. Each key
 * must be a recognised variant name and each entry must be an array. Array elements are validated against the
 * corresponding variant shape; reference variants are dereferenced through their target resource shape.
 *
 * @param values The values to validate; at most one object value is expected
 * @param union The union shape defining the variant alternatives
 *
 * @returns A keyed trace of validation errors, or `undefined` if the record is valid
 *
 * @see {@link validateScalarUnion} for scalar union validation
 */
export function validateArrayUnion(values: readonly unknown[], union: UnionShape): undefined | Trace {

	if ( values.length === 0 ) {

		return undefined;

	} else if ( values.length > 1 ) {

		return collect({ "{kind}": "expected at most one <union> value" });

	} else if ( !values.every(v => isObject(v)) ) {

		return collect({ "{kind}": "expected <union> value" });

	} else {

		const entries = Object.entries(values[0]);
		const variants = Object.keys(union.variants);

		const invalid = entries.reduce((trace, [key, entry]) => {

			return !isIdentifier(key) ? { ...trace, [key]: "expected identifier key" }
				: !(key in union.variants) ? { ...trace, [key]: `expected variant key in [${variants.join(", ")}]` }
					: !isArray(entry) ? { ...trace, [key]: "expected array value" }
						: trace;

		}, {});

		if ( Object.keys(invalid).length > 0 ) {

			return invalid;

		} else {

			return collect(Object.fromEntries(
				entries.map(([key, entry]) => {

					const variant = union.variants[key];

					// dereference through reference shapes to validate against the target resource

					return [key, variant.kind === "reference"
						? validateResource(entry as unknown[], materialize(variant.shape))
						: validateValue(entry as unknown[], variant)
					];

				})
			));

		}

	}

}


/**
 * Merges an overriding value shape with an inherited base shape.
 *
 * Dispatches to the appropriate shape-specific merge function based on the `kind` discriminator.
 * Both shapes must have the same `kind`; a mismatch throws a `RangeError`.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns The merged shape
 *
 * @throws {TraceError} On kind mismatch or incompatible overrides
 */
export function mergeValue<T extends ValuesShape>(target: T, source: T): T {

	switch ( target.kind ) {

		case "boolean":

			return mergeBoolean(target, source as BooleanShape) as T;

		case "number":

			return mergeNumber(target, source as NumberShape) as T;

		case "string":

			return mergeString(target, source as StringShape) as T;

		case "localised":

			return mergeLocalised(target, source as LocalisedShape) as T;

		case "reference":

			return mergeReference(target, source as ReferenceShape) as T;

		case "resource":

			return mergeResource(target, source as ResourceShape) as T;

	}

}

/**
 * Merges an overriding {@link SetShape} with an inherited base.
 *
 * Validates that the override narrows cardinality constraints and that the value shape kinds match,
 * then delegates to the appropriate value shape or union merge function.
 *
 * @param target The overriding child {@link SetShape}
 * @param source The inherited parent {@link SetShape}
 *
 * @returns The merged {@link SetShape}
 *
 * @throws {TraceError} On widened constraints, kind mismatch, or incompatible overrides
 */
export function mergeValues(target: SetShape, source: SetShape): SetShape {

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

		...wrap(checkValues({ minCount, maxCount }))

	});

	if ( trace !== undefined ) {
		throw new TraceError("incompatible value set override", trace);
	}

	// build value set shape

	const isScalar = maxCount === 1;

	const shape = target.shape.kind === "union"
		? mergeUnion(target.shape, source.shape as UnionShape)
		: mergeValue(target.shape as ValuesShape, source.shape as ValuesShape);

	const model = isScalar ? shape.model
		: shape.kind === "union"
			? Object.fromEntries(Object.entries(shape.model).map(([key, value]) => [key, [value]]))
			: [shape.model];

	return immutable({

		kind: target.kind,

		minCount,
		maxCount,

		shape,
		model

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
