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

import { type Identifier, isFunction, isString, type Lazy } from "@metreeca/core";
import { immutable } from "@metreeca/core/deep";
import { assert, error } from "@metreeca/core/report";
import { isProbe, type Probe, type Transform, Transforms } from "@metreeca/qest/template";
import { mergeBoolean, validateBoolean } from "./boolean.core.js";
import type { BooleanShape } from "./boolean.js";
import { collect, TraceError, wrap } from "./index.core.js";
import type { Trace } from "./index.js";
import { mergeNumber, validateNumber } from "./number.core.js";
import { decimal, integer, type NumberShape } from "./number.js";
import { mergeReference, validateReferences } from "./reference.core.js";
import type { ReferenceShape } from "./reference.js";
import { flatten, mergeResource, validateResource } from "./resource.core.js";
import { type ResourceShape } from "./resource.js";
import { mergeString, validateString } from "./string.core.js";
import { date, instant, iri, string, type StringShape, time, timestamp } from "./string.js";
import { mergeText, validateText } from "./text.core.js";
import type { TextShape } from "./text.js";
import { type NullShape, type RangeShape, type Resolved, type SetShape, type Shape, type UnionShape, type ValueShape, type ValuesShape } from "./value.js";


/**
 * Known temporal string shape models.
 *
 * Closed set of all model values produced by temporal string shape factories. Used by {@link probeShape}
 * to distinguish temporal strings from plain strings when checking transform compatibility.
 */
const Temporal: ReadonlySet<string> = new Set([

	date,
	time,
	instant,
	timestamp

].map(factory => factory().model));


/**
 * Cache for eagerly resolved shapes from lazy factories.
 *
 * Uses WeakMap so entries are automatically released when the factory function is no longer referenced.
 * A `null` entry signals a factory currently being resolved, enabling circular dependency detection.
 */
const cache = new WeakMap<() => Shape, null | Shape>();


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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

		case "text":

			return mergeText(target, source as TextShape) as T;

		case "reference":

			return mergeReference(target, source as ReferenceShape) as T;

		case "resource":

			return mergeResource(target, source as ResourceShape) as T;

	}

}

/**
 * Merges an overriding {@link SetShape} with an inherited base.
 *
 * Validates that the override narrows cardinality constraints, then delegates to the appropriate value shape or union
 * merge function. When the parent shape is a {@link UnionShape | union} and the child shape is not, dispatches to
 * single-variant narrowing: the child must match exactly one parent variant by *discriminator* (`kind` for `boolean` /
 * `text`; `(kind, datatype)` for `string` / `number`; `(kind, class)` for `reference` / `resource`), and the result's
 * `shape` is the merged non-union value shape.
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

		// structural: shape kind must match — exception: child non-union may narrow a parent union
		//             (single-variant narrowing dispatched via narrow below)

		"{shape}": source.shape.kind === "union"
			|| target.shape.kind === source.shape.kind
			|| `mismatched kinds <${target.shape.kind}> vs <${source.shape.kind}>`,

		// post-merge constraint consistency

		...wrap(checkValues({ minCount, maxCount }))

	});

	if ( trace !== undefined ) {
		throw new TraceError("incompatible value set override", trace);
	}

	// build value set shape

	const isScalar = maxCount === 1;

	const shape: Shape = source.shape.kind === "union"
		? target.shape.kind === "union"
			? mergeUnion(target.shape, source.shape)
			: narrow(target.shape, source.shape)
		: mergeValue(target.shape as ValuesShape, source.shape);

	const model = isScalar ? shape.model : [shape.model];

	return immutable({

		kind: target.kind,

		minCount,
		maxCount,

		shape,
		model

	}) as SetShape;


	/**
	 * Narrows a parent {@link UnionShape} to a single non-union value shape.
	 *
	 * Selects the unique parent variant whose discriminator matches the child shape and merges them via
	 * {@link mergeValue}. Rejects when the child's discriminator is absent from, or non-unique within, the parent.
	 *
	 * @param target The overriding child value shape (non-union)
	 * @param source The inherited parent {@link UnionShape}
	 *
	 * @returns The merged value shape
	 *
	 * @throws {TraceError} On absent or non-unique discriminator
	 */
	function narrow(target: ValuesShape, source: UnionShape): ValuesShape {

		const key = discriminator(target);
		const matches = source.variants.filter(variant => discriminator(variant) === key);

		if ( matches.length === 0 ) {
			throw new TraceError("incompatible value set override", {
				"{shape}": `discriminator <${key}> absent from parent union`
			});
		}

		if ( matches.length > 1 ) {
			throw new TraceError("incompatible value set override", {
				"{shape}": `discriminator <${key}> non-unique within parent union`
			});
		}

		return mergeValue(target, matches[0] as typeof target);

	}

}

/**
 * Merges an overriding union with an inherited base union.
 *
 * The child union may drop branches and tighten the branches it keeps, but never add new ones. Concretely, every child
 * branch must match a parent branch, which it overrides via {@link mergeValue}; parent branches with no child match are
 * dropped from the result.
 *
 * Implementation note: branches are matched by *discriminator* (`kind` for `boolean` / `text`; `(kind, datatype)` for
 * `string` / `number`; `(kind, class)` for `reference` / `resource`). Several branches may still share a discriminator
 * (for example two same-datatype `string` variants differing only in constraints); these have no identity other than
 * their position, so the child union cannot drop just some of them without making the remaining matches ambiguous.
 * Matching is therefore positional within each group: the child union must keep either all parent branches of a group
 * in their original order, or none. The merged `model` re-indexes contiguously from `0`.
 *
 * @param target The overriding child union
 * @param source The inherited parent union
 *
 * @returns The merged union
 *
 * @throws {TraceError} On partial-group retention, out-of-order variants, or incompatible pairwise overrides
 */
export function mergeUnion(target: UnionShape, source: UnionShape): UnionShape {

	const sourceGroups = group(source.variants);
	const targetGroups = group(target.variants);

	// each child group must match a parent group, with equal arity (full retention)

	for (const [key, targetGroup] of targetGroups) {

		const sourceGroup = sourceGroups.get(key);

		if ( sourceGroup === undefined ) {
			throw new TraceError("incompatible union shape override", {
				"{variants}": `discriminator <${key}> not present in parent union`
			});
		}

		if ( targetGroup.length !== sourceGroup.length ) {
			throw new TraceError("incompatible union shape override", {
				"{variants}": `partial retention <${targetGroup.length}> of <${sourceGroup.length}> for group <${key}>`
			});
		}

	}

	// child group order must follow parent group order (subsequence)

	const sourceKeys = [...sourceGroups.keys()];
	let cursor = 0;

	for (const key of targetGroups.keys()) {

		while ( cursor < sourceKeys.length && sourceKeys[cursor] !== key ) { cursor++; }

		if ( cursor >= sourceKeys.length ) {
			throw new TraceError("incompatible union shape override", {
				"{variants}": `out-of-order discriminator <${key}>`
			});
		}

		cursor++;

	}

	// build merged variants in parent group order; dropped groups are absent from the result

	const variants = [...sourceGroups].flatMap(([key, sourceGroup]) => {

		const targetGroup = targetGroups.get(key);

		return targetGroup === undefined ? []
			: sourceGroup.map((sourceVariant, index) => mergeValue(targetGroup[index], sourceVariant));

	});

	return immutable({

		kind: target.kind,

		model: Object.fromEntries(variants.map((v, i) => [`${i}`, v.model])),

		variants

	});


	/**
	 * Groups variants by discriminator, preserving first-occurrence order in the resulting map.
	 */
	function group(variants: readonly ValueShape[]): Map<string, ValueShape[]> {

		return variants.reduce((groups, variant) => {

			const key = discriminator(variant);
			const existing = groups.get(key);

			if ( existing === undefined ) {
				groups.set(key, [variant]);
			} else {
				existing.push(variant);
			}

			return groups;

		}, new Map<string, ValueShape[]>());

	}

}


/**
 * Computes the *discriminator* key for a union variant.
 *
 * Returns `kind` for `boolean` and `text` variants. For `string` and `number` variants, returns `kind` paired with the
 * prototype `model` value, which proxies the datatype, so that unions of differently-typed strings or numbers are
 * treated as distinct discriminator groups. For `reference` and `resource` variants, returns `kind` paired with the
 * target {@link ResourceShape.class | class} IRI, so that unions of differently-classed references or resources are
 * treated as distinct discriminator groups.
 *
 * @param variant The union variant
 *
 * @returns The discriminator key
 */
function discriminator(variant: ValuesShape): string {

	return variant.kind === "reference" ? `reference:${eager(variant.shape).class ?? ""}`
		: variant.kind === "resource" ? `resource:${variant.class ?? ""}`
			: variant.kind === "string" || variant.kind === "number" ? `${variant.kind}:${variant.model}`
				: variant.kind;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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

		case "text":

			return validateText(values, shape);

		case "reference":

			return validateReferences(values, shape);

		case "resource":

			return validateResource(values, shape);

	}

}

/**
 * Validates values against a {@link UnionShape} disjunctively.
 *
 * Each value is matched against the union variants in order. A value satisfies the union if it
 * satisfies at least one variant; every variant, including a reference variant, is checked through
 * {@link validateValue}, so a reference variant admits a bare IRI only (state-side captive
 * expansion is applied upstream by the resource validator). On failure, the trace aggregates the
 * per-variant traces under positional keys (`[0]`, `[1]`, …).
 *
 * @param values The values to validate
 * @param union The union shape defining the variant alternatives
 *
 * @returns A keyed trace of validation errors, or `undefined` if every value matches a variant
 */
export function validateUnion(values: readonly unknown[], union: UnionShape): undefined | Trace {

	return collect(Object.fromEntries(values.map((value, index) => {

		const traces = union.variants.map(variant => validateValue([value], variant));

		const trace = traces.some(trace => trace === undefined) ? undefined : collect(Object.fromEntries(
			traces.map((trace, position) => [`[${position}]`, trace])
		)) ?? "no union variant matched";

		return [`[${index}]`, trace];

	})));

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves a {@link Lazy} shape to its eager form, caching the result on repeated calls.
 *
 * When given a factory, evaluates it on first call and caches the outcome; subsequent calls
 * return the cached shape. {@link ResourceShape | Resource} shapes are flattened during
 * resolution; other shapes pass through unchanged.
 *
 * @typeParam S The {@link Lazy} {@link Shape} type
 *
 * @param shape A shape value or no-arg factory returning one
 *
 * @returns The eager shape, with resource shapes flattened
 *
 * @throws {TraceError} If the factory transitively references itself, producing a circular extends chain
 */
export function eager<S extends Lazy<Shape>>(shape: S): Resolved<S>;

/**
 * Resolves a {@link Lazy} shape to its eager form and maps the result.
 *
 * Resolves `shape` as the single-argument overload does, then passes the eager shape to `mapper`
 * and returns its result, an ergonomic shortcut for transforming a freshly resolved shape without
 * an intervening binding.
 *
 * @typeParam S The {@link Lazy} {@link Shape} type
 * @typeParam V The value the `mapper` produces
 *
 * @param shape A shape value or no-arg factory returning one
 * @param mapper A transform applied to the eager shape
 *
 * @returns The value produced by `mapper`
 *
 * @throws {TraceError} If the factory transitively references itself, producing a circular extends chain
 */
export function eager<S extends Lazy<Shape>, V>(shape: S, mapper: (shape: Resolved<S>) => V): V;

/**
 * Resolves a {@link Lazy} shape, optionally mapping the eager result.
 */
export function eager<S extends Lazy<Shape>, V>(shape: S, mapper?: (shape: Resolved<S>) => V): Resolved<S> | V {

	function map(resolved: Resolved<S>): Resolved<S> | V {
		return mapper ? mapper(resolved) : resolved;
	}


	if ( isFunction(shape) ) {

		const cached = cache.get(shape);

		if ( cached === null ) {

			throw new TraceError("circular extends chain", {
				[shape.name || "<anonymous>"]: "circular dependency"
			});

		} else if ( cached === undefined ) {

			cache.set(shape, null);

			try {

				const resolved = shape();
				const flattened = (resolved.kind === "resource" ? flatten(resolved) : resolved);

				cache.set(shape, flattened);

				return map(flattened as Resolved<S>);

			} catch ( error ) {

				cache.delete(shape);

				throw error;

			}

		} else {

			return map(cached as Resolved<S>);

		}

	} else {

		return map((shape.kind === "resource" ? flatten(shape) : shape) as Resolved<S>);

	}

}


/**
 * Probe a shape for the effective {@link RangeShape} a {@link Probe} resolves to.
 *
 * Traverses the {@link Probe.path} segments through nested resource properties to locate the target shape, then
 * applies the {@link Probe.pipe} transforms to compute the effective value set with accumulated cardinality.
 *
 * **Shape dispatch:**
 *
 * - {@link ResourceShape}: traverses path segments through nested properties
 * - {@link ReferenceShape}: eagerly resolves the lazy target shape, then proceeds as for {@link ResourceShape}
 * - {@link UnionShape}: seeds traversal with each variant, then proceeds as for the per-variant shape
 * - Other shapes: any non-empty path fails resolution; the empty path applies the transform pipe directly
 *
 * **Path traversal** — at each step, flattens inheritance and looks up the next property. Unknown properties cause
 * the path to fail. At {@link UnionShape} boundaries (either at the entry or encountered as a property range),
 * variants lacking the property are skipped; the path fails only when no variant defines it. Mid-path traversal past
 * an `id` or `type` field fails as an `"undefined property path"`, since these resolve to scalar IRIs with no
 * traversable structure; terminal `id`/`type` access remains valid.
 *
 * **Pipe application** — applies transforms to the shape resolved by path traversal, reducing each active variant
 * independently when multiple remain. A pipe composing more than one aggregate transform is rejected upfront as
 * `"multiple aggregate transforms"`, independently of the resolved shape. A non-empty pipe is coalesced access to a
 * localised leaf: a text shape contributes the winning tag's value(s) as an ordinary `xsd:string` for domain matching
 * and effective typing, at the leaf's per-tag cardinality (one value for single-string-per-tag, the winning tag's set
 * for array-per-tag). Among processing-space literals (boolean,
 * numeric, plain or temporal string), type compatibility is not a well-formedness condition: a transform applied to a
 * literal outside its declared domain is never an error, it simply drops the offending variant, and when no variant
 * survives the probe resolves to a {@link NullShape} (a known absent value), or, for a total
 * aggregate, to its empty-set value (`0`). The same leniency extends to values outside the processing space
 * (references and resources) which no transform other than `count` can act on, so they too drop
 * rather than erroring. The `count` aggregate accepts any
 * value, references included; `min` and `max` accept the literal processing types (boolean,
 * numeric, string, temporal); the remaining transforms accept their declared processing type only. `avg` always yields
 * a `decimal`: the specification narrows its range to `float` for `float` input and `double` for `double` input, but
 * that processing-space distinction is not preserved on egress, so the effective type is reported uniformly as
 * `decimal`.
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
 *   — unbounded wins). Matches SHACL `sh:or` — a value satisfies the union if at least one branch
 *   accepts it.
 * - {@link UnionShape} steps themselves contribute no per-step cardinality — the enclosing range
 *   carries the single cardinality shared by all variants.
 * - A **localised step** enters the product like any other: a text property is terminal (no path may
 *   traverse past it) and contributes its per-tag bounds (`maxCount` of `1` for single-string-per-tag,
 *   unbounded for array-per-tag), which multiply into the branch product. A single-string-per-tag leaf
 *   is single-valued on its own, but a multi-valued prefix multiplies through, so a deep coalescible
 *   key is correctly multi-valued for the sort/focus single-valued gates while matching and filtering
 *   stay cardinality-agnostic.
 * - A non-empty pipe sets `minCount` to `1` for the total aggregates `count` and `sum`, which always
 *   yield a value (`0` on the empty set), and to `undefined` for every other transform; scalar transforms
 *   preserve `maxCount`; aggregate transforms set `maxCount` to `1`.
 *
 * @param shape The {@link Shape} to inspect
 *
 * @param probe The probe containing property path and transform pipe
 *
 * @returns A {@link RangeShape} effective type carrying the accumulated cardinality and the reachable value-shape
 *     variants when the probe resolves; a {@link NullShape} when the probe is accepted but provably resolves to no
 *     value (every surviving variant falling outside its transforms' declared domains). Returns an atomic
 *     {@link Trace} string when the probe cannot be resolved against the shape: `"undefined property path"` if the
 *     path fails to resolve (including a step past a non-traversable `id` / `type` field), or `"multiple aggregate
 *     transforms"` if the pipe composes more than one aggregate transform
 *
 * @throws {TypeError} If `probe` is not a well-formed {@link Probe} (a malformed `path`/`pipe`, or a `pipe`
 *     referencing an unknown transform)
 *
 * @see {@link https://metreeca.github.io/qest/documents/model.Model_Design.html Model Design}
 */
export function probeShape(shape: Lazy<Shape>, probe: Probe): RangeShape | NullShape | Extract<Trace, string> {

	type Branch = {

		readonly minCount?: number
		readonly maxCount?: number

		readonly variant: ValuesShape

	}


	// defensive: a hand-built probe may carry an unknown transform or a malformed path/pipe, which would
	// otherwise surface as a runtime crash deep in the pipe; reject it up front

	const { pipe, path } = assert(probe, isProbe, "malformed probe");

	const entry = eager(shape);

	return transform(traverse(
		entry.kind === "union" ? entry.variants.map(variant => eager(variant))
			: entry.kind === "reference" ? [eager(entry.shape)]
				: [entry]
	));


	/**
	 * Traverse the property path, enveloping per-branch cumulative cardinalities.
	 *
	 * Folds the path into a cohort of single-variant branches — each one carrying its own path
	 * cumulative `{min,max}` — by flat-mapping each branch's resolved variants at every segment.
	 * Branches that lack the next property are dropped; `id` / `type` fields resolve to scalar IRIs
	 * with no traversable structure, so a path stepping past them drops as well. A localised step
	 * multiplies its per-tag bounds into the branch product like any other step (see the cardinality
	 * rules on {@link probeShape}). The surviving cohort is then enveloped (SHACL `sh:or`) into a single
	 * focus; an exhausted cohort yields `"undefined property path"`.
	 */
	function traverse(seed: readonly ValuesShape[]): RangeShape | Extract<Trace, string> {

		const branches = path.reduce<readonly Branch[]>((branches, segment) =>

				branches.flatMap(branch => {

					const resolved = resolve(branch.variant, segment);

					return resolved === undefined ? [] // skip branches that lack the property
						: resolved.variants.map(variant => ({
							minCount: multiply(branch.minCount, resolved.minCount),
							maxCount: multiply(branch.maxCount, resolved.maxCount),
							variant
						}));

				}),

			seed.map(variant => ({ minCount: 1, maxCount: 1, variant }))
		);

		return branches.length === 0 ? "undefined property path" : {

			kind: "range",

			minCount: branches.map(branch => branch.minCount).reduce(min),
			maxCount: branches.map(branch => branch.maxCount).reduce(max),

			variants: branches.map(branch => branch.variant)

		};

	}

	/**
	 * Resolve a single property step, returning its cardinality and value shape variants.
	 */
	function resolve(shape: ValuesShape, property: Identifier): undefined | RangeShape {

		const resolved = shape.kind === "resource" ? shape
			: shape.kind === "reference" ? eager(shape.shape)
				: undefined;

		const properties = resolved !== undefined
			? resolved.properties
			: undefined;

		if ( properties === undefined ) {

			return undefined; // non-traversable leaf type: skip in union context

		} else {

			// gate lookup to own keys: prevents JSON-derived identifiers like __proto__,
			// constructor, toString from leaking into Object.prototype during resolution

			const entry = Object.hasOwn(properties, property) ? properties[property] : undefined;

			if ( entry === undefined ) {

				return undefined; // undefined property: resolution fails

			} else if ( entry.kind === "id" || entry.kind === "type" ) {

				// id / type fields resolve to a scalar absolute IRI with no traversable structure

				return {

					kind: "range",

					maxCount: 1,

					variants: [iri({ variant: "absolute" })]

				};

			} else {

				const { range } = entry;

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
	 * Apply the transform pipe to each variant, adjusting cardinality and assembling the effective value set.
	 *
	 * Forwards atomic traces from the upstream traversal unchanged; rejects a pipe composing more than one aggregate
	 * transform as `"multiple aggregate transforms"`. A non-empty pipe coalesces localised variants first: a text
	 * variant is replaced by its coalesced `xsd:string` view (the winning tag's value(s)) at its per-tag cardinality.
	 * When no variant resolves to a value set, yields the total aggregate's empty-set value (`0`) if the pipe applies
	 * one, otherwise a {@link NullShape}: every surviving variant having fallen outside its transforms' declared
	 * domains.
	 */
	function transform(focus: RangeShape | Extract<Trace, string>): RangeShape | NullShape | Extract<Trace, string> {

		if ( isString(focus) ) {

			return focus;

		} else if ( pipe.filter(name => Transforms[name].aggregate !== false).length > 1 ) {

			return "multiple aggregate transforms";

		} else {

			// a non-empty pipe is coalesced access to a localised leaf: a text variant contributes the
			// winning tag's value(s) as an ordinary xsd:string, the cardinality flowing through unchanged

			const staged = pipe.length === 0 ? focus.variants
				: focus.variants.map(shape => shape.kind === "text" ? string() : shape);

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

			} else if ( pipe.some(name => Transforms[name].aggregate === "total") ) {

				// a total aggregate over an all-out-of-domain input still yields its empty-set value
				// (`0`); the scalar transforms wrapping the aggregate then apply to that integer base

				const wrapping = pipe.slice(0, pipe.findIndex(name => Transforms[name].aggregate !== false));
				const result = wrapping.reduceRight(stage, integer());

				return result !== undefined
					? { kind: "range", minCount: 1, maxCount: 1, variants: [result] }
					: { kind: "null" };

			} else {

				return { kind: "null" };

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

			return accepts(transform.accepts, state) ? produce(transform.returns, state) : undefined;

		}

	}

	/**
	 * Resolve a transform's output shape from its declared return type.
	 */
	function produce(returns: (typeof Transforms)[Transform]["returns"], state: ValuesShape): ValuesShape {

		return returns === "same" ? state
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
	 * value to `undefined`. Localised text never reaches the domain check: {@link transform} coalesces text
	 * variants to their `xsd:string` view before staging.
	 */
	function accepts(domain: (typeof Transforms)[Transform]["accepts"], shape: ValuesShape): boolean {

		return domain === "any" ? true
			: domain === "literal" ? isLiteral(shape)
				: domain === "numeric" ? isNumeric(shape)
					: domain === "string" ? isTextual(shape)
						: domain === "temporal" ? isTemporal(shape)
							: false;

	}


	function isLiteral(shape: ValuesShape) {
		return shape.kind === "boolean" || shape.kind === "number" || shape.kind === "string";
	}

	function isNumeric(shape: ValuesShape) {
		return shape.kind === "number";
	}

	function isTextual(shape: ValuesShape) {
		return shape.kind === "string" && !Temporal.has(shape.model);
	}

	function isTemporal(shape: ValuesShape) {
		return shape.kind === "string" && Temporal.has(shape.model);
	}

}
