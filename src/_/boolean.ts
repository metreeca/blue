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
 * Boolean shape and factories.
 *
 * Defines shapes and factories for validating boolean values, mapping the
 * [JSON boolean](https://datatracker.ietf.org/doc/html/rfc8259#section-3) type to the
 * [XSD 1.0](https://www.w3.org/TR/xmlschema-2/#built-in-datatypes) boolean datatype.
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
 * **Defining Boolean Shapes**
 *
 * ```typescript
 * import { boolean } from '@metreeca/blue/boolean';
 *
 * const flag = boolean();
 * ```
 *
 * **Using in Resource Shapes**
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
 * @module
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc8259#section-3 RFC 8259 § 3 Values}
 * @see {@link https://www.w3.org/TR/xmlschema-2/#boolean XSD 1.0 Part 2: Datatypes § 3.2.2 boolean}
 */

import { create } from "./boolean.core.js";


/**
 * Describes a truth value.
 *
 * Admits the [JSON booleans](https://datatracker.ietf.org/doc/html/rfc8259#section-3) a resource may carry, typed as
 * an [XSD 1.0](https://www.w3.org/TR/xmlschema-2/#built-in-datatypes) boolean, so that a validated value carries the
 * datatype the shape states rather than the one JSON leaves unsaid.
 *
 * **Inheritance**
 *
 * Where a {@link resource!ResourceShape} extends the shapes it lists as {@link resource!ResourceShape.parents |
 * parents}, boolean-valued members are merged according to the following rules. The *child* is the extending shape;
 * the *parent* is the inherited one.
 *
 * | Field  | Override Rule        |
 * | ------ | -------------------- |
 * | `kind` | Cannot be overridden |
 *
 * The shape closes the domain to two values and states nothing else about them, so an override has nothing to narrow
 * and inheritance never fails.
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#boolean XSD 1.0 Part 2: Datatypes § 3.2.2 boolean}
 */
export type BooleanShape = {

	readonly kind: "boolean"

}


//// Factories ///////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a boolean shape.
 *
 * Admits `true` and `false` and nothing else; the domain is closed by the kind alone, so the shape takes no
 * constraints and cannot be contradictory.
 *
 * @returns An immutable shape admitting truth values
 */
export function boolean(): BooleanShape {

	return create();

}
