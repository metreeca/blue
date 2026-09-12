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
 * Shared validation vocabulary.
 *
 * @module
 */

import {
	assert,
	type Eager,
	error,
	type Identifier,
	isFunction,
	isString,
	type Lazy,
	type Optional
} from "@metreeca/core";
import { unique } from "@metreeca/core/arrays";
import { xsd } from "@metreeca/core/datatype";
import { createNamespace, type Namespace } from "@metreeca/core/resource";
import { equals, immutable } from "@metreeca/core/structures";
import { type Issue, type Trace, TraceError } from "@metreeca/core/trace";
import type { Reference } from "@metreeca/qest/resource";
import { isProbe, type Probe, type Transform, Transforms } from "@metreeca/qest/template";
import { mergeBoolean, narrowsBoolean, validateBoolean } from "./boolean.core.js";
import type { BooleanShape } from "./boolean.js";
import { mergeDictionary, narrowsDictionary, type Tagged, validateDictionary } from "./dictionary.core.js";
import type { DictionaryShape } from "./dictionary.js";
import type { Range, Shape } from "./index.js";
import { mergeNumber, narrowsNumber, validateNumber } from "./number.core.js";
import { decimal, integer, type NumberShape } from "./number.js";
import { getShapeTarget, mergeReference, narrowsReference, validateReference } from "./reference.core.js";
import type { ReferenceShape } from "./reference.js";
import { flatten, mergeResource, narrowsResource, validateResource } from "./resource.core.js";
import type { ResourceShape } from "./resource.js";
import { mergeString, narrowsString, validateString } from "./string.core.js";
import { string, type StringShape } from "./string.js";
import { getShapeBranches, mergeUnion, narrowsUnion, validateUnion } from "./union.core.js";
import { union, type UnionShape } from "./union.js";


/**
 * SHACL vocabulary namespace.
 *
 * An open {@link Namespace} over `http://www.w3.org/ns/shacl#`, resolving any SHACL term as a named property.
 *
 * @see {@link https://www.w3.org/TR/shacl/ SHACL - Shapes Constraint Language}
 */
export const sh: Namespace = createNamespace("http://www.w3.org/ns/shacl#");


/**
 * The datatypes a transform may read as a point in time.
 *
 * Names the temporal datatypes the processing space orders and computes on, so that a transform reaching for a date
 * is told apart from one reaching for plain text. The opaque temporal datatypes, `xsd:gYear` and `xsd:duration` among
 * them, are left out: they carry no position on a timeline and are handled as ordinary strings.
 */
const Temporal: ReadonlySet<string> = new Set([
	xsd.date,
	xsd.time,
	xsd.dateTime
]);

/**
 * The range a resource identifier is reached through.
 *
 * A member naming or typing a resource carries a single absolute IRI rather than a typed literal, marked as such so
 * that a caller storing the value maps it to an identifier. Every such member is reached through the same range, so it
 * is stated once.
 */
const IRIRange: Range = immutable({

	minCount: undefined,
	maxCount: 1,

	shape: string({ datatype: sh.IRI, pattern: /^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$/ })

});


/**
 * The shapes already resolved from a deferred definition.
 *
 * Keyed by the thunk that deferred them, so that a shape reached along several paths is resolved once and compared by
 * identity; a thunk under resolution is held as `null`, which is how a definition reaching itself is caught.
 */
const shapes = new WeakMap<() => Shape, null | Shape>();


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validation strictness for matching a value against a shape.
 *
 * Selects how much of a shape the value validators enforce, so a caller can match the same shape against a stored
 * value, a relational bound, or a retrieval model:
 *
 * - `"state"` enforces **every** constraint: the value must be a legal element of the shape's domain.
 * - `"bound"` keeps the syntactic discriminators (`kind`, and a literal branch's `pattern`) but skips the value-domain
 *   magnitude constraints, so a relational bound lying outside the domain still matches by form alone.
 * - `"model"` matches by `kind` alone, ignoring every other constraint, so a retrieval placeholder need not be legal.
 *
 * @see [Unions — Design](../union.md)
 */
export type Scope =
	| "state"
	| "bound"
	| "model"


/**
 * Resolves the plain value a shape describes.
 *
 * Yields a boolean, a number or a string, narrowed to the values the shape enumerates where it does, a
 * {@link Tagged | tag-keyed map} for a localised shape, carrying its content at the arity the shape states as unique,
 * and a {@link Reference} to the target for a reference shape. A plain value carries no members, so it reads the same
 * whether or not captive resources are inlined; neither a resource shape nor a union shape describes a plain value.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Plain<S extends Lazy<Shape>> =
	Eager<S> extends BooleanShape ? boolean
		: Eager<S> extends NumberShape<infer V> ? V
			: Eager<S> extends StringShape<infer V> ? V
				: Eager<S> extends infer D extends DictionaryShape ? Tagged<D>
					: Eager<S> extends ReferenceShape ? Reference
						: never

/**
 * Resolves the legal values under a set of constraints.
 *
 * Yields the enumerated values where the constraints close the domain to a list, and the whole domain otherwise, so
 * that a value read from an enumerated shape is typed by the values it may actually take. An empty list closes
 * nothing, and neither does a list whose values are stated too loosely to be told apart.
 *
 * @typeParam C The stated constraints
 * @typeParam D The domain the values are drawn from
 */
export type Legal<C, D> =
	C extends { readonly in: infer V extends readonly D[] }
		? [V[number]] extends [never] ? D : V[number]
		: D


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Reports whether a shape narrows an inherited one.
 *
 * Routes the pair to the operators of the kind they share, so that a caller holding two shapes tests the override
 * relation without knowing which kind it holds. Two shapes of different kinds never narrow one another, as an override
 * refines what a member admits and never retypes it.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns A trace of the obstacles to the override, or `undefined` where `target` narrows `source`
 */
export function narrowsShape(target: Shape, source: Shape): Optional<Trace> {

	// a polymorphic inherited shape is narrowed to the single alternative the overriding one restricts, which thus
	// restates no wrapper of its own

	if ( source.kind === "union" && target.kind !== "union" ) {

		const claimed = claims(target, source);

		return claimed.length === 1 ? undefined
			: claimed.length === 0 ? ["{branches} restricts no inherited branch"]
				: ["{branches} restricts several inherited branches"];

	}

	// the kind guard is what makes each branch well-typed: it is reached only where both shapes share target.kind

	return target.kind !== source.kind ? [`{kind} mismatched kinds <${target.kind}> vs <${source.kind}>`]
		: target.kind === "boolean" ? narrowsBoolean(target, source as BooleanShape)
			: target.kind === "number" ? narrowsNumber(target, source as NumberShape)
				: target.kind === "string" ? narrowsString(target, source as StringShape)
					: target.kind === "dictionary" ? narrowsDictionary(target, source as DictionaryShape)
						: target.kind === "reference" ? narrowsReference(target, source as ReferenceShape)
							: target.kind === "union" ? narrowsUnion(target, source as UnionShape)
								: narrowsResource(target, source as ResourceShape);

}

/**
 * Merges a shape with an inherited one.
 *
 * Routes the pair to the operators of the kind they share, so that a caller holding two shapes builds the merged one
 * without knowing which kind it holds.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns An immutable shape admitting the values both `target` and `source` admit
 *
 * @throws {TraceError} Where `target` doesn't narrow `source`
 */
export function mergeShape(target: Shape, source: Shape): Shape {

	const trace = narrowsShape(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible shape override", trace);
	}

	// the single alternative an overriding shape restricts is the one it is merged with, the rest being dropped

	if ( source.kind === "union" && target.kind !== "union" ) {
		return mergeShape(target, claims(target, source)[0]);
	}

	// the kind guard above is what makes each branch well-typed: the kinds are known to match by here

	return target.kind === "boolean" ? mergeBoolean(target, source as BooleanShape)
		: target.kind === "number" ? mergeNumber(target, source as NumberShape)
			: target.kind === "string" ? mergeString(target, source as StringShape)
				: target.kind === "dictionary" ? mergeDictionary(target, source as DictionaryShape)
					: target.kind === "reference" ? mergeReference(target, source as ReferenceShape)
						: target.kind === "union" ? mergeUnion(target, source as UnionShape)
							: mergeResource(target, source as ResourceShape);

}

/**
 * Resolves the alternatives of an inherited polymorphic shape an overriding shape restricts.
 *
 * @param target The overriding shape
 * @param source The inherited polymorphic shape
 *
 * @returns The alternatives `target` narrows, in the order they were stated
 */
function claims(target: Shape, source: UnionShape): readonly Shape[] {

	return getShapeBranches(source).filter(branch => narrowsShape(target, branch) === undefined);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates values against a shape.
 *
 * Routes the values to the validators of the shape's kind, so that a caller holding a shape matches values against it
 * without knowing which kind it holds.
 *
 * @param values The values to validate
 * @param shape The shape the values are matched against
 * @param opts Validation options
 * @param opts.scope The {@link Scope | strictness} the shape is enforced at, defaulting to `"state"`
 *
 * @returns A trace of the violations found, or `undefined` where every value matches `shape`
 */
export function validateShape(values: readonly unknown[], shape: Shape, {

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

			return validateDictionary(values, shape, { scope });

		case "reference":

			return validateReference(values, shape, { scope });

		case "union":

			return validateUnion(values, shape, { scope });

		case "resource":

			return validateResource(values, shape, { scope });

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves a possibly deferred shape.
 *
 * Yields the shape a definition states, resolving a deferred one on first reach and handing back the same shape on
 * every later reach, so that a shape stated once compares equal wherever it is reached from. A resource shape comes
 * back merged, so a caller reading its members needs not merge the inheritance chain itself.
 *
 * @typeParam S The stated shape, possibly deferred to break definition cycles
 *
 * @param shape The shape to resolve
 *
 * @returns The shape `shape` states, merged where it describes a resource
 *
 * @throws {TraceError} Where a deferred definition reaches itself, leaving the shape it states undefined
 */
export function eager<S extends Lazy<Shape>>(shape: S): Eager<S> {

	if ( !isFunction(shape) ) {

		return resolve(shape) as Eager<S>; // ;(cast) a stated shape resolves to itself, merged where it is a resource

	}

	const cached = shapes.get(shape);

	if ( cached === null ) {

		throw new TraceError("circular definition", [{
			[shape.name || "<anonymous>"]: ["reaches itself"]
		}]);

	} else if ( cached !== undefined ) {

		return cached as Eager<S>; // ;(cast) the cache erases the thunk's own type, recovered at this boundary

	}

	shapes.set(shape, null);

	try {

		const resolved = resolve(shape());

		shapes.set(shape, resolved);

		return resolved as Eager<S>; // ;(cast) as above

	} catch ( error ) {

		shapes.delete(shape);

		throw error;

	}


	/**
	 * Merges a resolved shape where it describes a resource.
	 */
	function resolve(shape: Shape): Shape {
		return shape.kind === "resource" ? flatten(shape) : shape;
	}

}

/**
 * Resolves the values a probe reaches.
 *
 * Yields the range a {@link Probe | probe} resolves to against a shape: the shapes its values may be drawn from and
 * how many of them it reaches, so that a caller may type a projection binding or a selection operand without walking
 * the shape itself. A path stepping through several alternatives reaches each in turn, and the range it yields
 * envelopes them all; discrimination to the single branch a value belongs to is settled separately, against the value.
 *
 * **What a path reaches**
 *
 * A path steps across the members of the resources it reaches, crossing a link to the resource it points at and
 * entering each alternative of a union in turn; an alternative lacking the next member is dropped, and the path fails
 * only where none carries it. The members naming and typing a resource are reached as a scalar IRI, so a path may end
 * on one but never step past it. A localised member is likewise terminal.
 *
 * **What a pipe yields**
 *
 * A pipe applies its transforms to whatever the path reached, dropping an alternative the transforms cannot act on:
 * within a union this keeps the compatible alternatives alone, so a pipe stands as long as one survives. A localised
 * value is read through the content language negotiation settles on, as ordinary text. A transform stating it yields
 * the same type reproduces the input shape verbatim where it keeps values within the domain they were drawn from, and
 * widens to the bare numeric type where it combines them and leaves that domain behind.
 *
 * **How many values it reaches**
 *
 * Bounds accumulate multiplicatively along a path and envelope across alternatives: the lowest lower bound and the
 * highest upper bound win, and an unstated bound absorbs, leaving that end unbounded. A pipe that always yields a
 * value floors the count at one, an aggregate caps it at one, and any other transform leaves the count unstated.
 *
 * @param shape The shape to resolve the probe against, possibly deferred to break definition cycles, or a range
 *     already resolved to probe further
 * @param probe The path and transform pipe to resolve
 *
 * @returns The range the probe reaches, or an {@link Issue} stating why it reaches nothing: `"unknown property path"`
 *     where the path names a member no alternative carries or steps past one that cannot be stepped past,
 *     `"multiple aggregate transforms"` where the pipe combines values more than once, or
 *     `"incompatible transform input"` where no alternative survives the transforms
 *
 * @throws {TraceError} Where a deferred definition reaches itself, leaving the shape it states undefined
 * @throws {@link !TypeError TypeError} Where `probe` is not a well-formed probe
 *
 * @see {@link https://metreeca.github.io/qest/documents/model.Model_Design.html Model Design}
 */
export function effective(shape: Lazy<Shape> | Range, probe: Probe): Range | Issue {

	// a hand-built probe may name an unknown transform or a malformed path, which would otherwise surface as a
	// crash deep inside the pipe; it is rejected up front

	const { pipe, path } = assert(probe, isProbe, "malformed probe");

	return transform(traverse(expand(shape)));


	/**
	 * Seeds one branch per alternative the shape opens with.
	 *
	 * A union opens one branch per alternative and a link opens on the resource it points at, each at unit
	 * cardinality; a range already resolved opens one branch per alternative, carrying the bounds it accumulated.
	 */
	function expand(shape: Lazy<Shape> | Range): readonly Range<Shape>[] {

		if ( !isFunction(shape) && !("kind" in shape) ) {

			return getShapeBranches(shape.shape).map(branch => ({
				minCount: shape.minCount,
				maxCount: shape.maxCount,
				shape: branch
			}));

		}

		const resolved = eager(shape);

		const branches = resolved.kind === "reference"
			? [eager(resolved.target)]
			: getShapeBranches(resolved);

		return branches.map(branch => ({ minCount: 1, maxCount: 1, shape: branch }));

	}

	/**
	 * Steps the path across the branches, accumulating the bounds each one reaches its values through.
	 */
	function traverse(seed: readonly Range<Shape>[]): Range | Issue {

		const branches = path.reduce<readonly Range<Shape>[]>((branches, segment) => branches.flatMap(branch => {

			const reached = step(branch.shape, segment);

			// a branch not carrying the member is dropped

			return reached === undefined ? [] : getShapeBranches(reached.shape).map(shape => ({
				minCount: multiply(branch.minCount, reached.minCount),
				maxCount: multiply(branch.maxCount, reached.maxCount),
				shape
			}));

		}), seed);

		return branches.length === 0 ? "unknown property path" : {

			minCount: branches.map(branch => branch.minCount).reduce(least),
			maxCount: branches.map(branch => branch.maxCount).reduce(most),

			shape: collect(branches.map(branch => branch.shape))

		};

	}

	/**
	 * Resolves one step of the path against a branch.
	 */
	function step(shape: Shape, segment: Identifier): undefined | Range {

		const members = getShapeTarget(shape)?.members;

		if ( members === undefined ) { return undefined; } // a branch carrying no member is stepped past

		// own names alone: a name carried over from JSON must not reach Object.prototype

		const member = Object.hasOwn(members, segment) ? members[segment] : undefined;

		return member === undefined ? undefined
			: member.kind === "id" || member.kind === "type" ? IRIRange
				: member.kind === "property" ? member
					: undefined;

	}

	/**
	 * Applies the pipe to each branch, dropping the ones its transforms cannot act on.
	 */
	function transform(reached: Range | Issue): Range | Issue {

		if ( isString(reached) ) { return reached; }

		if ( pipe.filter(name => Transforms[name].aggregate !== false).length > 1 ) {
			return "multiple aggregate transforms";
		}

		// a pipe reads a localised value through the content negotiation settles on, as ordinary text

		const staged = pipe.length === 0 ? getShapeBranches(reached.shape)
			: getShapeBranches(reached.shape).map(shape => shape.kind === "dictionary" ? string() : shape);

		const surviving = staged
			.map(shape => pipe.reduceRight(apply, shape as undefined | Shape))
			.filter(shape => shape !== undefined);

		if ( surviving.length === 0 ) { return "incompatible transform input"; }

		const piped = pipe.length > 0;
		const total = pipe.some(name => Transforms[name].aggregate === "total");
		const aggregate = pipe.some(name => Transforms[name].aggregate !== false);

		return {

			minCount: !piped ? reached.minCount : total ? 1 : undefined,
			maxCount: aggregate ? 1 : reached.maxCount,

			shape: collect(surviving)

		};

	}

	/**
	 * Applies one transform, dropping the branch once it falls outside a transform's domain.
	 */
	function apply(shape: undefined | Shape, name: Transform): undefined | Shape {

		if ( shape === undefined ) { return undefined; }

		const transform = Transforms[name];

		return accepts(transform.accepts, shape) ? produce(transform, shape) : undefined;

	}

	/**
	 * Resolves the shape a transform yields.
	 *
	 * A transform keeping values within the domain they were drawn from carries the shape through verbatim; one
	 * combining them leaves that domain behind, so it widens to the bare numeric type and drops every value-domain
	 * constraint as immaterial to the result.
	 */
	function produce({ aggregate, returns }: (typeof Transforms)[Transform], shape: Shape): Shape {

		return returns === "same" ? (aggregate === "total" ? widen(shape) : shape)
			: returns === "integer" ? integer()
				: returns === "decimal" ? decimal()
					: returns === "string" ? string()
						: error<Shape>(`unsupported transform output type '${returns}'`);

	}

	/**
	 * Reports whether a shape lies within a transform's domain.
	 */
	function accepts(domain: (typeof Transforms)[Transform]["accepts"], shape: Shape): boolean {

		return domain === "any" ? true
			: domain === "literal" ? isLiteral(shape)
				: domain === "numeric" ? isNumeric(shape)
					: domain === "string" ? isTextual(shape)
						: domain === "temporal" ? isTemporal(shape)
							: false;

	}

	/**
	 * Widens a combined numeric result to its bare type, dropping the value-domain constraints.
	 */
	function widen(shape: Shape): Shape {
		return shape.kind === "number" && shape.integral ? integer() : decimal();
	}


	function isLiteral(shape: Shape) {
		return shape.kind === "boolean" || shape.kind === "number" || shape.kind === "string";
	}

	function isNumeric(shape: Shape) {
		return shape.kind === "number";
	}

	function isTextual(shape: Shape) {
		return shape.kind === "string" && !isTemporal(shape);
	}

	function isTemporal(shape: Shape) {
		return shape.kind === "string" && shape.datatype !== undefined && Temporal.has(shape.datatype);
	}


	/**
	 * Gathers the shapes reached into the range's own.
	 *
	 * Yields the shape itself where a path converges on one and a union of them where it reaches several,
	 * deduplicated as late as possible, so that a pipe or a path folding alternatives onto the same shape reports it
	 * once.
	 */
	function collect(branches: readonly Shape[]): Shape {

		const distinct = unique(branches, equals);

		return distinct.length === 1 ? distinct[0] : union(...distinct as [Shape, ...Shape[]]);

	}

	/**
	 * Lowest lower bound; an unstated bound absorbs, as no lower bound wins.
	 */
	function least(a: Optional<number>, b: Optional<number>): Optional<number> {
		return a === undefined || b === undefined ? undefined : Math.min(a, b);
	}

	/**
	 * Highest upper bound; an unstated bound absorbs, as an unbounded end wins.
	 */
	function most(a: Optional<number>, b: Optional<number>): Optional<number> {
		return a === undefined || b === undefined ? undefined : Math.max(a, b);
	}

	/**
	 * Product of two bounds; an unstated bound propagates, and a zero product stands.
	 */
	function multiply(a: Optional<number>, b: Optional<number>): Optional<number> {
		return a === undefined || b === undefined ? undefined : a*b;
	}

}
