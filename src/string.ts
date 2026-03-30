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
 * Textual shape and factories.
 *
 * Defines shapes and factories for validating textual values, mapping the
 * [JSON string](https://datatracker.ietf.org/doc/html/rfc8259#section-7) type to
 * [XSD 1.0](https://www.w3.org/TR/xmlschema-2/#built-in-datatypes) string datatypes.
 *
 * > Factories validate constraint consistency at construction time:
 * > contradictory constraints like `minLength > maxLength` throw a `RangeError`.
 *
 * | XSD Datatype ¹    | Factory             | Description                    | Format                        |
 * | ----------------- | ------------------- | ------------------------------ | ----------------------------- |
 * | [string][]        | {@link string}      | Unicode character sequence     |                               |
 * | string            | {@link email}       | [RFC 5321][] email address     |                               |
 * | string            | {@link iri}         | [RFC 3987][] IRI reference     |                               |
 * | string            | {@link url}         | [RFC 3986][] hierarchical URL  |                               |
 * | [gYear][]         | {@link year} ²      | [ISO 8601][iso-year] year      | YYYY[Z/±hh:mm]                |
 * | [date][]          | {@link date}        | [ISO 8601][iso-date] date      | YYYY-MM-DD[Z/±hh:mm]          |
 * | [time][]          | {@link time}        | [ISO 8601][iso-time] time      | hh:mm:ss[.sss][Z/±hh:mm]      |
 * | [dateTime][]      | {@link instant}     | [ISO 8601][iso-datetime] date+time   | YYYY-MM-DDThh:mm:ss[.sss][TZ] |
 * | [dateTimeStamp][] | {@link timestamp} ³ | [ISO 8601][iso-datetime] timestamp   | YYYY-MM-DDThh:mm:ss.sssZ      |
 * | [duration][]      | {@link duration}    | [ISO 8601][iso-duration] duration   | [-]PnYnMnDTnHnMnS             |
 *
 * [string]: https://www.w3.org/TR/xmlschema-2/#string
 * [anyURI]: https://www.w3.org/TR/xmlschema-2/#anyURI
 * [gYear]: https://www.w3.org/TR/xmlschema-2/#gYear
 * [date]: https://www.w3.org/TR/xmlschema-2/#date
 * [time]: https://www.w3.org/TR/xmlschema-2/#time
 * [dateTime]: https://www.w3.org/TR/xmlschema-2/#dateTime
 * [dateTimeStamp]: https://www.w3.org/TR/xmlschema11-2/#dateTimeStamp
 * [duration]: https://www.w3.org/TR/xmlschema-2/#duration
 *
 * [RFC 5321]: https://datatracker.ietf.org/doc/html/rfc5321
 * [RFC 3986]: https://datatracker.ietf.org/doc/html/rfc3986
 * [RFC 3987]: https://datatracker.ietf.org/doc/html/rfc3987
 * [iso-year]: https://en.wikipedia.org/wiki/ISO_8601#Years
 * [iso-date]: https://en.wikipedia.org/wiki/ISO_8601#Dates
 * [iso-time]: https://en.wikipedia.org/wiki/ISO_8601#Times
 * [iso-datetime]: https://en.wikipedia.org/wiki/ISO_8601#Combined_date_and_time_representations
 * [iso-duration]: https://en.wikipedia.org/wiki/ISO_8601#Durations
 *
 * ¹ XSD 1.0 datatypes are referenced by [RDF 1.1](https://www.w3.org/TR/rdf11-concepts/) and
 * [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/) as normative;
 * `dateTimeStamp` is defined in [XSD 1.1](https://www.w3.org/TR/xmlschema11-2/#dateTimeStamp)
 *
 * ² [XSD 1.1 Part 2 § D.3.4](https://www.w3.org/TR/xmlschema11-2/#deviantformats) permits optional timezone indicators
 * for `gYear` as a deviation from ISO 8601
 *
 * ³ Requires exactly 3 fractional second digits (millisecond precision) and UTC timezone (`Z` only)
 *
 * **Compatibility**
 *
 * | JSON          | XSD                         | JavaScript                    |
 * | ------------- | --------------------------- | ----------------------------- |
 * | UTF-8 encoded | Unicode (XML 1.0 Char)      | UTF-16 encoded (compatible)   |
 *
 * **Defining String Shapes**
 *
 * ```typescript
 * import { string } from '@metreeca/blue';
 *
 * const text = string();                                 // unconstrained string
 * const name = string({ minLength: 1, maxLength: 100 }); // length-constrained
 * const code = string({ pattern: /^[A-Z]{3}-\d{4}$/ });  // pattern-constrained
 * const status = string({ in: ["active", "inactive"] }); // enumeration-constrained
 * ```
 *
 * **Specialised String Factories**
 *
 * Predefined factories for common string formats:
 *
 * ```typescript
 * import { email, iri, url, date, time, instant, timestamp, duration } from '@metreeca/blue';
 *
 * const contact = email();      // RFC 5321 email address
 * const identifier = iri();     // RFC 3987 IRI reference
 * const link = url();           // RFC 3986 hierarchical URL
 * const birthday = date();      // ISO 8601 date (YYYY-MM-DD)
 * const start = time();         // ISO 8601 time (hh:mm:ss)
 * const created = instant();    // ISO 8601 datetime
 * const modified = timestamp(); // ISO 8601 timestamp (millisecond precision, UTC)
 * const validity = duration();  // ISO 8601 duration
 * ```
 *
 * **Using in Resource Shapes**
 *
 * ```typescript
 * import { required, optional } from '@metreeca/blue/value';
 * import { resource } from '@metreeca/blue/resource';
 * import { string, email, date } from '@metreeca/blue/string';
 *
 * const Person = resource({
 *   name: required(string({ minLength: 1 })),
 *   email: optional(email()),
 *   birthDate: optional(date())
 * });
 * ```
 *
 * @module
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc8259#section-7 RFC 8259 § 7 Strings}
 * @see {@link https://www.w3.org/TR/xmlschema-2/#built-in-datatypes XSD 1.0 Part 2: Datatypes § 3 Built-in
 *     Datatypes}
 */

import { isRegExp, isString } from "@metreeca/core";
import { immutable } from "@metreeca/core/deep";
import type { Variant } from "@metreeca/core/resource";
import { TraceError } from "./index.core.js";
import { checkString } from "./string.core.js";


/**
 * Shape definition for textual values.
 *
 * Validates textual values with length constraints, lexical validation, and value constraints
 * for strings. Supports XSD 1.0 string datatypes and temporal formats.
 *
 * **Inheritance**
 *
 * When a {@link resource!ResourceShape} extends a parent via {@link resource!ResourceConstraints.extends | extends},
 * string-valued properties are merged according to the following rules. The *child* is the extending shape; the
 * *parent* is the inherited shape.
 *
 * | Field       | Override Rule                                                                     |
 * | ----------- | --------------------------------------------------------------------------------- |
 * | `kind`      | Cannot be overridden                                                              |
 * | `model`     | Must be strictly equal — mismatch signals incompatible datatypes                  |
 * | `pattern`   | Parent and child patterns are combined so that both apply                          |
 * | `minLength` | Child ≥ parent, narrowing the minimum length                                           |
 * | `maxLength` | Child ≤ parent, narrowing the maximum length                                           |
 * | `in`        | Intersection of parent and child sets; empty result is reported as an error                  |
 * | `hasValue`  | Union of parent and child required values; child must require all parent values       |
 *
 * **Cross-Field Validation**
 *
 * - merged `minLength` must be ≤ merged `maxLength`
 * - all merged `hasValue` entries must be members of the merged `in` set (if defined)
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#string XSD 1.0 Part 2: Datatypes § 3.2.1 string}
 */
export interface StringShape extends StringConstraints {

	/**
	 * Discriminator identifying this as a textual shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "string";

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * **Inheritance** — must be strictly equal between parent and child; a mismatch signals
	 * incompatible datatypes (for example, `date` vs `email`).
	 *
	 * @defaultValue `""` (empty string)
	 */
	readonly model: string;

	/**
	 * Regular expression pattern that values must match.
	 *
	 * The pattern is tested against the entire value. Use anchors (`^` and `$`) to match
	 * the complete string rather than partial matches.
	 *
	 * **Inheritance** — parent and child patterns are combined so that both apply.
	 *
	 * @defaultValue `undefined` (no pattern constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#PatternConstraintComponent SHACL § 4.3.3 sh:pattern}
	 */
	readonly pattern?: string;

}


/**
 * Constraints for the {@link string} shape factory.
 *
 * Extends {@link TextualConstraints} with the prototype model value.
 */
export interface StringConstraints extends TextualConstraints {

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * @defaultValue `""` (empty string)
	 */
	readonly model?: string;


	/**
	 * Minimum string length in characters.
	 *
	 * **Inheritance** — child value must be ≥ parent value, narrowing the lower bound.
	 *
	 * @defaultValue `undefined` (no minimum length)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinLengthConstraintComponent SHACL § 4.3.1 sh:minLength}
	 */
	readonly minLength?: number;

	/**
	 * Maximum string length in characters.
	 *
	 * **Inheritance** — child value must be ≤ parent value, narrowing the upper bound.
	 *
	 * @defaultValue `undefined` (no maximum length)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxLengthConstraintComponent SHACL § 4.3.2 sh:maxLength}
	 */
	readonly maxLength?: number;


	/**
	 * Regular expression pattern that values must match.
	 *
	 * The pattern is tested against the entire value. Use anchors (`^` and `$`) to match
	 * the complete string rather than partial matches.
	 *
	 * **Inheritance** — parent and child patterns are combined so that both apply.
	 *
	 * @defaultValue `undefined` (no pattern constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#PatternConstraintComponent SHACL § 4.3.3 sh:pattern}
	 */
	readonly pattern?: string | RegExp;

}

/**
 * Constraints for textual shape factories.
 *
 * @see {@link https://www.w3.org/TR/shacl/#core-components-value SHACL § 4.5 Value Constraint Components}
 */
export interface TextualConstraints {

	/**
	 * Allowed values (closed enumeration).
	 *
	 * When specified, values must be members of this list. Must be non-empty.
	 *
	 * **Inheritance** — intersection of parent and child sets; empty result is reported as an error.
	 *
	 * @defaultValue `undefined` (no enumeration constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#InConstraintComponent SHACL § 4.5.1 sh:in}
	 */
	readonly in?: readonly [string, ...string[]];

	/**
	 * Required values that must be present.
	 *
	 * When specified, all listed values must appear in the resource. Must be non-empty.
	 *
	 * **Inheritance** — union of parent and child required values; child must require all parent values.
	 *
	 * @defaultValue `undefined` (no required values)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#HasValueConstraintComponent SHACL § 4.5.2 sh:hasValue}
	 */
	readonly hasValue?: readonly [string, ...string[]];

}


//// Factories /////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a string shape with a typed model value and no other constraints.
 *
 *
 * @typeParam M The literal string type for the model
 *
 * @param model Prototype value for runtime model assembly
 *
 * @returns An immutable shape with `model` typed as `M`
 *
 * @example
 *
 * ```typescript
 * const status = string("active" as const);
 * ```
 */
export function string<M extends string>(model: M): StringShape & { readonly model: M };

/**
 * Creates a string shape with optional validation constraints.
 *
 *
 * @param constraints Optional shape {@link StringConstraints constraints}
 *
 * @returns An immutable shape with `model` typed as `string`
 *
 * @throws {TraceError} If `constraints` contains contradictory values
 *
 * @example
 *
 * ```typescript
 * const text = string();
 * const name = string({ minLength: 1, maxLength: 100 });
 * const code = string({ pattern: /^[A-Z]{3}-\d{4}$/ });
 * ```
 */
export function string<const C extends StringConstraints>(constraints?: C): StringShape;

/**
 * Creates a string shape.
 *
 */
export function string(constraints: string | StringConstraints = {}): StringShape {

	const { model, pattern, ...rest } = isString(constraints) ? { model: constraints } : constraints;

	const shape: StringShape = immutable({

		kind: "string",
		model: model ?? "",

		pattern: isRegExp(pattern) ? pattern.source : pattern,

		...rest

	});

	const trace = checkString(shape);

	if ( trace !== undefined ) {
		throw new TraceError("inconsistent string shape constraints", trace);
	}

	return shape;

}


//// Textual Shorthands ////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a shape for email address values.
 *
 *
 * @param constraints Optional {@link TextualConstraints} validation constraints
 *
 * @returns An immutable shape for validating email addresses
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc5321 RFC 5321 - Simple Mail Transfer Protocol}
 */
export function email(constraints: TextualConstraints = {}): StringShape {
	return string({
		model: "user@example.net",
		pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
		...constraints
	});
}

/**
 * Creates a shape for Internationalized Resource Identifier values.
 *
 * IRIs generalise URIs (RFC 3986) and URLs by allowing the full Unicode character set beyond ASCII. The `variant`
 * constraint controls which subset of the IRI hierarchy is accepted: `hierarchical` (URLs/IRLs with authority),
 * `absolute` (scheme-based URIs/IRIs), `internal` (absolute or root-relative), or `relative` (any valid reference).
 *
 * @param constraints Optional {@link TextualConstraints} validation constraints and IRI {@link Variant | variant}
 *
 * @returns An immutable shape for validating IRIs
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc3987 RFC 3987 - Internationalized Resource Identifiers}
 * @see {@link https://datatracker.ietf.org/doc/html/rfc3986 RFC 3986 - URI Generic Syntax}
 */
export function iri(constraints: TextualConstraints & {

	readonly  variant?: Variant

} = { variant: "relative" }): StringShape {

	const { variant = "relative", ...textual } = constraints;

	return string({

		model: variant === "hierarchical" ? "https://example.net/"
			: variant === "absolute" ? "urn:example:resource"
				: variant === "internal" ? "/path"
					: "./path",

		pattern: variant === "hierarchical" ? /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\S*$/
			: variant === "absolute" ? /^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$/
				: variant === "internal" ? /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\S+|\/\S*)$/
					: /^\S+$/,

		...textual
	});

}

/**
 * Creates a shape for hierarchical URL values.
 *
 * Convenience alias for {@link iri} with `variant: "hierarchical"`, accepting only URLs with a scheme and authority
 * component (for example, `https://example.net/path`).
 *
 * @param constraints Optional {@link TextualConstraints} validation constraints
 *
 * @returns An immutable shape for validating hierarchical URLs
 *
 * @see {@link iri}
 * @see {@link https://datatracker.ietf.org/doc/html/rfc3986 RFC 3986 - URI Generic Syntax}
 */
export function url(constraints: TextualConstraints = {}): StringShape {

	return iri({ variant: "hierarchical", ...constraints });

}


//// Temporal Shorthands ///////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a shape for ISO 8601 year values (YYYY).
 *
 * Supports optional timezone indicators (Z for UTC or ±hh:mm offset).
 *
 *
 * @param constraints Optional {@link TextualConstraints} validation constraints
 *
 * @returns An immutable shape for validating ISO 8601 year strings
 *
 * @remarks
 *
 * XSD permits timezone indicators for gYear as a deviation from ISO 8601.
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#gYear XSD 1.0 Part 2: Datatypes § 3.2.11 gYear}
 */
export function year(constraints: TextualConstraints = {}): StringShape {

	return string({
		model: "1970",
		pattern: /^\d{4}(?:Z|[+-]\d{2}:\d{2})?$/,
		...constraints
	});

}

/**
 * Creates a shape for ISO 8601 calendar date values (YYYY-MM-DD).
 *
 *
 * @param constraints Optional {@link TextualConstraints} validation constraints
 *
 * @returns An immutable shape for validating ISO 8601 date strings
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#date XSD 1.0 Part 2: Datatypes § 3.2.9 date}
 */
export function date(constraints: TextualConstraints = {}): StringShape {

	return string({
		model: "1970-01-01",
		pattern: /^\d{4}-\d{2}-\d{2}(?:Z|[+-]\d{2}:\d{2})?$/,
		...constraints
	});

}

/**
 * Creates a shape for ISO 8601 time of day values (hh:mm:ss).
 *
 *
 * @param constraints Optional {@link TextualConstraints} validation constraints
 *
 * @returns An immutable shape for validating ISO 8601 time strings
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#time XSD 1.0 Part 2: Datatypes § 3.2.8 time}
 */
export function time(constraints: TextualConstraints = {}): StringShape {

	return string({
		model: "00:00:00",
		pattern: /^\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,
		...constraints
	});

}

/**
 * Creates a shape for ISO 8601 date and time values (YYYY-MM-DDThh:mm:ss).
 *
 *
 * @param constraints Optional {@link TextualConstraints} validation constraints
 *
 * @returns An immutable shape for validating ISO 8601 datetime strings
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#dateTime XSD 1.0 Part 2: Datatypes § 3.2.7 dateTime}
 */
export function instant(constraints: TextualConstraints = {}): StringShape {

	return string({
		model: "1970-01-01T00:00:00",
		pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,
		...constraints
	});

}

/**
 * Creates a shape for ISO 8601 timestamp values with millisecond precision (YYYY-MM-DDThh:mm:ss.sssZ).
 *
 * Requires exactly 3 fractional second digits (millisecond precision) and UTC timezone (Z only).
 *
 *
 * @param constraints Optional {@link TextualConstraints} validation constraints
 *
 * @returns An immutable shape for validating ISO 8601 timestamp strings
 *
 * @remarks
 *
 * Applies further restrictions beyond xsd:dateTimeStamp to ensure consistent precision and timezone.
 *
 * @see {@link https://www.w3.org/TR/xmlschema11-2/#dateTimeStamp XSD 1.1 Part 2: Datatypes § 3.4.28 dateTimeStamp}
 */
export function timestamp(constraints: TextualConstraints = {}): StringShape {

	return string({
		model: "1970-01-01T00:00:00.000Z",
		pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
		...constraints
	});

}

/**
 * Creates a shape for ISO 8601 duration values (PnYnMnDTnHnMnS).
 *
 *
 * @param constraints Optional {@link TextualConstraints} validation constraints
 *
 * @returns An immutable shape for validating ISO 8601 duration strings
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#duration XSD 1.0 Part 2: Datatypes § 3.2.6 duration}
 */
export function duration(constraints: TextualConstraints = {}): StringShape {

	return string({
		model: "PT0S",
		pattern: /^-?P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/,
		...constraints
	});

}
