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
 * Reference shape operators.
 *
 * @module
 */

import type { Lazy } from "@metreeca/core";
import { map } from "@metreeca/core/combo";
import { equals, immutable } from "@metreeca/core/deep";
import { resolve } from "@metreeca/core/resource";
import { defaultBase, isReference, type Reference } from "@metreeca/qest";
import { collect, every, group, TraceError } from "./index.core.js";
import type { Trace } from "./index.js";
import type { ReferenceShape } from "./reference.js";
import { match } from "./resource.core.js";
import type { ResourceShape } from "./resource.js";
import { eager, type Shape } from "./value.js";


/**
 * Reports whether an overriding reference shape narrows an inherited base shape.
 *
 * Tests the override relation without building the merged shape: a reference carries no tightenable constraints, so
 * `target` narrows `source` exactly when their `model` matches, the non-overridable fields (`foreign`, `captive`) are
 * not redefined, and the target shapes are equal. Returns a keyed {@link Trace} describing the obstacles otherwise.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns A keyed trace of narrowing obstacles, or `undefined` when `target` narrows `source`
 */
export function narrowsReference(target: ReferenceShape, source: ReferenceShape): undefined | Trace {

	return collect({

		// structural: model must be strictly equal

		"{model}": target.model === source.model
			|| `mismatched types <${target.model}> and <${source.model}>`,

		// inherited: foreign must not be redefined by target (exact match tolerated for diamond inheritance)

		"{foreign}": target.foreign === undefined || target.foreign === source.foreign
			|| `unexpected <foreign> redefinition`,

		// inherited: captive must not be redefined by target (exact match tolerated for diamond inheritance)

		"{captive}": target.captive === undefined || target.captive === source.captive
			|| `unexpected <captive> redefinition`,

		// structural: the target shape cannot be overridden (an equivalent target is tolerated for diamond
		// inheritance; nested forward references compare by their Lazy identity, so recursive shapes terminate)

		"{shape}": equals(eager(target.shape), eager(source.shape))
			|| `unexpected <shape> redefinition`

	});

}

/**
 * Merges an overriding reference shape with an inherited base shape.
 *
 * Validates `model` strict equality and rejects redefinition of non-overridable fields (`foreign`, `captive`, `shape`).
 * Non-overridable fields are inherited from the source; `kind` and `model` are structural.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns The merged shape with combined constraints
 *
 * @throws {TraceError} On incompatible overrides
 */
export function mergeReference(target: ReferenceShape, source: ReferenceShape): ReferenceShape {

	const trace = narrowsReference(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible reference shape override", trace);
	}

	return immutable({

		kind: target.kind,
		model: target.model,

		...source.foreign !== undefined && { foreign: source.foreign },
		...source.captive !== undefined && { captive: source.captive },

		shape: source.shape

	});

}

/**
 * Derives a legal prototype model for a reference shape, throwing when none can be drawn.
 *
 * Draws the shortest `in` member, else the shortest `hasValue` member, else an identifier synthesised from the target
 * `pattern` template (filling `{name}` placeholders and a trailing `/*` wildcard with a sample segment, prefixing
 * root-relative templates with the default `app:` scheme to make them absolute), falling back to `app:/`. The drawn
 * value is validated against the target `pattern` and `in` constraints (the set-level `hasValue` is dropped, as a
 * single sample cannot satisfy a multi-value requirement) and a {@link TraceError} is thrown when it is not a legal
 * member of the target's identifier space.
 *
 * @param shape The reference shape whose target identifier constraints the model must satisfy
 *
 * @returns A legal prototype model identifier
 *
 * @throws {TraceError} When the resolved model is not legal
 */
export function deriveReference({ shape }: ReferenceShape): Reference {

	return map(eager(shape), (target) => {

		const { pattern, in: allowed, hasValue } = target;

		const value: Reference = allowed !== undefined ? minimal(allowed)
			: hasValue !== undefined ? minimal(hasValue)
				: pattern !== undefined ? synthesise(pattern)
					: "app:/";

		function minimal(values: readonly Reference[]): Reference {
			return values.reduce((a, b) => b.length < a.length ? b : a);
		}

		function synthesise(template: string): Reference {
			return resolve(defaultBase, template.replace(/\{\w*}/g, "0").replace(/\/\*$/, "/0"));
		}

		// self-validate by reusing the regular validator, dropping the set-level hasValue (a single sample cannot
		// satisfy a multi-value requirement)

		const trace = validateReference([value], {
			kind: "reference",
			model: value,
			shape: () => ({ ...target, hasValue: undefined })
		});

		if ( trace !== undefined ) {
			throw new TraceError("inconsistent reference shape constraints", trace);
		}

		return value;

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a {@link ReferenceShape}.
 *
 * Filters input values by type, reporting non-reference values under the `kind` key, then enforces
 * reference constraints on matched values.
 */
export function validateReference(values: readonly unknown[], shape: ReferenceShape, {

	placeholder=false

}: {

	placeholder?: boolean

}={}): undefined | Trace {

	const matching = values.filter(isReference);
	const mistyped = values.length-matching.length;

	const target = eager(shape.shape);

	const patterns = target.pattern !== undefined ? [target.pattern] : [];
	const allowed = target.in !== undefined ? [target.in] : [];
	const required = placeholder || target.hasValue === undefined ? [] : [target.hasValue];

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


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves a reference range to its target {@link ResourceShape | resource shape}.
 *
 * Crosses a reference range to its eagerly-resolved target, and takes a resource range to itself, generalising a
 * resource shape as an already-resolved reference. Yields `undefined` for any range that admits no properties
 * (scalar, localised). It takes a single variant: flatten a union range through {@link union!getShapeVariants} first,
 * so colliding variant property names stay distinct rather than merging.
 *
 * @param shape One of the range {@link union!getShapeVariants | variants}
 *
 * @returns The target resource shape, or `undefined` when `shape` admits no properties
 */
export function getShapeTarget(shape: Lazy<Shape>): undefined | ResourceShape {
	return map(eager(shape), shape =>
		shape.kind === "resource" ? shape
			: shape.kind === "reference" ? eager(shape.shape)
				: undefined
	);
}
