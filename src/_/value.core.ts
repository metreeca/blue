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

import { assert, error, type Identifier, isFunction, isString, type Lazy, type Optional } from "@metreeca/core";
import { unique } from "@metreeca/core/arrays";
import { xsd } from "@metreeca/core/datatype";
import { equals, immutable } from "@metreeca/core/structures";
import { all, test, type Trace, TraceError } from "@metreeca/core/trace";
import { app } from "@metreeca/qest";
import { isProbe, type Probe, type Transform, Transforms } from "@metreeca/qest/template";
import { mergeBoolean, narrowsBoolean, validateBoolean } from "./boolean.core.js";
import type { BooleanShape } from "./boolean.js";
import {
	deriveDictionary,
	mergeDictionary,
	narrowsDictionary,
	validateDictionary,
	validateLocales
} from "./dictionary.core.js";
import type { DictionaryShape } from "./dictionary.js";
import { type Scope, sh } from "./index.core.js";
import { mergeNumber, narrowsNumber, validateNumber } from "./number.core.js";
import { decimal, integer, type NumberShape } from "./number.js";
import { getShapeTarget, mergeReference, narrowsReference, validateReference } from "./reference.core.js";
import type { ReferenceShape } from "./reference.js";
import {
	deriveResource,
	flatten,
	mergeResource,
	narrowsResource,
	validateResource,
	validateTemplate
} from "./resource.core.js";
import { type ResourceShape } from "./resource.js";
import { mergeString, narrowsString, validateString } from "./string.core.js";
import { string, type StringShape } from "./string.js";
import { deriveUnion, mergeUnion, narrowsUnion } from "./union.core.js";
import type { UnionShape } from "./union.js";
import { type RangeShape, type Resolved, type Schema, type SetShape, type Shape, type ValuesShape } from "./value.js";


/**
 * Temporal processing datatypes.
 *
 * The comparable temporal datatypes (`xsd:date`, `xsd:time`, `xsd:dateTime`) qest admits to the `temporal`
 * transform domain. Used by {@link effective} to distinguish temporal strings from plain strings when checking
 * transform compatibility. Excludes opaque temporal datatypes like `xsd:gYear` and `xsd:duration`, which qest
 * treats as ordinary `xsd:string`.
 *
 * @see {@link https://metreeca.github.io/qest/documents/model.Model_Design.html Model Design}
 */
const Temporal: ReadonlySet<string> = new Set([
	xsd.date,
	xsd.time,
	xsd.dateTime
]);

/**
 * Effective range for an `id` / `type` field.
 *
 * The scalar absolute IRI that an `id` or `type` property resolves to during {@link effective} path traversal: a
 * single-valued {@link RangeShape} whose sole variant is a string carrying the `sh:IRI` datatype marker, so downstream
 * processors map the value to an RDF IRI rather than a typed literal. Shared as a module constant since every `id` /
 * `type` step resolves to the same shape.
 */
const IRIShape: RangeShape = immutable({

	kind: "range",

	maxCount: 1,

	variants: [string({

		model: "https://example.net/",
		datatype: sh.IRI,
		pattern: /^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$/

	})]

});


/**
 * Cache for eager shapes resolved from lazy factories.
 *
 * Maps each factory to its eager {@link Shape} or resolved {@link RangeShape}, so {@link eager} resolves it once and
 * reuses it across calls. Uses WeakMap so entries are released when the factory is no longer referenced. A `null` entry
 * signals a shape currently being resolved, enabling circular dependency detection.
 */
const shapes = new WeakMap<() => Shape | RangeShape, null | Shape | RangeShape>();

/**
 * Cache for retrieval models derived from lazy factories.
 *
 * Maps each factory to the model {@link deriveValue | derived} from its eager {@link Shape}, so {@link model}
 * derives it once and reuses it across calls. Derivation stays lazy, deferred to the first request rather than
 * performed during {@link eager} shape resolution, which runs while shapes are still under construction and their
 * self-referential reference targets are not yet resolvable. Uses WeakMap so entries are released when the factory is
 * no longer referenced. A `null` entry signals a model currently being derived, enabling circular dependency detection.
 */
const models = new WeakMap<() => Shape, null | Schema<Shape>>();


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks internal consistency of {@link SetShape} constraints.
 *
 * @param constraints The constraint fields to check
 *
 * @returns A keyed trace of violations, or `undefined` if all constraints are consistent
 */
export function checkValues(constraints: Partial<SetShape>): Optional<Trace> {

	return all<typeof constraints>(
		test(({ minCount, maxCount }) => {

			return minCount === undefined || maxCount === undefined || minCount <= maxCount || [
				`{minCount/maxCount} inconsistent bounds <${minCount}> > <${maxCount}>`
			];

		})
	)(constraints);

}


/**
 * Reports whether an overriding value shape narrows an inherited base shape.
 *
 * Tests the override relation without building the merged shape: returns `undefined` when `target` is a valid
 * narrowing of `source` (matching `kind` and only-tightening constraints), or a keyed {@link Trace} describing the
 * obstacles otherwise. Dispatches by `kind`; a `kind` mismatch is itself reported as an obstacle, so the predicate is
 * total over any pair of value shapes. Companion to {@link mergeValue}, which builds the merged shape after the same
 * check; the two share the narrowing relation so that a `undefined` result here guarantees a successful
 * {@link mergeValue}.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns A keyed trace of narrowing obstacles, or `undefined` when `target` narrows `source`
 */
export function narrowsValue(target: ValuesShape, source: ValuesShape): Optional<Trace> {

	// kind-equality guard: a mismatch is reported rather than dispatched, so each per-kind branch is reached only when
	// both shapes share target.kind — the source casts below merely bridge a gap the type system cannot see

	return target.kind !== source.kind ? [`{kind} mismatched kinds <${target.kind}> vs <${source.kind}>`]
		: target.kind === "boolean" ? narrowsBoolean(target, source as BooleanShape)
			: target.kind === "number" ? narrowsNumber(target, source as NumberShape)
				: target.kind === "string" ? narrowsString(target, source as StringShape)
					: target.kind === "dictionary" ? narrowsDictionary(target, source as DictionaryShape)
						: target.kind === "reference" ? narrowsReference(target, source as ReferenceShape)
							: narrowsResourceValue(target, source as ResourceShape);


	/**
	 * Reports whether an overriding resource shape narrows an inherited base shape as a value.
	 *
	 * Strengthens {@link narrowsResource} with class subtyping: a resource *value* of the target narrows the base only
	 * when it carries every class the base declares (an instance of a different class is not an instance of the base),
	 * unlike the class-conjunctive composition {@link mergeResource} performs for `extends`. This is the discriminating
	 * relation used to pair resource variants of a {@link UnionShape | union}.
	 *
	 * @param target The overriding child shape
	 * @param source The inherited parent shape
	 *
	 * @returns A keyed trace of narrowing obstacles, or `undefined` when `target` narrows `source` as a value
	 */
	function narrowsResourceValue(target: ResourceShape, source: ResourceShape): Optional<Trace> {

		return all<ResourceShape>(
			test(shape => {

				return classesOf(source).every(iri => classesOf(shape).includes(iri)) || [
					`{class} missing base classes [${classesOf(source).filter(iri => !classesOf(shape).includes(iri))}]`
				];

			}),
			() => narrowsResource(target, source)
		)(target);


		function classesOf({ class: cls, classes }: ResourceShape): readonly string[] {
			return [...cls !== undefined ? [cls] : [], ...classes ?? []];
		}

	}

}

/**
 * Reports whether an overriding {@link SetShape} narrows an inherited base.
 *
 * Tests the override relation without building the merged set: returns `undefined` when the override only tightens
 * cardinality (`minCount` not lowered, `maxCount` not raised), the merged bounds stay consistent, and the wrapped
 * shape narrows the base shape via {@link narrowsShape}; returns a keyed {@link Trace} of obstacles otherwise.
 *
 * @param target The overriding child {@link SetShape}
 * @param source The inherited parent {@link SetShape}
 *
 * @returns A keyed trace of narrowing obstacles, or `undefined` when `target` narrows `source`
 */
export function narrowsValues(target: SetShape, source: SetShape): Optional<Trace> {

	return all<SetShape>(
		test(({ minCount }) => {

			return minCount === undefined || source.minCount === undefined || minCount >= source.minCount || [
				`{minCount} widened limit <${minCount}> beyond <${source.minCount}>`
			];

		}),
		test(({ maxCount }) => {

			return maxCount === undefined || source.maxCount === undefined || maxCount <= source.maxCount || [
				`{maxCount} widened limit <${maxCount}> beyond <${source.maxCount}>`
			];

		}),
		() => narrowsShape(target.shape, source.shape), // structural: child shape narrows base
		() => checkValues({ // post-merge constraint consistency
			minCount: target.minCount ?? source.minCount,
			maxCount: target.maxCount ?? source.maxCount
		})
	)(target);


	/**
	 * Reports whether an overriding shape narrows an inherited base shape.
	 *
	 * Generalises {@link narrowsValue} to {@link UnionShape | unions}: a union base is narrowed by a union child
	 * through
	 * {@link narrowsUnion}, or by a non-union child that narrows exactly one base variant; a non-union base is
	 * narrowed
	 * through {@link narrowsValue}, and a union child against a non-union base is a kind mismatch.
	 *
	 * @param target The overriding child shape
	 * @param source The inherited parent shape
	 *
	 * @returns A keyed trace of narrowing obstacles, or `undefined` when `target` narrows `source`
	 */
	function narrowsShape(target: Shape, source: Shape): Optional<Trace> {

		return source.kind === "union"
			? target.kind === "union" ? narrowsUnion(target, source) : narrowsVariant(target, source)
			: target.kind === "union" ? [`{kind} mismatched kinds <union> vs <${source.kind}>`]
				: narrowsValue(target, source);

	}

	/**
	 * Reports whether a non-union child narrows exactly one variant of a base union.
	 *
	 * @param target The overriding child value shape (non-union)
	 * @param source The inherited parent {@link UnionShape}
	 *
	 * @returns A narrowing obstacle, or `undefined` when `target` narrows exactly one base variant
	 */
	function narrowsVariant(target: ValuesShape, source: UnionShape): Optional<Trace> {

		const matches = source.variants.filter(base => narrowsValue(target, base) === undefined);

		return matches.length === 1 ? undefined
			: matches.length === 0 ? [`narrows no base variant`]
				: [`narrows several base variants`];

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

		case "dictionary":

			return mergeDictionary(target, source as DictionaryShape) as T;

		case "reference":

			return mergeReference(target, source as ReferenceShape) as T;

		case "resource":

			return mergeResource(target, source as ResourceShape) as T;

	}

}

/**
 * Merges an overriding {@link SetShape} with an inherited base.
 *
 * Validates the override via {@link narrowsValues}, then builds the merged set. When the base shape is a
 * {@link UnionShape | union} the wrapped shape is merged through {@link mergeUnion}, or, for a non-union child,
 * collapsed to the single base variant it narrows; otherwise it is merged through {@link mergeValue}.
 *
 * @param target The overriding child {@link SetShape}
 * @param source The inherited parent {@link SetShape}
 *
 * @returns The merged {@link SetShape}
 *
 * @throws {TraceError} On widened constraints, kind mismatch, or incompatible overrides
 */
export function mergeValues(target: SetShape, source: SetShape): SetShape {

	const trace = narrowsValues(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible value set override", trace);
	}

	// merged constraints

	const minCount = target.minCount ?? source.minCount;
	const maxCount = target.maxCount ?? source.maxCount;

	// build value set shape

	const isScalar = maxCount === 1;

	const shape: Shape = source.shape.kind === "union"
		? target.shape.kind === "union"
			? mergeUnion(target.shape, source.shape)
			: narrow(target.shape, source.shape)
		// ;(cast) narrowsValues confirmed both shapes share a non-union kind
		: mergeValue(target.shape as ValuesShape, source.shape);

	const model = isScalar ? shape.model : [shape.model];

	// ;(cast) structural object literal widened to the SetShape generic
	return immutable({

		kind: target.kind,

		minCount,
		maxCount,

		shape,
		model

	}) as SetShape;


	/**
	 * Narrows a base {@link UnionShape} to the single non-union value shape the child narrows.
	 *
	 * Selects the unique base variant the child narrows (by {@link narrowsValue}) and merges them via
	 * {@link mergeValue}. Rejects when the child narrows no base variant or several.
	 *
	 * @param target The overriding child value shape (non-union)
	 * @param source The inherited parent {@link UnionShape}
	 *
	 * @returns The merged value shape
	 *
	 * @throws {TraceError} When the child narrows no or several base variants
	 */
	function narrow(target: ValuesShape, source: UnionShape): ValuesShape {

		const matches = source.variants.filter(base => narrowsValue(target, base) === undefined);

		if ( matches.length === 0 ) {
			throw new TraceError("incompatible value set override", ["{shape} narrows no base variant"]);
		}

		if ( matches.length > 1 ) {
			throw new TraceError("incompatible value set override", ["{shape} narrows several base variants"]);
		}

		// ;(cast) narrowsValue guarantees matches[0] shares target's kind
		return mergeValue(target, matches[0] as typeof target);

	}

}


/**
 * Derives the retrieval model for a value shape.
 *
 * Dispatches on the shape kind. Scalar shapes (boolean, number, string, reference) return their stored `model`
 * placeholder, defaulting an unspecified one to the kind's trivial value (`false`, `0`, `""`, the default base IRI).
 * Dictionary, resource, and union shapes derive a structural placeholder: a dictionary a per-language placeholder map,
 * a resource its property template, and a union its per-variant model map.
 *
 * @typeParam S The value {@link Shape} to derive from
 *
 * @param shape The shape whose model to derive
 *
 * @returns The derived model, typed by {@link Schema} to preserve cardinality-driven optionality, nested resource
 *     models, and union variants
 */
export function deriveValue<S extends Shape>(shape: S): Schema<S> {

	switch ( shape.kind ) {

		case "boolean":

			return shape.model ?? false;

		case "number":

			return shape.model ?? 0;

		case "string":

			return shape.model ?? "";

		case "dictionary":

			return shape.model ?? deriveDictionary(shape);

		case "reference":

			return shape.model ?? app;

		case "resource":

			return deriveResource(shape);

		case "union":

			return deriveUnion(shape);

	}

}

/**
 * Derives the retrieval placeholder for a value set.
 *
 * Derives the wrapped shape's value through {@link deriveValue} and projects it at the set's cardinality, mirroring the
 * {@link cardinality} factory: a localised {@link dictionary!dictionary | dictionary} set keeps its per-tag map
 * (derived through {@link deriveValue}, so its stored model is honored), a scalar set (`maxCount === 1`) holds the
 * value directly, and a multi-valued set holds a singleton `[value]` tuple.
 *
 * @param set The value set whose placeholder to derive
 *
 * @returns The derived set placeholder
 */
export function deriveValues({ shape, maxCount }: SetShape): unknown {

	return shape.kind === "dictionary"

		// localised: cardinality applies per tag within the map, so wrap each tag's content

		? Object.fromEntries(Object.entries(deriveValue(shape)).map(([tag, content]) =>
			[tag, maxCount === 1 ? content : [content]]
		))

		: maxCount === 1 ? deriveValue(shape)
			: [deriveValue(shape)];

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a shape, dispatching to the appropriate type-specific validator.
 *
 * @param values The values to validate
 * @param shape The shape defining validation constraints
 * @param opts Validation options
 * @param opts.scope The validation scope: `"state"` enforces every constraint; `"bound"` keeps the syntactic
 *     discriminators (`kind`, `pattern`) but skips the value-domain magnitude constraints, so a relational bound that
 *     lies outside the domain still routes; `"model"` matches by kind alone, validating a localised dictionary as a
 *     `Locales` placeholder and nested resources as retrieval templates. Defaults to `"state"`
 *
 * @returns A keyed trace of validation errors, or `undefined` if all values are valid
 */
export function validateValue(values: readonly unknown[], shape: ValuesShape, {

	scope = "state"

}: {

	scope?: Scope

} = {}): Optional<Trace> {

	switch ( shape.kind ) {

		case "boolean":

			return validateBoolean(values, shape, { scope });

		case "number":

			return validateNumber(values, shape, { scope });

		case "string":

			return validateString(values, shape, { scope });

		case "dictionary":

			return scope === "state"
				? validateDictionary(values, shape)
				: validateLocales(values);

		case "reference":

			return validateReference(values, shape, { scope });

		case "resource":

			return scope === "state"
				? validateResource(values, shape)
				: validateTemplate(values, shape, {});

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Builds the value range of a property from a shape and cardinality bounds.
 *
 * Resolves the range shape and projects its model to the form the bounds call for: a
 * {@link dictionary!DictionaryShape | dictionary} model is projected per tag within its language map; every other
 * multi-valued model is held as a singleton `[element]` tuple, the collection form of the
 * {@link @metreeca/qest!Query | Query} grammar. A retrieval {@link @metreeca/qest!Selection | Selection} is supplied
 * per request in the template, never declared on the shape.
 *
 * @param range The shape the values belong to, possibly deferred to a factory
 * @param lower Minimum number of expected values
 * @param upper Maximum number of expected values
 *
 * @returns An immutable {@link SetShape} over `range` with the given bounds
 *
 * @throws {@link !TypeError TypeError} If `lower` or `upper` is negative, or if `lower` exceeds `upper`
 */
export function buildValues(
	range: Lazy<Shape>,
	lower: undefined | number,
	upper: undefined | number
): SetShape {

	if ( lower !== undefined && lower < 0 ) {
		throw new TypeError(`expected non-negative minCount <${lower}>`);
	}

	if ( upper !== undefined && upper < 0 ) {
		throw new TypeError(`expected non-negative maxCount <${upper}>`);
	}

	if ( lower !== undefined && upper !== undefined && lower > upper ) {
		throw new TypeError(`inconsistent bounds <${lower}> > <${upper}>`);
	}

	const resolved = eager(range);

	const model = resolved.kind === "dictionary"
		? Object.fromEntries(Object.entries(resolved.model).map(([tag, value]) =>
			[tag, upper === 1 ? value : [value]]
		))
		: upper === 1 ? resolved.model
			: [resolved.model];

	return immutable({

		kind: "set",
		model,

		minCount: lower,
		maxCount: upper,

		shape: resolved

	});

}


/**
 * Resolves a {@link Lazy} shape to its eager form, caching the result on repeated calls.
 *
 * When given a factory, evaluates it on first call and caches the outcome; subsequent calls
 * return the cached shape. {@link ResourceShape | Resource} shapes are flattened during
 * resolution; other shapes, including a resolved {@link RangeShape}, pass through unchanged.
 *
 * @typeParam S The {@link Lazy} {@link Shape} or {@link RangeShape} type
 *
 * @param shape A shape value or no-arg factory returning one
 *
 * @returns The eager shape, with resource shapes flattened
 *
 * @throws {TraceError} If the factory transitively references itself, producing a circular extends chain
 */
export function eager<S extends Lazy<Shape | RangeShape>>(shape: S): Resolved<S> {

	if ( isFunction(shape) ) {

		const cached = shapes.get(shape);

		if ( cached === null ) {

			throw new TraceError("circular extends chain", [{
				[shape.name || "<anonymous>"]: ["circular dependency"]
			}]);

		} else if ( cached === undefined ) {

			shapes.set(shape, null);

			try {

				const resolved = shape();
				const flattened = (resolved.kind === "resource" ? flatten(resolved) : resolved);

				shapes.set(shape, flattened);

				return flattened as Resolved<S>;

			} catch ( error ) {

				shapes.delete(shape);

				throw error;

			}

		} else {

			return cached as Resolved<S>;

		}

	} else {

		return (shape.kind === "resource" ? flatten(shape) : shape) as Resolved<S>;

	}

}

/**
 * Extracts the deeply typed retrieval template from a {@link Lazy} shape.
 *
 * Resolves the shape eagerly and returns its model, an ergonomic shortcut for obtaining a typed template without
 * explicit field access. The return type is computed by {@link Schema}, which preserves cardinality-driven optionality,
 * nested resource models, and union variants in full structural detail. For a lazy factory the model is derived once
 * on first request and memoised, so repeated calls reuse it.
 *
 * Scalar and {@link reference!ReferenceShape | reference} models are returned as the stored placeholder; a
 * {@link union!UnionShape | union} model is rebuilt from its per-variant models, and dictionary and resource models are
 * likewise returned as stored. A resource template is derived by recursing through its members, resolving the target
 * on access to support the circular and self-referential definitions the {@link resource!resource | resource} factory
 * admits.
 *
 * @typeParam S The lazy {@link Shape} to extract from
 *
 * @param shape The shape (or lazy factory) whose model to extract
 *
 * @returns The shape's model
 *
 * @throws {TraceError} When a lazy factory transitively references itself, producing a circular extends chain
 */
export function model<S extends Lazy<Shape>>(shape: S): Schema<S> {

	if ( isFunction(shape) ) {

		const cached = models.get(shape);

		if ( cached === null ) {

			throw new TraceError("circular extends chain", [{
				[shape.name || "<anonymous>"]: ["circular dependency"]
			}]);

		} else if ( cached !== undefined ) {

			// the cache erases the factory's generic, so the model is recovered as Schema<S> at this boundary

			return cached as Schema<S>;

		} else {

			models.set(shape, null);

			try {

				const model = error("tbi !!!")!; // !!! deriveValue(eager(shape));

				models.set(shape, model);

				return model;

			} catch ( error ) {

				models.delete(shape);

				throw error;

			}

		}

	} else {

		return error("tbi !!!")!; // !!! deriveValue(eager(shape));

	}

}


/**
 * Resolve the effective {@link RangeShape} a {@link Probe} yields against a shape.
 *
 * Traverses the {@link Probe.path} segments through nested resource members to locate the target shape, then
 * applies the {@link Probe.pipe} transforms to compute the effective value set with accumulated cardinality.
 *
 * **Shape dispatch:**
 *
 * - {@link ResourceShape}: traverses path segments through nested members
 * - {@link ReferenceShape}: eagerly resolves the lazy target shape, then proceeds as for {@link ResourceShape}
 * - {@link UnionShape}: seeds traversal with each variant, then proceeds as for the per-variant shape
 * - {@link RangeShape}: re-probes a previously resolved range, seeding traversal with each variant carrying the
 *   range's own accumulated cardinality, then proceeds as for the per-variant shape
 * - Other shapes: any non-empty path fails resolution; the empty path applies the transform pipe directly
 *
 * **Path traversal** — at each step, flattens inheritance and looks up the next property. Unknown members cause
 * the path to fail. At {@link UnionShape} boundaries (either at the root or encountered as a property range),
 * variants lacking the property are skipped; the path fails only when no variant defines it. Mid-path traversal past
 * an `id` or `type` field fails as an `"undefined property path"`, since these resolve to scalar IRIs with no
 * traversable structure; terminal `id`/`type` access remains valid.
 *
 * **Pipe application** — applies transforms to the shape resolved by path traversal, reducing each active variant
 * independently when multiple remain. A pipe composing more than one aggregate transform is rejected upfront as
 * `"multiple aggregate transforms"`, independently of the resolved shape. A non-empty pipe is coalesced access to a
 * localised leaf: a dictionary shape contributes the winning tag's value(s) as an ordinary `xsd:string` for domain
 * matching and effective typing, at the leaf's per-tag cardinality (one value for single-string-per-tag, the winning
 * tag's set for array-per-tag). Among processing-space literals (boolean, numeric, plain or temporal string), a
 * transform applied to a literal outside its declared domain drops the offending variant from the effective set:
 * within a union this retains only the compatible branches, so the pipe is well-typed as long as at least one variant
 * survives. The same dropping extends to values outside the processing space (references and resources), which no
 * transform other than `count` can act on. When no variant survives, including a single non-union shape whose sole
 * variant falls outside the pipe's domain, the probe reports `"incompatible transform input"`. The `count` aggregate
 * accepts any value, references included; `min` and `max` accept the literal processing types (boolean, numeric,
 * string, temporal); the remaining transforms accept their declared processing type only. `avg` always yields a
 * `decimal`: the specification narrows its range to `float` for `float` input and `double` for `double` input, but that
 * processing-space distinction is not preserved on egress, so the effective type is reported uniformly as `decimal`.
 * A transform declaring `returns: "same"` reproduces the input's processing type: `min` and `max`, which keep the value
 * within the element domain, preserve the input shape verbatim (value-domain facets included), whereas `sum` combines
 * values and escapes the element domain and datatype range, so it widens to the bare `integer` type for integral input
 * or the bare `decimal` type otherwise, carrying no value-domain facets.
 *
 * **Cardinality** — per-step constraints combine multiplicatively within a branch and by envelope
 * across sibling branches:
 *
 * - *Within a branch* — `minCount` and `maxCount` are the products of per-step bounds; either becomes
 *   `undefined` if any step has that bound undefined. A `0` product stands (for `minCount` an
 *   equivalent encoding of "no lower bound", for `maxCount` the strongest upper bound).
 * - *Across branches* — at entry-union or mid-path union-range crossings, the effective bounds
 *   are the envelope of per-branch products: `minCount` takes the lowest lower bound (`undefined`
 *   absorbs — no lower bound wins), `maxCount` takes the highest upper bound (`undefined` absorbs
 *   — unbounded wins). The effective range admits any reachable branch, so its cardinality
 *   envelopes them all; discrimination to the single driving branch is resolved separately against
 *   the model.
 * - {@link UnionShape} steps themselves contribute no per-step cardinality — the enclosing range
 *   carries the single cardinality shared by all variants.
 * - A **localised step** enters the product like any other: a dictionary property is terminal (no path may
 *   traverse past it) and contributes its per-tag bounds (`maxCount` of `1` for single-string-per-tag,
 *   unbounded for array-per-tag), which multiply into the branch product. A single-string-per-tag leaf
 *   is single-valued on its own, but a multi-valued prefix multiplies through, so a deep coalescible
 *   key is correctly multi-valued for the sort/focus single-valued gates while matching and filtering
 *   stay cardinality-agnostic.
 * - A non-empty pipe sets `minCount` to `1` for the total aggregates `count` and `sum`, which always
 *   yield a value (`0` on the empty set), and to `undefined` for every other transform; scalar transforms
 *   preserve `maxCount`; aggregate transforms set `maxCount` to `1`.
 *
 * @param shape The {@link Shape} to inspect, or a resolved {@link RangeShape} to re-probe
 *
 * @param probe The probe containing property path and transform pipe
 *
 * @returns An immutable {@link RangeShape} effective type carrying the accumulated cardinality and the reachable
 *     value-shape variants when the probe resolves, deduplicated to distinct shapes so an aggregate or
 *     path that collapses the union onto one type yields a single variant. Returns an atomic
 *     {@link Trace} string when the probe cannot be resolved against the shape: `"undefined property path"` if the
 *     path fails to resolve (including a step past a non-traversable `id` / `type` field), `"multiple aggregate
 *     transforms"` if the pipe composes more than one aggregate transform, or `"incompatible transform input"` if no
 *     resolved variant lies within the transform pipe's declared domain
 *
 * @throws {TraceError} If `shape` transitively references itself, producing a circular extends chain
 *
 * @throws {@link !TypeError TypeError} If `probe` is not a well-formed {@link Probe} (a malformed `path`/`pipe`, or a
 *     `pipe` referencing an unknown transform)
 *
 * @see {@link https://metreeca.github.io/qest/documents/model.Model_Design.html Model Design}
 */
export function effective(shape: Lazy<Shape | RangeShape>, probe: Probe): RangeShape | string {

	type Branch = {

		readonly minCount?: number
		readonly maxCount?: number

		readonly variant: ValuesShape

	}


	// defensive: a hand-built probe may carry an unknown transform or a malformed path/pipe, which would
	// otherwise surface as a runtime crash deep in the pipe; reject it up front

	const { pipe, path } = assert(probe, isProbe, "malformed probe");

	// a union shape seeds one traversal per branch; a reference unwraps to its target; any other shape
	// is its own single seed

	const seeds: readonly Branch[] = expand(eager(shape));

	// dedupe as late as possible: aggregate collapse and path convergence may fold the union onto
	// repeated shapes, so a single pass at the boundary keeps the returned range's variants distinct

	const resolved = transform(traverse(seeds));

	return isString(resolved) ? resolved
		: immutable({ ...resolved, variants: unique(resolved.variants, equals) });


	/**
	 * Traverse the property path, enveloping per-branch cumulative cardinalities.
	 *
	 * Folds the path into a cohort of single-variant branches, each one carrying its own path
	 * cumulative `{min,max}`, by flat-mapping each branch's resolved variants at every segment. The seed branches
	 * enter at unit cardinality for a shape input, or at the input {@link RangeShape}'s own bounds when re-probing a
	 * resolved range, so a range's cumulative cardinality composes into the traversal product.
	 * Branches that lack the next property are dropped; `id` / `type` fields resolve to scalar IRIs
	 * with no traversable structure, so a path stepping past them drops as well. A localised step
	 * multiplies its per-tag bounds into the branch product like any other step (see the cardinality
	 * rules on {@link effective}). The surviving cohort is then enveloped across all reachable branches into a
	 * single focus; an exhausted cohort yields `"undefined property path"`.
	 */
	function traverse(seed: readonly Branch[]): RangeShape | string {

		const branches = path.reduce<readonly Branch[]>((branches, segment) =>

				branches.flatMap(branch => {

					const resolved = resolve(branch.variant, segment);

					// skip branches that lack the property

					return resolved === undefined ? [] : resolved.variants.map(variant => ({

						minCount: multiply(branch.minCount, resolved.minCount),
						maxCount: multiply(branch.maxCount, resolved.maxCount),

						variant

					}));

				}),

			seed
		);

		return branches.length === 0 ? "undefined property path" : {

			kind: "range",

			minCount: branches.map(branch => branch.minCount).reduce(min),
			maxCount: branches.map(branch => branch.maxCount).reduce(max),

			variants: branches.map(branch => branch.variant)

		};

	}

	/**
	 * Resolve a single entry step, returning its cardinality and value shape variants.
	 */
	function resolve(shape: ValuesShape, entry: Identifier): undefined | RangeShape {

		const resolved = getShapeTarget(shape);

		const entries = resolved !== undefined
			? resolved.members
			: undefined;

		if ( entries === undefined ) {

			return undefined; // non-traversable leaf type: skip in union context

		} else {

			// gate lookup to own keys: prevents JSON-derived identifiers like __proto__,
			// constructor, toString from leaking into Object.prototype during resolution

			const target = Object.hasOwn(entries, entry) ? entries[entry] : undefined;

			if ( target === undefined ) {

				return undefined; // undefined entry: resolution fails

			} else if ( target.kind === "id" || target.kind === "type" ) {

				return IRIShape;

			} else {

				const { range } = target;

				return {

					kind: "range",

					minCount: range.minCount,
					maxCount: range.maxCount,

					variants: range.shape.kind === "union"
						? range.shape.variants
						: [range.shape]

				};

			}

		}

	}

	/**
	 * Lowest lower bound across optional minimums; `undefined` absorbs — no lower bound wins.
	 */
	function min(a: number | undefined, b: number | undefined): number | undefined {

		return a === undefined || b === undefined ? undefined : Math.min(a, b);

	}

	/**
	 * Highest upper bound across optional maximums; `undefined` absorbs — unbounded wins.
	 */
	function max(a: number | undefined, b: number | undefined): number | undefined {

		return a === undefined || b === undefined ? undefined : Math.max(a, b);

	}

	/**
	 * Multiply optional cardinalities; `undefined` propagates, otherwise the product stands (including a
	 * `0`: the strongest upper bound for `maxCount`, an equivalent "no lower bound" for `minCount`).
	 */
	function multiply(a: number | undefined, b: number | undefined): number | undefined {

		return a === undefined || b === undefined ? undefined : a*b;

	}

	/**
	 * Expands a shape into its seed branches: a union's branches, a reference's target, or the shape itself, each
	 * seeded at unit cardinality; a resolved {@link RangeShape} seeds one branch per variant, each carrying the
	 * range's own cumulative `{min,max}` so a re-probed range composes its bounds into the traversal.
	 */
	function expand(shape: Shape | RangeShape): readonly Branch[] {
		if ( shape.kind === "range" ) {

			return shape.variants.map(variant => ({
				minCount: shape.minCount,
				maxCount: shape.maxCount,
				variant
			}));

		} else if ( shape.kind === "union" ) {

			return shape.variants.map(variant => ({
				minCount: 1,
				maxCount: 1,
				variant: eager(variant)
			}));

		} else if ( shape.kind === "reference" ) {

			return [{
				minCount: 1,
				maxCount: 1,
				variant: eager(shape.shape)
			}];

		} else {

			return [{
				minCount: 1,
				maxCount: 1,
				variant: shape

			}];

		}
	}


	/**
	 * Apply the transform pipe to each variant, adjusting cardinality and assembling the effective value set.
	 *
	 * Forwards atomic traces from the upstream traversal unchanged; rejects a pipe composing more than one aggregate
	 * transform as `"multiple aggregate transforms"`. A non-empty pipe coalesces localised variants first: a dictionary
	 * variant is replaced by its coalesced `xsd:string` view (the winning tag's value(s)) at its per-tag cardinality.
	 * When no variant survives the pipe, every one having fallen outside its transforms' declared domains, reports
	 * `"incompatible transform input"`.
	 */
	function transform(focus: RangeShape | string): RangeShape | string {

		if ( isString(focus) ) {

			return focus;

		} else if ( pipe.filter(name => Transforms[name].aggregate !== false).length > 1 ) {

			return "multiple aggregate transforms";

		} else {

			// a non-empty pipe is coalesced access to a localised leaf: a dictionary variant contributes the
			// winning tag's value(s) as an ordinary xsd:string, the cardinality flowing through unchanged

			const staged = pipe.length === 0 ? focus.variants
				: focus.variants.map(shape => shape.kind === "dictionary" ? string() : shape);

			const successes = staged
				.map(shape => pipe.reduceRight(stage, shape))
				.filter(shape => shape !== undefined);

			if ( successes.length > 0 ) {

				const piped = pipe.length > 0;
				const total = pipe.some(name => Transforms[name].aggregate === "total");
				const aggregate = pipe.some(name => Transforms[name].aggregate !== false);

				return {

					kind: "range",

					minCount: !piped ? focus.minCount : total ? 1 : undefined,
					maxCount: aggregate ? 1 : focus.maxCount,

					variants: successes

				};

			} else {

				return "incompatible transform input";

			}
		}

	}

	/**
	 * Applies one transform to the running pipe state, dropping the value to `undefined` once it falls
	 * outside a transform's declared domain.
	 */
	function stage(state: undefined | ValuesShape, transformType: Transform): undefined | ValuesShape {

		if ( state === undefined ) { return undefined; } else {

			const transform = Transforms[transformType];

			return accepts(transform.accepts, state) ? produce(transform, state) : undefined;

		}

	}

	/**
	 * Resolve a transform's output shape from its declared signature.
	 *
	 * The qest {@link Transforms} table types outputs, not value domains: `returns: "same"` promises the same
	 * processing type, not the same shape. A scalar or partial-aggregate transform (`min`, `max`) keeps the input
	 * within the element domain, so its shape carries through verbatim; a total aggregate (`sum`) combines values and
	 * escapes the element domain and datatype range, so it widens to the bare `integer` type for integral input or the
	 * bare `decimal` type otherwise, dropping every value-domain facet as immaterial to the aggregate result.
	 */
	function produce({ aggregate, returns }: (typeof Transforms)[Transform], state: ValuesShape): ValuesShape {

		return returns === "same" ? (aggregate === "total" ? widen(state) : state)
			: returns === "integer" ? integer()
				: returns === "decimal" ? decimal()
					: returns === "string" ? string()
						: error<ValuesShape>(`unsupported transform output type '${returns}'`);

	}

	/**
	 * Whether a shape lies within a transform's declared input domain.
	 *
	 * `"any"` admits every shape (so `count` accepts references); `"literal"` admits the
	 * boolean, numeric, string, and temporal processing types; the remaining domains each admit a single
	 * processing type. Any shape
	 * outside the matched domain (references and resources included) fails, dropping the
	 * value to `undefined`. A localised dictionary never reaches the domain check: {@link transform} coalesces
	 * dictionary variants to their `xsd:string` view before staging.
	 */
	function accepts(domain: (typeof Transforms)[Transform]["accepts"], shape: ValuesShape): boolean {

		return domain === "any" ? true
			: domain === "literal" ? isLiteral(shape)
				: domain === "numeric" ? isNumeric(shape)
					: domain === "string" ? isTextual(shape)
						: domain === "temporal" ? isTemporal(shape)
							: false;

	}

	/**
	 * Widen a combined numeric aggregate to its bare processing type, dropping value-domain facets.
	 */
	function widen(state: ValuesShape): ValuesShape {
		return state.kind === "number" && state.integral ? integer() : decimal();
	}


	function isLiteral(shape: ValuesShape) {
		return shape.kind === "boolean" || shape.kind === "number" || shape.kind === "string";
	}

	function isNumeric(shape: ValuesShape) {
		return shape.kind === "number";
	}

	function isTextual(shape: ValuesShape) {
		return shape.kind === "string" && !isTemporal(shape);
	}

	function isTemporal(shape: ValuesShape) {
		return shape.kind === "string" && shape.datatype !== undefined && Temporal.has(shape.datatype);
	}

}


/**
 * Enumerates the value shape variants spanned by a declared set or a resolved range.
 *
 * Reduces a {@link SetShape} or {@link RangeShape} to the never-empty disjunction of value shapes it admits, the common
 * currency for value validation regardless of where the shape came from. A {@link RangeShape} carries its reachable
 * variants directly; a {@link SetShape} unwraps its declared value shape — the {@link UnionShape} branches in
 * declaration order, or the singleton of a non-union value shape.
 *
 * @param shape The declared {@link SetShape} or the {@link effective | resolved} {@link RangeShape} to enumerate
 *
 * @returns The admitted value shape variants in declaration order; the returned array is read-only
 *
 * @see {@link effective} for the path resolution that produces a {@link RangeShape}
 */
export function getMultiVariants(shape: SetShape | RangeShape): readonly ValuesShape[] {
	return shape.kind === "range" ? shape.variants
		: shape.shape.kind === "union" ? shape.shape.variants
			: [shape.shape];
}
