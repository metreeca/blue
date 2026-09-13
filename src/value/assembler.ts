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
 * Shape assembly.
 *
 * Combines a shape with the one it overrides: {@link narrowsShape} tests the override relation and
 * {@link mergeShape} builds the merged shape, each routing the pair to the operators of the kind they share, so that a
 * caller holding two shapes needs not know which kind it holds. The rules the kinds state alike, the datatype and the
 * closed value domain among them, are stated here once, so that every kind holds an override to the same terms.
 *
 * @module
 */

import { type Optional } from "@metreeca/core";
import { union } from "@metreeca/core/arrays";
import { all, test, type Trace, TraceError, type Validator } from "@metreeca/core/trace";
import type { Reference } from "@metreeca/qest/resource";
import { mergeBoolean, narrowsBoolean } from "../boolean/assembler.js";
import { mergeDictionary, narrowsDictionary } from "../dictionary/assembler.js";
import { mergeNumber, narrowsNumber } from "../number/assembler.js";
import { mergeReference, narrowsReference } from "../reference/assembler.js";
import { mergeResource, narrowsResource } from "../resource/assembler.js";
import type { ResourceShape } from "../resource/index.js";
import { mergeString, narrowsString } from "../string/assembler.js";
import { mergeUnion, narrowsUnion } from "../union/assembler.js";
import { getShapeBranches, type UnionShape } from "../union/index.js";
import type { Shape } from "./index.js";


/**
 * The operators of every shape kind, filed under the kind they serve.
 *
 * @typeParam R The outcome the operators yield
 */
type Operators<R> = {

	readonly [K in Shape["kind"]]: (target: Extract<Shape, { kind: K }>, source: Extract<Shape, { kind: K }>) => R

}

/**
 * The value-domain constraints a scalar shape closes its domain with.
 */
type Enumerated = {

	readonly in?: readonly (number | string)[];
	readonly hasValue?: readonly (number | string)[];

}

/**
 * The datatype a literal shape states its values are typed as.
 */
type Datatyped = {

	readonly datatype?: Reference;

}


/**
 * Reports whether a shape narrows an inherited one.
 *
 * Routes the pair to the operators of the kind they share, so that a caller holding two shapes tests the override
 * relation without knowing which kind it holds. Two shapes of different kinds never narrow one another, as an override
 * refines what a member admits and never retypes it; the one exception is a shape of any other kind overriding a
 * union, which narrows it exactly where it restricts a single one of its alternatives.
 *
 * A resource carries the class it belongs to as part of its value, so every class the inherited shape declares binds
 * the resources the overriding shape admits: the override belongs to each of them, whether it states the class in its
 * own right or inherits it from a shape it extends. An inherited shape declaring no class states no such obligation
 * and holds the override to its members alone.
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

	return target.kind !== source.kind ? [`{kind} mismatched kinds <${target.kind}> vs <${source.kind}>`]
		: operate<Optional<Trace>>(target, source, {

			boolean: narrowsBoolean,
			number: narrowsNumber,
			string: narrowsString,
			dictionary: narrowsDictionary,
			reference: narrowsReference,
			union: narrowsUnion,
			resource: narrowsResourceValue

		});

}

/**
 * Merges a shape with an inherited one.
 *
 * Routes the pair to the operators of the kind they share, so that a caller holding two shapes builds the merged one
 * without knowing which kind it holds. A shape of any other kind overriding a union is merged with the single
 * alternative it restricts, the others being dropped, so the member is no longer polymorphic.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns An immutable shape admitting the values both `target` and `source` admit
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `target` doesn't narrow `source`
 */
export function mergeShape(target: Shape, source: Shape): Shape {

	reject("incompatible shape override", narrowsShape(target, source));

	// the single alternative an overriding shape restricts is the one it is merged with, the rest being dropped

	if ( source.kind === "union" && target.kind !== "union" ) {
		return mergeShape(target, claims(target, source)[0]);
	}

	return operate<Shape>(target, source, {

		boolean: mergeBoolean,
		number: mergeNumber,
		string: mergeString,
		dictionary: mergeDictionary,
		reference: mergeReference,
		union: mergeUnion,
		resource: mergeResource

	});

}

/**
 * Rejects a shape operation an obstacle trace stands against.
 *
 * Lets an assembler state the outcome of a consistency or override test in a single call, throwing only where the
 * test produced a trace.
 *
 * @param message The failure the trace details
 * @param trace The obstacles found, or `undefined` where the test passed
 *
 * @throws {@link @metreeca/core!TraceError | TraceError} Where `trace` is defined
 */
export function reject(message: string, trace: Optional<Trace>): void {

	if ( trace !== undefined ) {
		throw new TraceError(message, trace);
	}

}

/**
 * Reports whether an overriding shape keeps the datatype an inherited one states.
 *
 * States the datatype override rule once for every literal kind: a datatype carries through from whichever shape
 * states it, and the two must agree where both do, as a member is stored under a single datatype.
 *
 * @param source The inherited shape
 *
 * @returns A validator reporting the mismatch between the datatype an overriding shape states and the inherited one
 */
export function narrowsDatatype(source: Datatyped): Validator<Datatyped> {

	return test(({ datatype }) => {

		return datatype === undefined || source.datatype === undefined || datatype === source.datatype || [
			`{datatype} mismatched datatypes <${datatype}> and <${source.datatype}>`
		];

	});

}

/**
 * Reports whether an overriding shape keeps within the value domain an inherited one closes.
 *
 * States the enumeration override rules once for every scalar kind: a child listing a value the parent omits would be
 * intersected away, leaving the state wider than the shape admits, and a required value the child omits would be
 * unioned back in, leaving the child stating a weaker requirement than it enforces, so a widened set is rejected
 * outright as with the bounds.
 *
 * @param source The inherited shape
 *
 * @returns A validator reporting the values an overriding shape adds to the admitted set and the required ones it drops
 */
export function narrowsDomain({ in: allowed, hasValue: required }: Enumerated): Validator<Enumerated> {

	return all<Enumerated>(
		test(({ in: values }) => {

			return values === undefined || allowed === undefined || values.every(v => allowed.includes(v)) || [
				`{in} unexpected values [${values.filter(v => !allowed.includes(v))}]`
			];

		}),
		test(({ hasValue }) => {

			return hasValue === undefined || required === undefined || required.every(v => hasValue.includes(v)) || [
				`{hasValue} missing required values [${required.filter(v => !hasValue.includes(v))}]`
			];

		})
	);

}

/**
 * Checks a closed value domain for internal consistency.
 *
 * States once for every scalar kind the contradiction that would leave a shape requiring a value it doesn't admit.
 *
 * @returns A validator reporting the required values lying outside the admitted set
 */
export function checkDomain(): Validator<Enumerated> {

	return test(({ in: allowed, hasValue }) => {

		return hasValue === undefined || allowed === undefined || hasValue.every(v => allowed.includes(v)) || [
			`{hasValue/in} required values <${hasValue.filter(v => !allowed.includes(v))}> not in allowed set`
		];

	});

}

/**
 * Combines the values an overriding shape admits with the inherited ones.
 *
 * @typeParam V The admitted values
 *
 * @param target The values the overriding shape admits, or `undefined` where it leaves the domain open
 * @param source The values the inherited shape admits, or `undefined` where it leaves the domain open
 *
 * @returns The values both shapes admit, or `undefined` where neither closes the domain
 */
export function intersect<V extends number | string>(
	target: Optional<readonly V[]>,
	source: Optional<readonly V[]>
): Optional<readonly V[]> {

	return target !== undefined && source !== undefined
		? target.filter(v => source.includes(v))
		: target ?? source;

}

/**
 * Combines the values an overriding shape requires with the inherited ones.
 *
 * @typeParam V The required values
 *
 * @param target The values the overriding shape requires, or `undefined` where it requires none
 * @param source The values the inherited shape requires, or `undefined` where it requires none
 *
 * @returns The values either shape requires, or `undefined` where neither requires any
 */
export function unite<V extends number | string>(
	target: Optional<readonly V[]>,
	source: Optional<readonly V[]>
): Optional<readonly V[]> {

	return target !== undefined && source !== undefined
		? union<V>([target, source])
		: target ?? source;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Reports whether a resource shape standing in for an inherited one narrows it.
 *
 * Holds the overriding shape to the classes the inherited one declares, on top of the member relation resource
 * narrowing tests: a shape missing one from its lineage admits resources the inherited shape rejects, whatever its
 * members state. The obligation is stated here rather than in resource narrowing, which serves an extending shape too,
 * where a class of its own is exactly what a shape is expected to state.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns A trace of the obstacles to the override, or `undefined` where `target` narrows `source`
 */
function narrowsResourceValue(target: ResourceShape, source: ResourceShape): Optional<Trace> {

	const missing = lineage(source).filter(iri => !lineage(target).includes(iri));

	return missing.length > 0
		? [`{class} missing inherited classes [${missing}]`]
		: narrowsResource(target, source);


	/**
	 * Resolves the classes a resource shape belongs to: the one it states in its own right, where it states one,
	 * followed by the ones it inherits.
	 */
	function lineage({ class: declared, classes }: ResourceShape): readonly Reference[] {
		return [...declared === undefined ? [] : [declared], ...classes];
	}

}

/**
 * Routes a pair of shapes of the same kind to the operator serving that kind.
 *
 * @typeParam R The outcome the operators yield
 *
 * @param target The overriding shape
 * @param source The inherited shape, of the same kind as `target`
 * @param operators The operators to route the pair to
 *
 * @returns The outcome the operator of the shared kind yields
 */
function operate<R>(target: Shape, source: Shape, operators: Operators<R>): R {

	// the caller is what makes the lookup well-typed: both shapes are known to share target.kind by here

	const operator = operators[target.kind] as (target: Shape, source: Shape) => R; // ;(cast) kinds known to match

	return operator(target, source);

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
