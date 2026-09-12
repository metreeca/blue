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
 * Holds a value to the form a constraint states: {@link match} tests an identifier against the pattern a shape admits
 * its resources under.
 *
 * @module
 */

import { type Reference } from "@metreeca/qest/resource";


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
