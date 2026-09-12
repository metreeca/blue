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
 * Shape accessors.
 *
 * Reads what a shape reaches: {@link eager} resolves a shape deferred to break a definition cycle, yielding a resource
 * shape with its inheritance merged, and {@link effective} resolves the values a path and transform pipe reach through
 * it, so that a caller may type a projection binding or a selection operand without walking the shape itself.
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
import { equals, immutable } from "@metreeca/core/structures";
import { type Issue, TraceError } from "@metreeca/core/trace";
import { isProbe, type Probe, type Transform, Transforms } from "@metreeca/qest/template";

import { decimal, integer } from "../number/index.js";
import { getShapeTarget } from "../reference/index.js";
import { flatten } from "../resource/assembler.js";
import { string } from "../string/index.js";
import { getShapeBranches } from "../union/index.js";
import { union } from "../union/index.js";
import { type Range, type Shape, sh } from "./index.js";


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
