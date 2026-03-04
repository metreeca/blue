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
 * Numeric shape model and factories.
 *
 * Defines shapes and factories for validating numeric values, mapping the
 * [JSON number](https://datatracker.ietf.org/doc/html/rfc8259#section-6) type to
 * [XSD 1.0](https://www.w3.org/TR/xmlschema-2/#built-in-datatypes) numeric datatypes.
 *
 * > [!WARNING]
 * > Factories check structural integrity of constraints but not their logical consistency:
 * > contradictory constraints like `minInclusive > maxInclusive` won't be rejected.
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
 * import { number, integer, decimal } from '@metreeca/blue';
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
 * import { byte, short, int, long, float, double } from '@metreeca/blue';
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
 * import { resource, required, optional, integer, decimal } from '@metreeca/blue';
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
import { immutable } from "@metreeca/core/nested";


/**
 * Shape definition for numeric values.
 *
 * Validates numeric values with range and value constraints. Supports XSD 1.0 numeric
 * datatypes including integers, decimals, and floating-point values.
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#built-in-datatypes XSD 1.0 Part 2: Datatypes § 3 Built-in Datatypes}
 */
export interface NumberShape extends NumberConstraints {

	/**
	 * Discriminator identifying this as a numeric shape.
	 */
	readonly kind: "number";

	/**
	 * Prototype value for runtime model assembly.
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
	 * Prototype value for runtime model assembly.
	 *
	 * @defaultValue `0`
	 */
	readonly model?: number;

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
	 * @defaultValue `undefined` (no minimum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinExclusiveConstraintComponent SHACL § 4.4.1 sh:minExclusive}
	 */
	readonly minExclusive?: number;

	/**
	 * Exclusive maximum value (value must be strictly less).
	 *
	 * @defaultValue `undefined` (no maximum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxExclusiveConstraintComponent SHACL § 4.4.2 sh:maxExclusive}
	 */
	readonly maxExclusive?: number;

	/**
	 * Inclusive minimum value (value must be greater than or equal).
	 *
	 * @defaultValue `undefined` (no minimum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinInclusiveConstraintComponent SHACL § 4.4.3 sh:minInclusive}
	 */
	readonly minInclusive?: number;

	/**
	 * Inclusive maximum value (value must be less than or equal).
	 *
	 * @defaultValue `undefined` (no maximum constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxInclusiveConstraintComponent SHACL § 4.4.4 sh:maxInclusive}
	 */
	readonly maxInclusive?: number;


	/**
	 * Allowed values (closed enumeration).
	 *
	 * When specified, values must be members of this list.
	 *
	 * @defaultValue `undefined` (no enumeration constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#InConstraintComponent SHACL § 4.5.1 sh:in}
	 */
	readonly in?: readonly number[];

	/**
	 * Required values that must be present.
	 *
	 * When specified, all listed values must appear in the resource.
	 *
	 * @defaultValue `undefined` (no required values)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#HasValueConstraintComponent SHACL § 4.5.2 sh:hasValue}
	 */
	readonly hasValue?: readonly number[];

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a numeric shape with a typed model value and no other constraints.
 *
 * @group Factories
 *
 * @typeParam M The literal number type for the model
 *
 * @param model Prototype value for runtime model assembly
 *
 * @returns A shape with `model` typed as `M`
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
 * @group Factories
 *
 * @param constraints Optional shape {@link NumberConstraints constraints}
 *
 * @returns A shape with `model` typed as `number`
 *
 * @throws {TypeError} If `constraints` is not a valid {@link NumberConstraints}
 *
 * @example
 *
 * ```typescript
 * const value = number();
 * const score = number({ minInclusive: 0, maxInclusive: 100 });
 * ```
 */
export function number(constraints?: NumberConstraints): NumberShape;

/**
 * Creates a numeric shape.
 *
 * @group Factories
 */
export function number(constraints: number | NumberConstraints = {}): NumberShape {

	const { model, ...rest } = isNumber(constraints) ? { model: constraints } : constraints;

	return immutable({

		kind: "number",
		model: model ?? 0,

		...rest

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a shape for 8-bit signed integer values.
 *
 * @group Factories
 *
 * @param constraints Optional {@link NumericConstraints} validation constraints
 *
 * @returns A shape for validating 8-bit signed integers
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#byte XSD 1.0 Part 2: Datatypes § 3.3.19 byte}
 */
export function byte(constraints: NumericConstraints = {}): NumberShape {

	return number({ model: 8, ...constraints });

}

/**
 * Creates a shape for 16-bit signed integer values.
 *
 * @group Factories
 *
 * @param constraints Optional {@link NumericConstraints} validation constraints
 *
 * @returns A shape for validating 16-bit signed integers
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#short XSD 1.0 Part 2: Datatypes § 3.3.18 short}
 */
export function short(constraints: NumericConstraints = {}): NumberShape {

	return number({ model: 16, ...constraints });

}

/**
 * Creates a shape for 32-bit signed integer values.
 *
 * @group Factories
 *
 * @param constraints Optional {@link NumericConstraints} validation constraints
 *
 * @returns A shape for validating 32-bit signed integers
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#int XSD 1.0 Part 2: Datatypes § 3.3.17 int}
 */
export function int(constraints: NumericConstraints = {}): NumberShape {

	return number({ model: 32, ...constraints });

}

/**
 * Creates a shape for 64-bit signed integer values.
 *
 * @group Factories
 *
 * @param constraints Optional {@link NumericConstraints} validation constraints
 *
 * @returns A shape for validating 64-bit signed integers
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#long XSD 1.0 Part 2: Datatypes § 3.3.16 long}
 */
export function long(constraints: NumericConstraints = {}): NumberShape {

	return number({ model: 64, ...constraints });

}

/**
 * Creates a shape for IEEE 754 single-precision floating-point values.
 *
 * @group Factories
 *
 * @param constraints Optional {@link NumericConstraints} validation constraints
 *
 * @returns A shape for validating single-precision floats
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#float XSD 1.0 Part 2: Datatypes § 3.2.4 float}
 */
export function float(constraints: NumericConstraints = {}): NumberShape {

	return number({ model: 0.32, ...constraints });

}

/**
 * Creates a shape for IEEE 754 double-precision floating-point values.
 *
 * @group Factories
 *
 * @param constraints Optional {@link NumericConstraints} validation constraints
 *
 * @returns A shape for validating double-precision floats
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#double XSD 1.0 Part 2: Datatypes § 3.2.5 double}
 */
export function double(constraints: NumericConstraints = {}): NumberShape {

	return number({ model: 0.64, ...constraints });

}

/**
 * Creates a shape for arbitrary-precision integer values.
 *
 * @group Factories
 *
 * @param constraints Optional {@link NumericConstraints} validation constraints
 *
 * @returns A shape for validating arbitrary-precision integers
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#integer XSD 1.0 Part 2: Datatypes § 3.3.13 integer}
 */
export function integer(constraints: NumericConstraints = {}): NumberShape {

	return number({ model: 1, ...constraints });

}

/**
 * Creates a shape for arbitrary-precision decimal values.
 *
 * @group Factories
 *
 * @param constraints Optional {@link NumericConstraints} validation constraints
 *
 * @returns A shape for validating arbitrary-precision decimals
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#decimal XSD 1.0 Part 2: Datatypes § 3.2.3 decimal}
 */
export function decimal(constraints: NumericConstraints = {}): NumberShape {

	return number({ model: 1.1, ...constraints });

}
