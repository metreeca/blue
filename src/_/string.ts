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
 * [XSD 1.0](https://www.w3.org/TR/xmlschema-2/#built-in-datatypes) string datatypes.
 *
 * > Factories validate constraint consistency at construction time:
 * > contradictory constraints like `minLength > maxLength` throw a `TraceError`.
 *
 * | XSD Datatype ¹    | Factory             | Description                        | Format                        |
 * | ----------------- | ------------------- | ---------------------------------- | ----------------------------- |
 * | [string][]        | {@link string}      | Unicode character sequence         |                               |
 * | string            | {@link text}        | Single-line plain text             |                               |
 * | string            | {@link markdown}    | [Markdown][] formatted text        |                               |
 * | string            | {@link email}       | [RFC 5321][] email address         |                               |
 * | string            | {@link phone}       | [ITU-T E.164][] telephone number   |                               |
 * | string            | {@link iri}         | [RFC 3987][] IRI reference         |                               |
 * | string            | {@link url}         | [RFC 3986][] hierarchical URL      |                               |
 * | string            | {@link tag}         | [BCP 47][] language tag            |                               |
 * | [gYear][]         | {@link year} ²      | [ISO 8601][iso-year] year          | YYYY[Z/±hh:mm]                |
 * | [date][]          | {@link date}        | [ISO 8601][iso-date] date          | YYYY-MM-DD[Z/±hh:mm]          |
 * | [time][]          | {@link time}        | [ISO 8601][iso-time] time          | hh:mm:ss[.sss][Z/±hh:mm]      |
 * | [dateTime][]      | {@link instant}     | [ISO 8601][iso-datetime] date+time | YYYY-MM-DDThh:mm:ss[.sss][TZ] |
 * | [dateTime][]      | {@link timestamp} ³ | [ISO 8601][iso-datetime] UTC timestamp | YYYY-MM-DDThh:mm:ss.sssZ |
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
 * [Markdown]: https://commonmark.org/
 * [RFC 5321]: https://datatracker.ietf.org/doc/html/rfc5321
 * [RFC 3986]: https://datatracker.ietf.org/doc/html/rfc3986
 * [RFC 3987]: https://datatracker.ietf.org/doc/html/rfc3987
 * [ITU-T E.164]: https://www.itu.int/rec/T-REC-E.164
 * [BCP 47]: https://www.rfc-editor.org/info/bcp47
 * [iso-year]: https://en.wikipedia.org/wiki/ISO_8601#Years
 * [iso-date]: https://en.wikipedia.org/wiki/ISO_8601#Dates
 * [iso-time]: https://en.wikipedia.org/wiki/ISO_8601#Times
 * [iso-datetime]: https://en.wikipedia.org/wiki/ISO_8601#Combined_date_and_time_representations
 * [iso-duration]: https://en.wikipedia.org/wiki/ISO_8601#Durations
 *
 * ¹ XSD 1.0 datatypes are referenced by [RDF 1.1](https://www.w3.org/TR/rdf11-concepts/) and
 * [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/) as normative
 *
 * ² [XSD 1.1 Part 2 § D.3.4](https://www.w3.org/TR/xmlschema11-2/#deviantformats) permits optional timezone indicators
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
 * const value = string();                                     // unconstrained string
 * const name = string({ minLength: 1, maxLength: 100 });      // length-constrained
 * const code = string({ pattern: /^[A-Z]{3}-\d{4}$/ });       // pattern-constrained
 * const status = string({ in: ["active", "inactive"] });      // enumeration-constrained
 * ```
 *
 * > An enumeration also narrows the state the shape describes: `status` admits `"active" | "inactive"`, not the whole
 * > textual domain.
 *
 * **Specialised String Factories**
 *
 * Predefined factories for common string formats:
 *
 * ```typescript
 * import {
 *   text, markdown, email, iri, url, tag, date, time, instant, timestamp, duration
 * } from '@metreeca/blue/string';
 *
 * const label = text();         // single-line plain text
 * const body = markdown();      // Markdown formatted text
 * const contact = email();      // RFC 5321 email address
 * const identifier = iri();     // RFC 3987 IRI reference
 * const link = url();           // RFC 3986 hierarchical URL
 * const language = tag();       // BCP 47 language tag
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
 * import { multiple, optional, required, resource } from '@metreeca/blue/resource';
 * import { date, email, string } from '@metreeca/blue/string';
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

import { isRegExp } from "@metreeca/core";
import { xsd } from "@metreeca/core/datatype";
import { TagPattern } from "@metreeca/core/language";
import type { Variant } from "@metreeca/core/resource";
import { immutable } from "@metreeca/core/structures";
import { TraceError } from "@metreeca/core/trace";
import type { Reference } from "@metreeca/qest/resource";
import type { Legal } from "./index.core.js";
import { checkString } from "./string.core.js";


/**
 * Describes a textual value.
 *
 * Admits the [JSON strings](https://datatracker.ietf.org/doc/html/rfc8259#section-7) a resource may carry, bounded by
 * length, lexical and enumeration constraints and typed as an
 * [XSD 1.0](https://www.w3.org/TR/xmlschema-2/#built-in-datatypes) string or temporal datatype, so that a validated
 * value carries the datatype the shape states rather than the one JSON leaves unsaid.
 *
 * **Inheritance**
 *
 * Where a {@link resource!ResourceShape} extends the shapes it lists as {@link resource!ResourceShape.parents |
 * parents}, string-valued members are merged according to the following rules. The *child* is the extending shape; the
 * *parent* is the inherited one.
 *
 * | Field       | Override Rule                                                                      |
 * | ----------- | ---------------------------------------------------------------------------------- |
 * | `kind`      | Cannot be overridden                                                               |
 * | `datatype`  | Must be strictly equal when both defined; the single defined value carries through |
 * | `pattern`   | Must be strictly equal when both defined; the single defined value carries through |
 * | `minLength` | Child ≥ parent, narrowing the minimum length                                       |
 * | `maxLength` | Child ≤ parent, narrowing the maximum length                                       |
 * | `in`        | Child may only drop allowed values                                                 |
 * | `hasValue`  | Child may only add required values                                                 |
 *
 * **Cross-Field Validation**
 *
 * - merged `minLength` must be ≤ merged `maxLength`
 * - all merged `hasValue` entries must be members of the merged `in` set (if defined)
 *
 * @typeParam V The values the shape admits, narrowed to the enumerated ones where it states an
 *     {@link StringValueConstraints.in | enumeration} and the whole textual domain otherwise
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#string XSD 1.0 Part 2: Datatypes § 3.2.1 string}
 */
export type StringShape<V extends string = string> = StringConstraints<V, string> & {

	readonly kind: "string"

}

/**
 * Constraints accepted by the {@link string} shape factory.
 *
 * Adds the RDF datatype and the lexical pattern, which only the general-purpose factory accepts, to the
 * {@link StringLengthConstraints length} and {@link StringValueConstraints value} constraints shared with the
 * specialised factories.
 *
 * @typeParam V The values the enumeration admits
 * @typeParam P The form a pattern takes: a regular expression or its source where one is stated, the source alone on a
 *     {@link StringShape | built shape}
 */
export type StringConstraints<
	V extends string = string,
	P extends string | RegExp = string | RegExp
> = StringLengthConstraints & StringValueConstraints<V> & {

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
	 * @see {@link https://www.w3.org/TR/shacl/#DatatypeConstraintComponent SHACL § 4.1.2 sh:datatype}
	 */
	readonly datatype?: Reference;

	/**
	 * Regular expression pattern that values must match.
	 *
	 * The pattern is matched without anchoring: the constraint holds when the pattern occurs anywhere within the value.
	 * Use anchors (`^` and `$`) to require a match against the complete string.
	 *
	 * **Inheritance** — must be strictly equal when both parent and child define it; otherwise the single defined value
	 * carries through. Within a {@link union!union | union}, this equality makes `pattern` a discriminator: two
	 * same-datatype string variants that differ only by `pattern` are distinct branches.
	 *
	 * @defaultValue `undefined` (no pattern constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#PatternConstraintComponent SHACL § 4.4.3 sh:pattern}
	 */
	readonly pattern?: P;

}

/**
 * Length bounds accepted by the textual shape factories.
 *
 * Bounds the number of characters admitted by a shape, independently of its lexical format. Accepted on its own by the
 * free-form {@link text} and {@link markdown} factories, whose content has no fixed length, and included in the full
 * {@link StringConstraints} set.
 *
 * @see {@link https://www.w3.org/TR/shacl/#core-components-string SHACL § 4.4 String-based Constraint Components}
 */
export type StringLengthConstraints = {

	/**
	 * Minimum string length in characters.
	 *
	 * **Inheritance** — child value must be ≥ parent value, narrowing the lower bound.
	 *
	 * @defaultValue `undefined` (no minimum length)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinLengthConstraintComponent SHACL § 4.4.1 sh:minLength}
	 */
	readonly minLength?: number;

	/**
	 * Maximum string length in characters.
	 *
	 * **Inheritance** — child value must be ≤ parent value, narrowing the upper bound.
	 *
	 * @defaultValue `undefined` (no maximum length)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxLengthConstraintComponent SHACL § 4.4.2 sh:maxLength}
	 */
	readonly maxLength?: number;

}

/**
 * Value constraints accepted by the textual shape factories.
 *
 * Restricts the admissible values of a shape to a closed enumeration or pins values that must be present. Accepted on
 * its own by the format-specific factories, whose lexical space is already fixed, and included in the full
 * {@link StringConstraints} set.
 *
 * @typeParam V The values the enumeration admits
 *
 * @see {@link https://www.w3.org/TR/shacl/#core-components-others SHACL § 4.8 Other Constraint Components}
 */
export type StringValueConstraints<V extends string = string> = {

	/**
	 * Allowed values (closed enumeration).
	 *
	 * When specified, values must be members of this list. Empty arrays are ignored. Closing the domain also narrows
	 * the state the shape describes to the listed values, wherever they are stated precisely enough to be told apart;
	 * a list whose values are only known to be strings leaves the state as the whole textual domain.
	 *
	 * **Inheritance** — child may only drop allowed values.
	 *
	 * @defaultValue `undefined` (no enumeration constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#InConstraintComponent SHACL § 4.8.3 sh:in}
	 */
	readonly in?: readonly V[];

	/**
	 * Required values that must be present.
	 *
	 * When specified, all listed values must appear in the resource. Empty arrays are ignored.
	 *
	 * **Inheritance** — child may only add required values.
	 *
	 * @defaultValue `undefined` (no required values)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#HasValueConstraintComponent SHACL § 4.8.2 sh:hasValue}
	 */
	readonly hasValue?: readonly V[];

}


//// Factories ///////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a textual shape.
 *
 * Contradictory constraints are rejected as the shape is built, so a shape that exists admits at least one value.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional shape {@link StringConstraints constraints}
 *
 * @returns An immutable shape admitting the strings the constraints bound, narrowed to the values they enumerate
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 */
export function string<const C extends StringConstraints = {}>(constraints?: C): StringShape<Legal<C, string>> {

	return create<Legal<C, string>>({ ...constraints });

}


//// Textual Shorthands //////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a shape for single-line plain text values.
 *
 * Fixes the datatype to `xsd:string` and admits space-normalised single-line content: at least one non-whitespace
 * character, no line breaks or tabs, no leading or trailing whitespace, and single spaces between words. Reach for it
 * for labels, names and other short unformatted values that must survive rendering in any layout; reach for
 * {@link markdown} where the content carries formatting or spans multiple lines.
 *
 * @param constraints Optional {@link StringLengthConstraints length bounds}
 *
 * @returns An immutable shape admitting single-line plain text
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 */
export function text(constraints?: StringLengthConstraints): StringShape {

	return create({

		datatype: xsd.string,
		pattern: /^\S+(?: \S+)*$/,

		...constraints

	});

}

/**
 * Creates a shape for Markdown text values.
 *
 * Fixes the datatype to `xsd:string` and admits any string within the stated length bounds. Whitespace carries meaning
 * throughout Markdown, from indentation and blank lines to the trailing spaces that encode a hard break, so no lexical
 * constraint is imposed and authored content survives ingestion verbatim. Reach for it for descriptions, abstracts and
 * other long-form values whose formatting is meaningful; reach for {@link text} where the content must stay a single
 * unformatted line.
 *
 * @param constraints Optional {@link StringLengthConstraints length bounds}
 *
 * @returns An immutable shape admitting Markdown text
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 *
 * @see {@link https://commonmark.org/ CommonMark Spec}
 */
export function markdown(constraints?: StringLengthConstraints): StringShape {

	return create({

		datatype: xsd.string,

		...constraints

	});

}

/**
 * Creates a shape for email address values.
 *
 * Fixes the datatype to `xsd:string`.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link StringValueConstraints value constraints}
 *
 * @returns An immutable shape admitting email addresses, narrowed to the values the constraints enumerate
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc5321 RFC 5321 - Simple Mail Transfer Protocol}
 */
export function email<const C extends StringValueConstraints = {}>(constraints?: C): StringShape<Legal<C, string>> {

	return create<Legal<C, string>>({

		datatype: xsd.string,
		pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

		...constraints

	});

}

/**
 * Creates a shape for telephone number values.
 *
 * Fixes the datatype to `xsd:string` and admits numbers in ITU-T E.164 notation: a leading `+`, a non-zero country code
 * digit, and up to 14 further digits, with no spaces or separators (for example, `+15555550123`).
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link StringValueConstraints value constraints}
 *
 * @returns An immutable shape admitting E.164 telephone numbers, narrowed to the values the constraints enumerate
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 *
 * @see {@link https://www.itu.int/rec/T-REC-E.164 ITU-T E.164 - International public telecommunication numbering plan}
 */
export function phone<const C extends StringValueConstraints = {}>(constraints?: C): StringShape<Legal<C, string>> {

	return create<Legal<C, string>>({

		datatype: xsd.string,
		pattern: /^\+[1-9]\d{1,14}$/,

		...constraints

	});

}

/**
 * Creates a shape for Internationalized Resource Identifier values.
 *
 * Fixes the datatype to `xsd:string`. IRIs generalise URIs (RFC 3986) and URLs by admitting the full Unicode character
 * set beyond ASCII; the {@link Variant | variant} states which subset of the IRI hierarchy is accepted:
 * `hierarchical` (URLs/IRLs with authority), `absolute` (scheme-based URIs/IRIs), `internal` (absolute or
 * root-relative), or `relative` (any valid reference).
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link StringValueConstraints value constraints} and IRI {@link Variant | variant}
 *
 * @returns An immutable shape admitting IRIs of the stated variant, narrowed to the values the constraints enumerate
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc3987 RFC 3987 - Internationalized Resource Identifiers}
 * @see {@link https://datatracker.ietf.org/doc/html/rfc3986 RFC 3986 - URI Generic Syntax}
 */
export function iri<const C extends StringValueConstraints & {

	/**
	 * The subset of the IRI hierarchy admitted.
	 *
	 * @defaultValue `"relative"`
	 */
	readonly variant?: Variant

} = {}>(constraints?: C): StringShape<Legal<C, string>> {

	const { variant = "relative", ...values } = constraints ?? {};

	return create<Legal<C, string>>({

		datatype: xsd.string,
		pattern: IRIPatterns[variant],

		...values

	});

}

/**
 * Creates a shape for hierarchical URL values.
 *
 * Fixes the datatype to `xsd:string` and admits only URLs with a scheme and an authority component (for example,
 * `https://example.net/path`), as {@link iri} does with `variant: "hierarchical"`.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link StringValueConstraints value constraints}
 *
 * @returns An immutable shape admitting hierarchical URLs, narrowed to the values the constraints enumerate
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc3986 RFC 3986 - URI Generic Syntax}
 */
export function url<const C extends StringValueConstraints = {}>(constraints?: C): StringShape<Legal<C, string>> {

	return create<Legal<C, string>>({

		datatype: xsd.string,
		pattern: IRIPatterns.hierarchical,

		...constraints

	});

}

/**
 * Creates a shape for language tag values.
 *
 * Fixes the datatype to `xsd:string` and admits BCP 47 language tags identifying a natural language, from a bare
 * language subtag to a fully qualified tag carrying script, region, variant, extension and private-use subtags (for
 * example, `en`, `fr-CA`, `zh-Hans-CN`); subtags are matched case-insensitively, as the standard prescribes, and
 * grandfathered tags are not accepted.
 *
 * Reach for it wherever a member records the language of a value; language *ranges*, which select values rather than
 * identify a language, are constrained by {@link dictionary!DictionaryConstraints.languageIn | languageIn} instead.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link StringValueConstraints value constraints}
 *
 * @returns An immutable shape admitting language tags, narrowed to the values the constraints enumerate
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 *
 * @see {@link https://www.rfc-editor.org/info/bcp47 BCP 47 - Tags for Identifying Languages}
 */
export function tag<const C extends StringValueConstraints = {}>(constraints?: C): StringShape<Legal<C, string>> {

	return create<Legal<C, string>>({

		datatype: xsd.string,
		pattern: TagPattern,

		...constraints

	});

}


//// Temporal Shorthands /////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a shape for ISO 8601 year values (YYYY).
 *
 * Fixes the datatype to `xsd:gYear` and admits an optional timezone indicator (`Z` for UTC or a ±hh:mm offset).
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link StringValueConstraints value constraints}
 *
 * @returns An immutable shape admitting ISO 8601 years, narrowed to the values the constraints enumerate
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 *
 * @remarks
 *
 * XSD permits timezone indicators for gYear as a deviation from ISO 8601.
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#gYear XSD 1.0 Part 2: Datatypes § 3.2.11 gYear}
 */
export function year<const C extends StringValueConstraints = {}>(constraints?: C): StringShape<Legal<C, string>> {

	return create<Legal<C, string>>({

		datatype: xsd.gYear,
		pattern: /^\d{4}(?:Z|[+-]\d{2}:\d{2})?$/,

		...constraints

	});

}

/**
 * Creates a shape for ISO 8601 calendar date values (YYYY-MM-DD).
 *
 * Fixes the datatype to `xsd:date`.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link StringValueConstraints value constraints}
 *
 * @returns An immutable shape admitting ISO 8601 dates, narrowed to the values the constraints enumerate
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#date XSD 1.0 Part 2: Datatypes § 3.2.9 date}
 */
export function date<const C extends StringValueConstraints = {}>(constraints?: C): StringShape<Legal<C, string>> {

	return create<Legal<C, string>>({

		datatype: xsd.date,
		pattern: /^\d{4}-\d{2}-\d{2}(?:Z|[+-]\d{2}:\d{2})?$/,

		...constraints

	});

}

/**
 * Creates a shape for ISO 8601 time of day values (hh:mm:ss).
 *
 * Fixes the datatype to `xsd:time`.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link StringValueConstraints value constraints}
 *
 * @returns An immutable shape admitting ISO 8601 times, narrowed to the values the constraints enumerate
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#time XSD 1.0 Part 2: Datatypes § 3.2.8 time}
 */
export function time<const C extends StringValueConstraints = {}>(constraints?: C): StringShape<Legal<C, string>> {

	return create<Legal<C, string>>({

		datatype: xsd.time,
		pattern: /^\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,

		...constraints

	});

}

/**
 * Creates a shape for ISO 8601 date and time values (YYYY-MM-DDThh:mm:ss).
 *
 * Fixes the datatype to `xsd:dateTime`.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link StringValueConstraints value constraints}
 *
 * @returns An immutable shape admitting ISO 8601 date and time values, narrowed to the values the constraints
 *     enumerate
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#dateTime XSD 1.0 Part 2: Datatypes § 3.2.7 dateTime}
 */
export function instant<const C extends StringValueConstraints = {}>(constraints?: C): StringShape<Legal<C, string>> {

	return create<Legal<C, string>>({

		datatype: xsd.dateTime,
		pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,

		...constraints

	});

}

/**
 * Creates a shape for UTC timestamp values with millisecond precision (YYYY-MM-DDThh:mm:ss.sssZ).
 *
 * Requires exactly 3 fractional second digits and the UTC timezone (`Z` only). Fixes the datatype to `xsd:dateTime`
 * rather than the more specific `xsd:dateTimeStamp`, so values stay compatible with SPARQL temporal functions, which
 * are defined over `xsd:dateTime`.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link StringValueConstraints value constraints}
 *
 * @returns An immutable shape admitting UTC timestamps, narrowed to the values the constraints enumerate
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#dateTime XSD 1.0 Part 2: Datatypes § 3.2.7 dateTime}
 */
export function timestamp<const C extends StringValueConstraints = {}>(constraints?: C): StringShape<Legal<C, string>> {

	return create<Legal<C, string>>({

		datatype: xsd.dateTime,
		pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,

		...constraints

	});

}

/**
 * Creates a shape for ISO 8601 duration values (PnYnMnDTnHnMnS).
 *
 * Fixes the datatype to `xsd:duration`.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link StringValueConstraints value constraints}
 *
 * @returns An immutable shape admitting ISO 8601 durations, narrowed to the values the constraints enumerate
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#duration XSD 1.0 Part 2: Datatypes § 3.2.6 duration}
 */
export function duration<const C extends StringValueConstraints = {}>(constraints?: C): StringShape<Legal<C, string>> {

	return create<Legal<C, string>>({

		datatype: xsd.duration,
		pattern: /^-?P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/,

		...constraints

	});

}


//// Assembly ////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Lexical patterns admitting each subset of the IRI hierarchy.
 */
const IRIPatterns: Readonly<Record<Variant, RegExp>> = {

	hierarchical: /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\S*$/,
	absolute: /^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$/,
	internal: /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\S+|\/\S*)$/,
	relative: /^\S+$/

};

/**
 * Creates a textual shape.
 *
 * Backs every factory this module exposes, fixing what they share: a stated `pattern` is normalised to its source, so
 * that a built shape carries the lexical constraint in the single form {@link StringShape} states, and contradictory
 * constraints are rejected as the shape is built, so that a shape that exists admits at least one value.
 *
 * @typeParam V The values the shape admits, as stated by the signature of the calling factory
 *
 * @param constraints The stated shape {@link StringConstraints constraints}
 *
 * @returns An immutable shape admitting the strings the constraints bound
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 */
function create<V extends string>(constraints: StringConstraints): StringShape<V> {

	const shape = immutable({

		kind: "string",

		...constraints,

		pattern: isRegExp(constraints.pattern) ? constraints.pattern.source : constraints.pattern

	}) as StringShape<V>; // ;(cast) the factory signatures fix the admitted values to the enumerated ones

	const trace = checkString(shape);

	if ( trace !== undefined ) {
		throw new TraceError("inconsistent string shape constraints", trace);
	}

	return shape;

}
