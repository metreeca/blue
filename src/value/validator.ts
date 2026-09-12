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
 * Value validation.
 *
 * Holds a value to what a shape admits: {@link validateShape} routes it to the validators of the shape's kind, so that
 * a caller matching a value against a shape needs not know which kind it holds, and {@link match} tests an identifier
 * against the pattern a shape admits its resources under.
 *
 * @module
 */

import { type Optional } from "@metreeca/core";
import { type Trace } from "@metreeca/core/trace";
import { type Reference } from "@metreeca/qest/resource";
import { validateBoolean } from "../boolean/validator.js";
import { validateDictionary } from "../dictionary/validator.js";
import { validateNumber } from "../number/validator.js";
import { validateReference } from "../reference/validator.js";
import { validateResource } from "../resource/validator.js";
import { validateString } from "../string/validator.js";
import { validateUnion } from "../union/validator.js";
import type { Shape } from "./index.js";


/**
 * The form an identifier pattern is stated in.
 */
const PatternFormat = new RegExp("^"
	+"(?:[a-zA-Z][a-zA-Z0-9+.-]*://[^/]+)?" // optional scheme://authority
	+"/(?:(?:[^/{}*]+|\\{\\w+})(?:/(?:[^/{}*]+|\\{\\w+}))*)?" // path segments with {name} placeholders
	+"(?:/\\*)?" // optional /* wildcard
	+"$"
);



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
 * @see [Unions — Design](../union/index.md)
 */
export type Scope =
	| "state"
	| "bound"
	| "model"


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
 * Checks whether an identifier matches a pattern.
 *
 * Reads a pattern as an IRI template, where `{name}` stands for a single path segment and a trailing `/*` for one or
 * more, so that a shape states the identifiers it admits by their shape rather than by enumeration. A root-relative
 * pattern is matched against the path alone, ignoring the origin, so that the same shape serves whatever host the
 * resources are published under.
 *
 * @param iri The identifier to test
 * @param pattern The pattern to match it against
 *
 * @returns `true` where `iri` matches `pattern`
 *
 * @throws {@link !TypeError TypeError} Where `pattern` is not a well-formed identifier pattern
 */
export function match(iri: Reference, pattern: string): boolean {

	if ( !PatternFormat.test(pattern) ) {
		throw new TypeError(`malformed pattern <${pattern}>`);
	}

	// {name} matches a single path segment; a trailing /* matches one or more

	const expression = pattern
		.replace(/[.+?^$()|[\]\\]/g, "\\$&")
		.replace(/\/\{\w*}(?=\/|$)/g, "/[^/]+")
		.replace(/\/\*$/, "/.+");

	// a root-relative pattern is matched against the path alone, ignoring scheme and authority

	const target = pattern.startsWith("/")
		? iri.replace(/^[a-z][a-z0-9+.-]*:(\/\/[^/]*)?/i, "")
		: iri;

	return new RegExp(`^${expression}$`).test(target);

}
