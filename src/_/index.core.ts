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

import type { Eager, Lazy } from "@metreeca/core";
import { type Trace, TraceError } from "@metreeca/core/trace";
import type { Reference } from "@metreeca/qest/resource";
import { mergeBoolean, narrowsBoolean, validateBoolean } from "./boolean.core.js";
import type { BooleanShape } from "./boolean.js";
import { mergeDictionary, narrowsDictionary, type Tagged, validateDictionary } from "./dictionary.core.js";
import type { DictionaryShape } from "./dictionary.js";
import type { Shape } from "./index.js";
import { mergeNumber, narrowsNumber, validateNumber } from "./number.core.js";
import type { NumberShape } from "./number.js";
import { mergeReference, narrowsReference, validateReference } from "./reference.core.js";
import type { ReferenceShape } from "./reference.js";
import { mergeResource, narrowsResource, validateResource } from "./resource.core.js";
import type { ResourceShape } from "./resource.js";
import { mergeString, narrowsString, validateString } from "./string.core.js";
import type { StringShape } from "./string.js";
import { mergeUnion, narrowsUnion, validateUnion } from "./union.core.js";
import type { UnionShape } from "./union.js";


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


//// Shape Operators /////////////////////////////////////////////////////////////////////////////////////////////////

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
export function narrowsShape(target: Shape, source: Shape): undefined | Trace {

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

} = {}): undefined | Trace {

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
