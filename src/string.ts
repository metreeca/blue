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
 * | XSD Datatype ¹    | Factory             | Description                        | Format                        |
 * | ----------------- | ------------------- | ---------------------------------- | ----------------------------- |
 * | [string][]        | {@link string}      | Unicode character sequence         |                               |
 * | string            | {@link email}       | [RFC 5321][] email address         |                               |
 * | string            | {@link phone}       | [ITU-T E.164][] telephone number   |                               |
 * | string            | {@link iri}         | [RFC 3987][] IRI reference         |                               |
 * | string            | {@link url}         | [RFC 3986][] hierarchical URL      |                               |
 * | [gYear][]         | {@link year} ²      | [ISO 8601][iso-year] year          | YYYY[Z/±hh:mm]                |
 * | [date][]          | {@link date}        | [ISO 8601][iso-date] date          | YYYY-MM-DD[Z/±hh:mm]          |
 * | [time][]          | {@link time}        | [ISO 8601][iso-time] time          | hh:mm:ss[.sss][Z/±hh:mm]      |
 * | [dateTime][]      | {@link instant}     | [ISO 8601][iso-datetime] date+time | YYYY-MM-DDThh:mm:ss[.sss][TZ] |
 * | [dateTime][]      | {@link timestamp} ³ | [ISO 8601][iso-datetime] UTC timestamp | YYYY-MM-DDThh:mm:ss.sssZ |
 * | [duration][]      | {@link duration}    | [ISO 8601][iso-duration] duration  | [-]PnYnMnDTnHnMnS             |
 *
 * [string]: https://www.w3.org/TR/xmlschema-2/#string
 * [anyURI]: https://www.w3.org/TR/xmlschema-2/#anyURI
 * [gYear]: https://www.w3.org/TR/xmlschema-2/#gYear
 * [date]: https://www.w3.org/TR/xmlschema-2/#date
 * [time]: https://www.w3.org/TR/xmlschema-2/#time
 * [dateTime]: https://www.w3.org/TR/xmlschema-2/#dateTime
 * [duration]: https://www.w3.org/TR/xmlschema-2/#duration
 *
 * [RFC 5321]: https://datatracker.ietf.org/doc/html/rfc5321
 * [RFC 3986]: https://datatracker.ietf.org/doc/html/rfc3986
 * [RFC 3987]: https://datatracker.ietf.org/doc/html/rfc3987
 * [ITU-T E.164]: https://www.itu.int/rec/T-REC-E.164
 * [iso-year]: https://en.wikipedia.org/wiki/ISO_8601#Years
 * [iso-date]: https://en.wikipedia.org/wiki/ISO_8601#Dates
 * [iso-time]: https://en.wikipedia.org/wiki/ISO_8601#Times
 * [iso-datetime]: https://en.wikipedia.org/wiki/ISO_8601#Combined_date_and_time_representations
 * [iso-duration]: https://en.wikipedia.org/wiki/ISO_8601#Durations
 *
 * ¹ XSD 1.0 datatypes are referenced by [RDF 1.1](https://www.w3.org/TR/rdf11-concepts/) and
 * [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/) as normative
 *
 * ² [XSD 1.1 Part 2 § D.3.4](https://www.w3.org/TR/xmlschema11-2/#deviantformats) permits optional timezone indicators
 * for `gYear` as a deviation from ISO 8601
 *
 * ³ Requires exactly 3 fractional second digits (millisecond precision) and UTC timezone (`Z` only); typed as
 * `xsd:dateTime` rather than the more specific `xsd:dateTimeStamp` for compatibility with SPARQL temporal functions,
 * which are defined over `xsd:dateTime`
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
 * import { string } from '@metreeca/blue/string';
 *
 * const text = string();                                                  // unconstrained string
 * const name = string({ model: "name", minLength: 1, maxLength: 100 });   // length-constrained
 * const code = string({ model: "ABC-1234", pattern: /^[A-Z]{3}-\d{4}$/ });// pattern-constrained
 * const status = string({ in: ["active", "inactive"] });                  // enumeration-constrained
 * ```
 *
 * > The `model` is a retrieval placeholder matched by JSON type alone: its value is immaterial and need not be legal
 * > for the shape's constraints, so an unspecified one defaults to the empty string regardless of any `pattern`.
 *
 * **Specialised String Factories**
 *
 * Predefined factories for common string formats:
 *
 * ```typescript
 * import { email, iri, url, date, time, instant, timestamp, duration } from '@metreeca/blue/string';
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
 *   name: required(string({ model: "name", minLength: 1 })),
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
import { xsd } from "@metreeca/core/datatype";
import { immutable } from "@metreeca/core/structures";
import { type Variant } from "@metreeca/core/resource";
import type { Reference } from "@metreeca/qest";

import { TraceError } from "@metreeca/core/trace";
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
 * string-valued entries are merged according to the following rules. The *child* is the extending shape; the
 * *parent* is the inherited shape.
 *
 * | Field       | Override Rule                                                                      |
 * | ----------- | ---------------------------------------------------------------------------------- |
 * | `kind`      | Cannot be overridden                                                               |
 * | `model`     | Taken from the child: a retrieval placeholder                                      |
 * | `datatype`  | Must be strictly equal when both defined; the single defined value carries through |
 * | `pattern`   | Must be strictly equal when both defined; the single defined value carries through |
 * | `minLength` | Child ≥ parent, narrowing the minimum length                                       |
 * | `maxLength` | Child ≤ parent, narrowing the maximum length                                       |
 * | `in`        | Intersection of parent and child sets; empty result is reported as an error        |
 * | `hasValue`  | Union of parent and child required values; child must require all parent values    |
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
	 * A retrieval placeholder matched by JSON type alone: its value is immaterial and need not be legal for the value
	 * constraints, so factories keep an explicit `model` verbatim and default an unspecified one to `""`. A merge keeps
	 * the child's value.
	 *
	 * @defaultValue `""` (empty string)
	 */
	readonly model: string;

	/**
	 * Regular expression pattern that values must match.
	 *
	 * The pattern is matched without anchoring: the constraint holds when the pattern occurs anywhere
	 * within the value. Use anchors (`^` and `$`) to require a match against the complete string.
	 *
	 * **Inheritance** — must be strictly equal when both parent and child define it; otherwise the single defined value
	 * carries through. Within a {@link union!union | union}, this equality makes `pattern` a discriminator: two
	 * same-datatype string variants that differ only by `pattern` are distinct branches.
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
	 * Explicit prototype value for runtime model assembly.
	 *
	 * A retrieval placeholder matched by JSON type alone: kept verbatim, its value is immaterial and need not be
	 * legal for the value constraints. When omitted, the prototype defaults to the empty string.
	 *
	 * @defaultValue `undefined` (the prototype defaults to `""`)
	 */
	readonly model?: string;

	/**
	 * RDF datatype IRI for the textual literal.
	 *
	 * Infers the RDF datatype of validated JSON values, which carry no datatype information of their own.
	 *
	 * **Inheritance** — must be strictly equal when both parent and child define it; otherwise the single defined value
	 * carries through. A mismatch signals incompatible datatypes.
	 *
	 * @defaultValue `undefined` (falls back to `xsd:string`)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#DatatypeConstraintComponent SHACL § 4.2.2 sh:datatype}
	 */
	readonly datatype?: Reference;


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
	 * The pattern is matched without anchoring: the constraint holds when the pattern occurs anywhere
	 * within the value. Use anchors (`^` and `$`) to require a match against the complete string.
	 *
	 * **Inheritance** — must be strictly equal when both parent and child define it; otherwise the single defined value
	 * carries through. Within a {@link union!union | union}, this equality makes `pattern` a discriminator: two
	 * same-datatype string variants that differ only by `pattern` are distinct branches.
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
	 * When specified, values must be members of this list. Empty arrays are ignored.
	 *
	 * **Inheritance** — intersection of parent and child sets; empty result is reported as an error.
	 *
	 * @defaultValue `undefined` (no enumeration constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#InConstraintComponent SHACL § 4.5.1 sh:in}
	 */
	readonly in?: readonly string[];

	/**
	 * Required values that must be present.
	 *
	 * When specified, all listed values must appear in the resource. Empty arrays are ignored.
	 *
	 * **Inheritance** — union of parent and child required values; child must require all parent values.
	 *
	 * @defaultValue `undefined` (no required values)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#HasValueConstraintComponent SHACL § 4.5.2 sh:hasValue}
	 */
	readonly hasValue?: readonly string[];

}


//// Factories /////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a string shape with a typed model value and no other constraints.
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
 * const code = string({ model: "ABC-1234", pattern: /^[A-Z]{3}-\d{4}$/ });
 * ```
 */
export function string<const C extends StringConstraints>(constraints?: C): StringShape;

/**
 * Creates a string shape.
 */
export function string(constraints: string | StringConstraints = {}): StringShape {

	const effective = isString(constraints) ? { model: constraints } : constraints;

	const shape: StringShape = immutable({

		kind: "string",

		...effective,

		model: effective.model ?? "",

		pattern: isRegExp(effective.pattern)
			? effective.pattern.source
			: effective.pattern

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
 * Defaults the datatype to `xsd:string`.
 *
 * @param constraints Optional {@link TextualConstraints validation constraints}
 *
 * @returns An immutable shape for validating email addresses
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc5321 RFC 5321 - Simple Mail Transfer Protocol}
 */
export function email(constraints: TextualConstraints = {}): StringShape {

	return string({
		model: "user@example.net",
		datatype: xsd.string,
		pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
		...constraints
	});

}

/**
 * Creates a shape for telephone number values.
 *
 * Defaults the datatype to `xsd:string`.
 *
 * Accepts numbers in ITU-T E.164 notation: a leading `+`, a non-zero country code digit, and up to 14 further digits,
 * with no spaces or separators (for example, `+15555550123`).
 *
 * @param constraints Optional {@link TextualConstraints validation constraints}
 *
 * @returns An immutable shape for validating E.164 telephone numbers
 *
 * @see {@link https://www.itu.int/rec/T-REC-E.164 ITU-T E.164 - International public telecommunication numbering plan}
 */
export function phone(constraints: TextualConstraints = {}): StringShape {

	return string({
		model: "+15555550123",
		datatype: xsd.string,
		pattern: /^\+[1-9]\d{1,14}$/,
		...constraints
	});

}

/**
 * Creates a shape for Internationalized Resource Identifier values.
 *
 * Defaults the datatype to `xsd:string`.
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

} = {

	variant: "relative"

}): StringShape {

	const { variant = "relative" } = constraints;

	return string({

		model: variant === "hierarchical" ? "https://example.net/"
			: variant === "absolute" ? "urn:example:resource"
				: variant === "internal" ? "/path"
					: "./path",

		datatype: xsd.string,

		pattern: variant === "hierarchical" ? /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\S*$/
			: variant === "absolute" ? /^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$/
				: variant === "internal" ? /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\S+|\/\S*)$/
					: /^\S+$/,

		...constraints

	});

}

/**
 * Creates a shape for hierarchical URL values.
 *
 * Defaults the datatype to `xsd:string`.
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
 * Defaults the datatype to `xsd:gYear`.
 *
 * Supports optional timezone indicators (Z for UTC or ±hh:mm offset).
 *
 * @param constraints Optional {@link TextualConstraints validation constraints}
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
		datatype: xsd.gYear,
		pattern: /^\d{4}(?:Z|[+-]\d{2}:\d{2})?$/,
		...constraints
	});

}

/**
 * Creates a shape for ISO 8601 calendar date values (YYYY-MM-DD).
 *
 * Defaults the datatype to `xsd:date`.
 *
 * @param constraints Optional {@link TextualConstraints validation constraints}
 *
 * @returns An immutable shape for validating ISO 8601 date strings
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#date XSD 1.0 Part 2: Datatypes § 3.2.9 date}
 */
export function date(constraints: TextualConstraints = {}): StringShape {

	return string({
		model: "1970-01-01",
		datatype: xsd.date,
		pattern: /^\d{4}-\d{2}-\d{2}(?:Z|[+-]\d{2}:\d{2})?$/,
		...constraints
	});

}

/**
 * Creates a shape for ISO 8601 time of day values (hh:mm:ss).
 *
 * Defaults the datatype to `xsd:time`.
 *
 * @param constraints Optional {@link TextualConstraints validation constraints}
 *
 * @returns An immutable shape for validating ISO 8601 time strings
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#time XSD 1.0 Part 2: Datatypes § 3.2.8 time}
 */
export function time(constraints: TextualConstraints = {}): StringShape {

	return string({
		model: "00:00:00",
		datatype: xsd.time,
		pattern: /^\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,
		...constraints
	});

}

/**
 * Creates a shape for ISO 8601 date and time values (YYYY-MM-DDThh:mm:ss).
 *
 * Defaults the datatype to `xsd:dateTime`.
 *
 * @param constraints Optional {@link TextualConstraints validation constraints}
 *
 * @returns An immutable shape for validating ISO 8601 datetime strings
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#dateTime XSD 1.0 Part 2: Datatypes § 3.2.7 dateTime}
 */
export function instant(constraints: TextualConstraints = {}): StringShape {

	return string({
		model: "1970-01-01T00:00:00",
		datatype: xsd.dateTime,
		pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,
		...constraints
	});

}

/**
 * Creates a shape for UTC timestamp values with millisecond precision (YYYY-MM-DDThh:mm:ss.sssZ).
 *
 * Defaults the datatype to `xsd:dateTime` rather than the more specific `xsd:dateTimeStamp` so values remain compatible
 * with SPARQL temporal functions, which are defined over `xsd:dateTime`.
 *
 * Requires exactly 3 fractional second digits (millisecond precision) and UTC timezone (`Z` only).
 *
 * @param constraints Optional {@link TextualConstraints validation constraints}
 *
 * @returns An immutable shape for validating UTC timestamp strings
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#dateTime XSD 1.0 Part 2: Datatypes § 3.2.7 dateTime}
 */
export function timestamp(constraints: TextualConstraints = {}): StringShape {

	return string({
		model: "1970-01-01T00:00:00.000Z",
		datatype: xsd.dateTime,
		pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
		...constraints
	});

}

/**
 * Creates a shape for ISO 8601 duration values (PnYnMnDTnHnMnS).
 *
 * Defaults the datatype to `xsd:duration`.
 *
 * @param constraints Optional {@link TextualConstraints validation constraints}
 *
 * @returns An immutable shape for validating ISO 8601 duration strings
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#duration XSD 1.0 Part 2: Datatypes § 3.2.6 duration}
 */
export function duration(constraints: TextualConstraints = {}): StringShape {

	return string({
		model: "PT0S",
		datatype: xsd.duration,
		pattern: /^-?P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/,
		...constraints
	});

}
