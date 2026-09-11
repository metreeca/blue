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

import type { Reference } from "@metreeca/qest/resource";
import type { Legal } from "./index.core.js";


/**
 * Describes a numeric value.
 *
 * Admits the [JSON numbers](https://datatracker.ietf.org/doc/html/rfc8259#section-6) a resource may carry, bounded by
 * range and enumeration constraints and typed as an [XSD 1.0](https://www.w3.org/TR/xmlschema-2/#built-in-datatypes)
 * numeric datatype, so that a validated value carries the datatype the shape states rather than the one JSON leaves
 * unsaid.
 *
 * **Inheritance**
 *
 * Where a {@link resource!ResourceShape} extends the shapes it lists as {@link resource!ResourceShape.parents |
 * parents}, numeric-valued members are merged according to the following rules. The *child* is the extending shape;
 * the *parent* is the inherited one.
 *
 * | Field          | Override Rule                                                                               |
 * | -------------- | ------------------------------------------------------------------------------------------- |
 * | `kind`         | Cannot be overridden                                                                        |
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
 * @typeParam V The values the shape admits, narrowed to the enumerated ones where it states an
 *     {@link NumberRangeConstraints.in | enumeration} and the whole numeric domain otherwise
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#built-in-datatypes XSD 1.0 Part 2: Datatypes § 3 Built-in Datatypes}
 */
export type NumberShape<V extends number = number> = NumberConstraints<V> & {

	readonly kind: "number"

}

/**
 * Constraints accepted by the {@link number} shape factory.
 *
 * Adds the RDF datatype and the integrality flag, which only the general-purpose factory accepts, to the
 * {@link NumberRangeConstraints range} constraints shared with the specialised factories.
 *
 * @typeParam V The values the enumeration admits
 */
export type NumberConstraints<V extends number = number> = NumberRangeConstraints<V> & {

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
	 * @see {@link https://www.w3.org/TR/shacl/#DatatypeConstraintComponent SHACL § 4.1.2 sh:datatype}
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
 * Value range bounds accepted by the numeric shape factories.
 *
 * Bounds the magnitudes admitted by a shape, independently of its datatype. Accepted on its own by the specialised
 * factories, whose datatype and integrality are already fixed, and included in the full {@link NumberConstraints} set.
 *
 * @typeParam V The values the enumeration admits
 *
 * @see {@link https://www.w3.org/TR/shacl/#core-components-range SHACL § 4.3 Value Range Constraint Components}
 */
export type NumberRangeConstraints<V extends number = number> = {

	/**
	 * Exclusive minimum value (value must be strictly greater).
	 *
	 * **Inheritance** — child value must be ≥ parent value, narrowing the exclusive lower bound.
	 *
	 * @defaultValue `undefined` (no minimum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinExclusiveConstraintComponent SHACL § 4.3.1 sh:minExclusive}
	 */
	readonly minExclusive?: number;

	/**
	 * Exclusive maximum value (value must be strictly less).
	 *
	 * **Inheritance** — child value must be ≤ parent value, narrowing the exclusive upper bound.
	 *
	 * @defaultValue `undefined` (no maximum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxExclusiveConstraintComponent SHACL § 4.3.3 sh:maxExclusive}
	 */
	readonly maxExclusive?: number;

	/**
	 * Inclusive minimum value (value must be greater than or equal).
	 *
	 * **Inheritance** — child value must be ≥ parent value, narrowing the inclusive lower bound.
	 *
	 * @defaultValue `undefined` (no minimum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinInclusiveConstraintComponent SHACL § 4.3.2 sh:minInclusive}
	 */
	readonly minInclusive?: number;

	/**
	 * Inclusive maximum value (value must be less than or equal).
	 *
	 * **Inheritance** — child value must be ≤ parent value, narrowing the inclusive upper bound.
	 *
	 * @defaultValue `undefined` (no maximum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxInclusiveConstraintComponent SHACL § 4.3.4 sh:maxInclusive}
	 */
	readonly maxInclusive?: number;


	/**
	 * Allowed values (closed enumeration).
	 *
	 * When specified, values must be members of this list. Empty arrays are ignored. Closing the domain also narrows
	 * the state the shape describes to the listed values, wherever they are stated precisely enough to be told apart;
	 * a list whose values are only known to be numbers leaves the state as the whole numeric domain.
	 *
	 * **Inheritance** — intersection of parent and child sets; empty result is reported as an error.
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
	 * **Inheritance** — union of parent and child required values; child must require all parent values.
	 *
	 * @defaultValue `undefined` (no required values)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#HasValueConstraintComponent SHACL § 4.8.2 sh:hasValue}
	 */
	readonly hasValue?: readonly V[];

}


//// Factories ///////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a numeric shape.
 *
 * Contradictory constraints are rejected as the shape is built, so a shape that exists admits at least one value.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional shape {@link NumberConstraints constraints}
 *
 * @returns An immutable shape admitting the numbers the constraints bound, narrowed to the values they enumerate
 */
export function number<const C extends NumberConstraints = {}>(constraints?: C): NumberShape<Legal<C, number>> {
	throw new Error(";( to be implemented");
}


//// Shorthands //////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a shape for 8-bit signed integer values.
 *
 * Fixes the datatype to `xsd:byte`, marks the shape {@link NumberConstraints.integral | integral} and defaults the
 * range to `[-128, 127]`; supplied bounds override the defaults.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link NumberRangeConstraints range constraints}
 *
 * @returns An immutable shape admitting 8-bit signed integers, narrowed to the values the constraints enumerate
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#byte XSD 1.0 Part 2: Datatypes § 3.3.19 byte}
 */
export function byte<const C extends NumberRangeConstraints = {}>(constraints?: C): NumberShape<Legal<C, number>> {
	throw new Error(";( to be implemented");
}

/**
 * Creates a shape for 16-bit signed integer values.
 *
 * Fixes the datatype to `xsd:short`, marks the shape {@link NumberConstraints.integral | integral} and defaults the
 * range to `[-32768, 32767]`; supplied bounds override the defaults.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link NumberRangeConstraints range constraints}
 *
 * @returns An immutable shape admitting 16-bit signed integers, narrowed to the values the constraints enumerate
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#short XSD 1.0 Part 2: Datatypes § 3.3.18 short}
 */
export function short<const C extends NumberRangeConstraints = {}>(constraints?: C): NumberShape<Legal<C, number>> {
	throw new Error(";( to be implemented");
}

/**
 * Creates a shape for 32-bit signed integer values.
 *
 * Fixes the datatype to `xsd:int`, marks the shape {@link NumberConstraints.integral | integral} and defaults the
 * range to `[-2147483648, 2147483647]`; supplied bounds override the defaults.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link NumberRangeConstraints range constraints}
 *
 * @returns An immutable shape admitting 32-bit signed integers, narrowed to the values the constraints enumerate
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#int XSD 1.0 Part 2: Datatypes § 3.3.17 int}
 */
export function int<const C extends NumberRangeConstraints = {}>(constraints?: C): NumberShape<Legal<C, number>> {
	throw new Error(";( to be implemented");
}

/**
 * Creates a shape for 64-bit signed integer values.
 *
 * Fixes the datatype to `xsd:long`, marks the shape {@link NumberConstraints.integral | integral} and defaults the
 * range to {@link Number.MIN_SAFE_INTEGER}…{@link Number.MAX_SAFE_INTEGER} (±2⁵³−1), narrower than the datatype's
 * nominal ±2⁶³−1, since values beyond the safe-integer range cannot be represented faithfully as `number`; supplied
 * bounds override the defaults.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link NumberRangeConstraints range constraints}
 *
 * @returns An immutable shape admitting 64-bit signed integers, narrowed to the values the constraints enumerate
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#long XSD 1.0 Part 2: Datatypes § 3.3.16 long}
 */
export function long<const C extends NumberRangeConstraints = {}>(constraints?: C): NumberShape<Legal<C, number>> {
	throw new Error(";( to be implemented");
}

/**
 * Creates a shape for IEEE 754 single-precision floating-point values.
 *
 * Fixes the datatype to `xsd:float` and defaults the range to the finite single-precision interval
 * `±(2 − 2⁻²³) × 2¹²⁷`; supplied bounds override the defaults.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link NumberRangeConstraints range constraints}
 *
 * @returns An immutable shape admitting single-precision floats, narrowed to the values the constraints enumerate
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#float XSD 1.0 Part 2: Datatypes § 3.2.4 float}
 */
export function float<const C extends NumberRangeConstraints = {}>(constraints?: C): NumberShape<Legal<C, number>> {
	throw new Error(";( to be implemented");
}

/**
 * Creates a shape for IEEE 754 double-precision floating-point values.
 *
 * Fixes the datatype to `xsd:double`.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link NumberRangeConstraints range constraints}
 *
 * @returns An immutable shape admitting double-precision floats, narrowed to the values the constraints enumerate
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#double XSD 1.0 Part 2: Datatypes § 3.2.5 double}
 */
export function double<const C extends NumberRangeConstraints = {}>(constraints?: C): NumberShape<Legal<C, number>> {
	throw new Error(";( to be implemented");
}

/**
 * Creates a shape for arbitrary-precision integer values.
 *
 * Fixes the datatype to `xsd:integer` and marks the shape {@link NumberConstraints.integral | integral}.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link NumberRangeConstraints range constraints}
 *
 * @returns An immutable shape admitting arbitrary-precision integers, narrowed to the values the constraints enumerate
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#integer XSD 1.0 Part 2: Datatypes § 3.3.13 integer}
 */
export function integer<const C extends NumberRangeConstraints = {}>(constraints?: C): NumberShape<Legal<C, number>> {
	throw new Error(";( to be implemented");
}

/**
 * Creates a shape for arbitrary-precision decimal values.
 *
 * Fixes the datatype to `xsd:decimal`.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional {@link NumberRangeConstraints range constraints}
 *
 * @returns An immutable shape admitting arbitrary-precision decimals, narrowed to the values the constraints enumerate
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#decimal XSD 1.0 Part 2: Datatypes § 3.2.3 decimal}
 */
export function decimal<const C extends NumberRangeConstraints = {}>(constraints?: C): NumberShape<Legal<C, number>> {
	throw new Error(";( to be implemented");
}
