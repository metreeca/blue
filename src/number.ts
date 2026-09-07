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
 * Numeric shape and factories.
 *
 * Defines shapes and factories for validating numeric values, mapping the
 * [JSON number](https://datatracker.ietf.org/doc/html/rfc8259#section-6) type to
 * [XSD 1.0](https://www.w3.org/TR/xmlschema-2/#built-in-datatypes) numeric datatypes.
 *
 * > Factories validate constraint consistency at construction time:
 * > contradictory constraints like `minInclusive > maxInclusive` throw a `RangeError`.
 *
 * | XSD Datatype ¹  | Factory           | Description                  | Range                      |
 * | --------------- | ----------------- | ---------------------------- | -------------------------- |
 * | [byte][]        | {@link byte}      | 8-bit signed integer         | [‑2⁷, 2⁷‑1]                |
 * | [short][]       | {@link short}     | 16-bit signed integer        | [‑2¹⁵, 2¹⁵‑1]              |
 * | [int][]         | {@link int}       | 32-bit signed integer        | [‑2³¹, 2³¹‑1]              |
 * | [long][]        | {@link long} ²    | 64-bit signed integer        | [‑2⁶³, 2⁶³‑1]              |
 * | [float][]       | {@link float}     | IEEE 754 32-bit float        | m < 2²⁴, e ∈ [‑126, 127]   |
 * | [double][]      | {@link double}    | IEEE 754 64-bit float        | m < 2⁵³, e ∈ [‑1022, 1023] |
 * | [integer][]     | {@link integer} ² | arbitrary-precision integer  | ±#                         |
 * | [decimal][]     | {@link decimal} ² | arbitrary-precision decimal  | ±#.#                       |
 *
 * [byte]: https://www.w3.org/TR/xmlschema-2/#byte
 * [short]: https://www.w3.org/TR/xmlschema-2/#short
 * [int]: https://www.w3.org/TR/xmlschema-2/#int
 * [long]: https://www.w3.org/TR/xmlschema-2/#long
 * [float]: https://www.w3.org/TR/xmlschema-2/#float
 * [double]: https://www.w3.org/TR/xmlschema-2/#double
 * [integer]: https://www.w3.org/TR/xmlschema-2/#integer
 * [decimal]: https://www.w3.org/TR/xmlschema-2/#decimal
 *
 * ¹ XSD 1.0 datatypes are referenced by [RDF 1.1](https://www.w3.org/TR/rdf11-concepts/) and
 * [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/) as normative
 *
 * ² Numeric types with ranges exceeding JavaScript's safe integer range (±2⁵³-1) or requiring
 * arbitrary precision cannot be fully represented in JSON/JavaScript
 *
 * **Compatibility**
 *
 * | JSON               | XSD                                 | JavaScript                        |
 * | ------------------ | ----------------------------------- | --------------------------------- |
 * | Integer/decimal    | byte, short, int: fully supported   | Safe integers within ±2⁵³-1      |
 * |                    | long: may exceed ±2⁶³-1             | Cannot represent beyond ±2⁵³-1   |
 * | No NaN/INF values  | float, double: has NaN, ±INF        | IEEE 754 with NaN, ±Infinity      |
 * | Safe integer range | integer: arbitrary-precision        | Requires BigInt beyond ±2⁵³-1    |
 * | Double precision   | decimal: arbitrary-precision        | No native arbitrary decimal       |
 *
 * **Defining Numeric Shapes**
 *
 * ```typescript
 * import { number, integer, decimal } from '@metreeca/blue/number';
 *
 * const count = number();                                       // default model: 0
 * const score = number({ minInclusive: 0, maxInclusive: 100 }); // constrained range
 * const age = integer({ minInclusive: 0 });                     // arbitrary-precision integer
 * const price = decimal({ minInclusive: 0 });                   // arbitrary-precision decimal
 * ```
 *
 * **Typed Numeric Factories**
 *
 * Specialised factories map to XSD numeric datatypes with predefined precision:
 *
 * ```typescript
 * import { byte, short, int, long, float, double } from '@metreeca/blue/number';
 *
 * const priority = byte();       // 8-bit signed integer
 * const port = short();          // 16-bit signed integer
 * const quantity = int();        // 32-bit signed integer
 * const offset = long();         // 64-bit signed integer
 * const ratio = float();         // IEEE 754 single-precision
 * const measurement = double();  // IEEE 754 double-precision
 * ```
 *
 * **Using in Resource Shapes**
 *
 * ```typescript
 * import { required, optional } from '@metreeca/blue/value';
 * import { resource } from '@metreeca/blue/resource';
 * import { integer, decimal } from '@metreeca/blue/number';
 *
 * const Product = resource({
 *   price: required(decimal({ minInclusive: 0 })),
 *   quantity: optional(integer({ minInclusive: 0 })),
 *   rating: optional(decimal({ minInclusive: 0, maxInclusive: 5 }))
 * });
 * ```
 *
 * @module
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc8259#section-6 RFC 8259 § 6 Numbers}
 * @see {@link https://www.w3.org/TR/xmlschema-2/#built-in-datatypes XSD 1.0 Part 2: Datatypes § 3 Built-in
 *     Datatypes}
 */

import { isNumber } from "@metreeca/core";
import { xsd } from "@metreeca/core/datatype";
import { immutable } from "@metreeca/core/structures";
import type { Reference } from "@metreeca/qest";

import { TraceError } from "@metreeca/core/trace";
import { checkNumber } from "./number.core.js";


const BYTE_MAX = 2**7-1;
const SHORT_MAX = 2**15-1;
const INT_MAX = 2**31-1;
const FLOAT_MAX = (2-2** -23)*2**127;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Shape definition for numeric values.
 *
 * Validates numeric values with range and value constraints. Supports XSD 1.0 numeric
 * datatypes including integers, decimals, and floating-point values.
 *
 * **Inheritance**
 *
 * When a {@link resource!ResourceShape} extends a parent via {@link resource!ResourceConstraints.extends | extends},
 * numeric-valued entries are merged according to the following rules. The *child* is the extending shape; the
 * *parent* is the inherited shape.
 *
 * | Field          | Override Rule                                                                               |
 * | -------------- | ------------------------------------------------------------------------------------------- |
 * | `kind`         | Cannot be overridden                                                                        |
 * | `model`        | Taken from the child: a retrieval placeholder                                               |
 * | `datatype`     | Must be strictly equal when both defined; the single defined value carries through          |
 * | `integral`     | Child may add but not drop; an integral parent cannot be overridden by a non-integral child |
 * | `minExclusive` | Child ≥ parent, narrowing the exclusive lower bound                                         |
 * | `maxExclusive` | Child ≤ parent, narrowing the exclusive upper bound                                         |
 * | `minInclusive` | Child ≥ parent, narrowing the inclusive lower bound                                         |
 * | `maxInclusive` | Child ≤ parent, narrowing the inclusive upper bound                                         |
 * | `in`           | Intersection of parent and child sets; empty result is reported as an error                 |
 * | `hasValue`     | Union of parent and child required values; child must require all parent values             |
 *
 * Inclusive/exclusive pairs are independently merged: a child may define an exclusive bound alongside a parent's
 * inclusive bound (or vice versa), narrowing the range without removing the original constraint.
 *
 * **Cross-Field Validation**
 *
 * - merged `minExclusive` must be < merged `maxExclusive`
 * - merged `minInclusive` must be ≤ merged `maxInclusive`
 * - exclusive and inclusive bounds must not contradict
 * - all merged `hasValue` entries must be members of the merged `in` set (if defined)
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#built-in-datatypes XSD 1.0 Part 2: Datatypes § 3 Built-in Datatypes}
 */
export interface NumberShape extends NumberConstraints {

	/**
	 * Discriminator identifying this as a numeric shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "number";

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * A retrieval placeholder matched by JSON type alone: its value is immaterial and need not be legal for the value
	 * constraints, so factories keep an explicit `model` verbatim and default an unspecified one to `0`. A merge keeps
	 * the child's value.
	 *
	 * @defaultValue `0`
	 */
	readonly model: number;

}


/**
 * Constraints for the {@link number} shape factory.
 *
 * Extends {@link NumericConstraints} with the prototype model value.
 */
export interface NumberConstraints extends NumericConstraints {

	/**
	 * Explicit prototype value for runtime model assembly.
	 *
	 * A retrieval placeholder matched by JSON type alone: kept verbatim, its value is immaterial and need not be
	 * legal for the value constraints. When omitted, the prototype defaults to `0`.
	 *
	 * @defaultValue `undefined` (the prototype defaults to `0`)
	 */
	readonly model?: number;

	/**
	 * RDF datatype IRI for the numeric literal.
	 *
	 * Infers the RDF datatype of validated JSON values, which carry no datatype information of their own.
	 *
	 * **Inheritance** — must be strictly equal when both parent and child define it; otherwise the single defined value
	 * carries through. A mismatch signals incompatible datatypes.
	 *
	 * @defaultValue `undefined` (falls back to `xsd:double`)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#DatatypeConstraintComponent SHACL § 4.2.2 sh:datatype}
	 */
	readonly datatype?: Reference;

	/**
	 * Restricts values to integers.
	 *
	 * When `true`, validated values must be integers (no fractional part); fractional values are rejected. Decouples
	 * integrality from {@link datatype}, so custom or non-XSD integral types are declarable without relying on a
	 * recognised datatype IRI. The integer-family factories ({@link byte}, {@link short}, {@link int}, {@link long},
	 * {@link integer}) set it; {@link float}, {@link double}, and {@link decimal} leave it unset.
	 *
	 * **Inheritance** — a child may add the constraint but not drop it: overriding an integral parent with a
	 * non-integral child is rejected.
	 *
	 * @defaultValue `undefined` (fractional values allowed)
	 */
	readonly integral?: boolean;

}

/**
 * Constraints for numeric shape factories.
 *
 * @see {@link https://www.w3.org/TR/shacl/#core-components-range SHACL § 4.4 Value Range Constraint Components}
 */
export interface NumericConstraints {

	/**
	 * Exclusive minimum value (value must be strictly greater).
	 *
	 * **Inheritance** — child value must be ≥ parent value, narrowing the exclusive lower bound.
	 *
	 * @defaultValue `undefined` (no minimum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinExclusiveConstraintComponent SHACL § 4.4.1 sh:minExclusive}
	 */
	readonly minExclusive?: number;

	/**
	 * Exclusive maximum value (value must be strictly less).
	 *
	 * **Inheritance** — child value must be ≤ parent value, narrowing the exclusive upper bound.
	 *
	 * @defaultValue `undefined` (no maximum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxExclusiveConstraintComponent SHACL § 4.4.2 sh:maxExclusive}
	 */
	readonly maxExclusive?: number;

	/**
	 * Inclusive minimum value (value must be greater than or equal).
	 *
	 * **Inheritance** — child value must be ≥ parent value, narrowing the inclusive lower bound.
	 *
	 * @defaultValue `undefined` (no minimum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinInclusiveConstraintComponent SHACL § 4.4.3 sh:minInclusive}
	 */
	readonly minInclusive?: number;

	/**
	 * Inclusive maximum value (value must be less than or equal).
	 *
	 * **Inheritance** — child value must be ≤ parent value, narrowing the inclusive upper bound.
	 *
	 * @defaultValue `undefined` (no maximum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxInclusiveConstraintComponent SHACL § 4.4.4 sh:maxInclusive}
	 */
	readonly maxInclusive?: number;


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
	readonly in?: readonly number[];

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
	readonly hasValue?: readonly number[];

}


//// Factories /////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a numeric shape with a typed model value and no other constraints.
 *
 * @typeParam M The literal number type for the model
 *
 * @param model Prototype value for runtime model assembly
 *
 * @returns An immutable shape with `model` typed as `M`
 *
 * @example
 *
 * ```typescript
 * const count = number(42 as const);
 * ```
 */
export function number<M extends number>(model: M): NumberShape & { readonly model: M };

/**
 * Creates a numeric shape with optional validation constraints.
 *
 * @param constraints Optional shape {@link NumberConstraints constraints}
 *
 * @returns An immutable shape with `model` typed as `number`
 *
 * @throws {TraceError} If `constraints` contains contradictory values
 *
 * @example
 *
 * ```typescript
 * const value = number();
 * const score = number({ minInclusive: 0, maxInclusive: 100 });
 * ```
 */
export function number<const C extends NumberConstraints>(constraints?: C): NumberShape;

/**
 * Creates a numeric shape.
 */
export function number(constraints: number | NumberConstraints = {}): NumberShape {

	const effective = isNumber(constraints) ? { model: constraints } : constraints;

	const shape: NumberShape = immutable({

		kind: "number",

		...effective,

		model: effective.model ?? 0

	});

	const trace = checkNumber(shape);

	if ( trace !== undefined ) {
		throw new TraceError("inconsistent number shape constraints", trace);
	}

	return shape;

}


//// Shorthands ////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a shape for 8-bit signed integer values.
 *
 * - Defaults the datatype to `xsd:byte`.
 * - Marks the shape {@link NumberConstraints.integral | integral}.
 * - Defaults the range to `[-128, 127]`; supplied bounds in `constraints` override the defaults.
 *
 * @param constraints Optional {@link NumericConstraints validation constraints}
 *
 * @returns An immutable shape for validating 8-bit signed integers
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#byte XSD 1.0 Part 2: Datatypes § 3.3.19 byte}
 */
export function byte(constraints: NumericConstraints = {}): NumberShape {

	return number({

		datatype: xsd.byte,
		integral: true,

		minInclusive: -BYTE_MAX-1,
		maxInclusive: BYTE_MAX,

		...constraints

	});

}

/**
 * Creates a shape for 16-bit signed integer values.
 *
 * - Defaults the datatype to `xsd:short`.
 * - Marks the shape {@link NumberConstraints.integral | integral}.
 * - Defaults the range to `[-32768, 32767]`; supplied bounds in `constraints` override the defaults.
 *
 * @param constraints Optional {@link NumericConstraints validation constraints}
 *
 * @returns An immutable shape for validating 16-bit signed integers
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#short XSD 1.0 Part 2: Datatypes § 3.3.18 short}
 */
export function short(constraints: NumericConstraints = {}): NumberShape {

	return number({

		datatype: xsd.short,
		integral: true,

		minInclusive: -SHORT_MAX-1,
		maxInclusive: SHORT_MAX,

		...constraints

	});

}

/**
 * Creates a shape for 32-bit signed integer values.
 *
 * - Defaults the datatype to `xsd:int`.
 * - Marks the shape {@link NumberConstraints.integral | integral}.
 * - Defaults the range to `[-2147483648, 2147483647]`; supplied bounds in `constraints` override the defaults.
 *
 * @param constraints Optional {@link NumericConstraints validation constraints}
 *
 * @returns An immutable shape for validating 32-bit signed integers
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#int XSD 1.0 Part 2: Datatypes § 3.3.17 int}
 */
export function int(constraints: NumericConstraints = {}): NumberShape {

	return number({

		datatype: xsd.int,
		integral: true,

		minInclusive: -INT_MAX-1,
		maxInclusive: INT_MAX,

		...constraints

	});

}

/**
 * Creates a shape for 64-bit signed integer values.
 *
 * - Defaults the datatype to `xsd:long`.
 * - Defaults the range to {@link Number.MIN_SAFE_INTEGER}…{@link Number.MAX_SAFE_INTEGER} (±2⁵³−1), narrower than the
 *   datatype's nominal ±2⁶³−1, since values beyond JavaScript's safe-integer range cannot be represented faithfully as
 *   `number`. Supplied bounds in `constraints` override the defaults.
 * - Marks the shape {@link NumberConstraints.integral | integral}.
 *
 * @param constraints Optional {@link NumericConstraints validation constraints}
 *
 * @returns An immutable shape for validating 64-bit signed integers
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#long XSD 1.0 Part 2: Datatypes § 3.3.16 long}
 */
export function long(constraints: NumericConstraints = {}): NumberShape {

	return number({

		datatype: xsd.long,
		integral: true,

		minInclusive: Number.MIN_SAFE_INTEGER,
		maxInclusive: Number.MAX_SAFE_INTEGER,

		...constraints

	});

}

/**
 * Creates a shape for IEEE 754 single-precision floating-point values.
 *
 * - Defaults the datatype to `xsd:float`.
 * - Defaults the range to the finite single-precision interval `±(2 − 2⁻²³) × 2¹²⁷`; supplied bounds in `constraints`
 *   override the defaults.
 *
 * @param constraints Optional {@link NumericConstraints validation constraints}
 *
 * @returns An immutable shape for validating single-precision floats
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#float XSD 1.0 Part 2: Datatypes § 3.2.4 float}
 */
export function float(constraints: NumericConstraints = {}): NumberShape {

	return number({

		datatype: xsd.float,

		minInclusive: -FLOAT_MAX,
		maxInclusive: FLOAT_MAX,

		...constraints

	});

}

/**
 * Creates a shape for IEEE 754 double-precision floating-point values.
 *
 * Defaults the datatype to `xsd:double`.
 *
 * @param constraints Optional {@link NumericConstraints validation constraints}
 *
 * @returns An immutable shape for validating double-precision floats
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#double XSD 1.0 Part 2: Datatypes § 3.2.5 double}
 */
export function double(constraints: NumericConstraints = {}): NumberShape {

	return number({ datatype: xsd.double, ...constraints });

}

/**
 * Creates a shape for arbitrary-precision integer values.
 *
 * Defaults the datatype to `xsd:integer` and marks the shape {@link NumberConstraints.integral | integral}.
 *
 * @param constraints Optional {@link NumericConstraints validation constraints}
 *
 * @returns An immutable shape for validating arbitrary-precision integers
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#integer XSD 1.0 Part 2: Datatypes § 3.3.13 integer}
 */
export function integer(constraints: NumericConstraints = {}): NumberShape {

	return number({ datatype: xsd.integer, integral: true, ...constraints });

}

/**
 * Creates a shape for arbitrary-precision decimal values.
 *
 * Defaults the datatype to `xsd:decimal`.
 *
 * @param constraints Optional {@link NumericConstraints validation constraints}
 *
 * @returns An immutable shape for validating arbitrary-precision decimals
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#decimal XSD 1.0 Part 2: Datatypes § 3.2.3 decimal}
 */
export function decimal(constraints: NumericConstraints = {}): NumberShape {

	return number({ datatype: xsd.decimal, ...constraints });

}
