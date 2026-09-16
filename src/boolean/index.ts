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
 * Boolean shape types and operations.
 *
 * Defines the shape describing the truth values a resource may carry and provides the {@link boolean} factory stating
 * it, mapping the [JSON boolean](https://datatracker.ietf.org/doc/html/rfc8259#section-3) type to the
 * [XSD 1.0](https://www.w3.org/TR/xmlschema-2/#built-in-datatypes) boolean datatype. The kind closes the domain to two
 * values; an enumeration closes it further to one, so that a member may stand as the tag telling the alternatives of a
 * union apart.
 *
 * | XSD Datatype ¹ | Factory         | Description         | Range         |
 * | -------------- | --------------- | ------------------- | ------------- |
 * | [boolean][]    | {@link boolean} | binary-valued logic | {true, false} |
 *
 * [boolean]: https://www.w3.org/TR/xmlschema-2/#boolean
 *
 * ¹ XSD 1.0 datatypes are referenced by [RDF 1.1](https://www.w3.org/TR/rdf11-concepts/) and
 * [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/) as normative
 *
 * **Compatibility**
 *
 * | JSON            | XSD                            | JavaScript      |
 * | --------------- | ------------------------------ | --------------- |
 * | `true`, `false` | {true, false, 1, 0} ¹          | `true`, `false` |
 *
 * ¹ Canonical form: `true`, `false`
 *
 * **Defining boolean shapes**
 *
 * ```typescript
 * import { boolean } from '@metreeca/blue/boolean';
 *
 * const flag = boolean();                 // either truth value
 * const settled = boolean({ in: true });  // the single admitted value
 * const paid = boolean(true);             // the same, stated as a bare value
 * ```
 *
 * > [!NOTE]
 * > An enumeration also narrows the value the shape describes: `settled` admits `true`, not both truth values. The
 * > domain holds two values, so the constraint states the single admitted one: a list would degenerate, admitting
 * > either the whole domain or nothing at all.
 *
 * **Using in resource shapes**
 *
 * ```typescript
 * import { optional, required, resource } from '@metreeca/blue/resource';
 * import { boolean } from '@metreeca/blue/boolean';
 *
 * const Product = resource({
 *   available: required(boolean()),
 *   featured: optional(boolean())
 * });
 * ```
 *
 * **Tagging the alternatives of a union**
 *
 * ```typescript
 * import { boolean } from '@metreeca/blue/boolean';
 * import { date } from '@metreeca/blue/string';
 * import { required, resource } from '@metreeca/blue/resource';
 * import { union } from '@metreeca/blue/union';
 *
 * const Payment = union(
 *   resource({ settled: required(boolean(false)), due: required(date()) }),
 *   resource({ settled: required(boolean(true)), paid: required(date()) })
 * );
 * ```
 *
 * A stored value states one truth value, singling out the alternative it belongs to, and the type of the value the
 * union describes is narrowed by the tag exactly as the shape is.
 *
 * @module
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc8259#section-3 RFC 8259 § 3 Values}
 * @see {@link https://www.w3.org/TR/xmlschema-2/#boolean XSD 1.0 Part 2: Datatypes § 3.2.2 boolean}
 */

import { isBoolean } from "@metreeca/core";
import type { Legal } from "../value/inference.js";
import { assemble } from "./assembler.js";


/**
 * Describes a truth value.
 *
 * Admits the [JSON booleans](https://datatracker.ietf.org/doc/html/rfc8259#section-3) a resource may carry, closed to
 * a single one where the shape enumerates it and typed as an
 * [XSD 1.0](https://www.w3.org/TR/xmlschema-2/#built-in-datatypes) boolean, so that a validated value carries the
 * datatype the shape states rather than the one JSON leaves unsaid.
 *
 * **Inheritance**
 *
 * Where a {@link resource!ResourceShape} extends the shapes it lists as `parents`, boolean-valued members are merged
 * according to the following rules. The *child* is the extending shape; the *parent* is the inherited one.
 *
 * | Field  | Override Rule                                                                       |
 * | ------ | ----------------------------------------------------------------------------------- |
 * | `kind` | Cannot be overridden                                                                |
 * | `in`   | Must be strictly equal when both defined; the single defined value carries through  |
 *
 * A child restating the value its parent admits narrows nothing and is accepted all the same; a child admitting the
 * other value would leave the member admitting nothing and is rejected.
 *
 * @typeParam V The values the shape admits, narrowed to the enumerated one where it states an
 *     {@link BooleanConstraints.in | enumeration} and both truth values otherwise
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#boolean XSD 1.0 Part 2: Datatypes § 3.2.2 boolean}
 */
export type BooleanShape<V extends boolean = boolean> = BooleanConstraints<V> & {

	/**
	 * Discriminator identifying this as a boolean shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "boolean"

}

/**
 * Constraints accepted by the {@link boolean} shape factory.
 *
 * @typeParam V The value the enumeration admits
 */
export type BooleanConstraints<V extends boolean = boolean> = {

	/**
	 * Allowed value (closed enumeration).
	 *
	 * When specified, values must be equal to it. The domain holds two values, so the constraint states the single
	 * admitted one rather than a list, which would either readmit the whole domain or close it to nothing; the
	 * {@link boolean} factory takes it as a bare value too. Closing the domain also narrows the value the shape
	 * describes to the stated one, wherever it is stated precisely enough to be told apart; a value only known to be a
	 * boolean leaves the shape admitting both.
	 *
	 * **Inheritance** — must be strictly equal when both parent and child define it; otherwise the single defined value
	 * carries through. A mismatch is reported as an error.
	 *
	 * @defaultValue `undefined` (both truth values admitted)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#InConstraintComponent SHACL § 4.8.3 sh:in}
	 */
	readonly in?: V;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a boolean shape.
 *
 * Admits `true` and `false` and nothing else, closed to the single enumerated value where the constraints state one;
 * the domain is closed by the kind alone, so the constraints cannot be contradictory.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional shape {@link BooleanConstraints constraints}
 *
 * @returns An immutable shape admitting truth values, narrowed to the value the constraints enumerate
 */
export function boolean<const C extends BooleanConstraints = {}>(constraints?: C): BooleanShape<Legal<C, boolean>>;

/**
 * Creates a boolean shape admitting a single value.
 *
 * Reads a bare truth value as the enumeration closing the domain to it, so that a tag telling the alternatives of a
 * union apart is stated as `boolean(true)` rather than as `boolean({ in: true })`.
 *
 * @typeParam V The value the shape admits
 *
 * @param value The single admitted truth value
 *
 * @returns An immutable shape admitting `value` alone
 */
export function boolean<const V extends boolean>(value: V): BooleanShape<V>;

/**
 * Creates a boolean shape.
 */
export function boolean(constraints?: boolean | BooleanConstraints): BooleanShape {

	return assemble<boolean>(isBoolean(constraints) ? { in: constraints } : { ...constraints });

}
