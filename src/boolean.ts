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
 * Boolean shape model and factories.
 *
 * Defines shapes and factories for validating boolean values, mapping the
 * [JSON boolean](https://datatracker.ietf.org/doc/html/rfc8259#section-3) type to the
 * [XSD 1.0](https://www.w3.org/TR/xmlschema-2/#built-in-datatypes) boolean datatype.
 *
 * | XSD Datatype ¹ | Factory         | Description         | Range         |
 * | -------------- | --------------- | ------------------- | ------------- |
 * | [boolean][]    | {@link boolean} | binary-valued logic | {true, false} |
 *
 * [boolean]: https://www.w3.org/TR/xmlschema-2/#boolean
 *
 * ¹ XSD 1.0 datatypes are referenced by [RDF 1.1](https://www.w3.org/TR/rdf11-concepts/) and
 * [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/) as normative *
 * **Compatibility**
 *
 * | JSON            | XSD                            | JavaScript      |
 * | --------------- | ------------------------------ | --------------- |
 * | `true`, `false` | {true, false, 1, 0} ¹          | `true`, `false` |
 *
 * ¹ Canonical form: `true`, `false`
 *
 * **Defining Boolean Shapes**
 *
 * ```typescript
 * import { boolean } from '@metreeca/blue';
 *
 * const flag = boolean();                  // default model: false
 * const enabled = boolean({ model: true }); // custom model value
 * ```
 *
 * **Using in Resource Shapes**
 *
 * ```typescript
 * import { resource, required, optional, boolean } from '@metreeca/blue';
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

import { isBoolean } from "@metreeca/core";
import { immutable } from "@metreeca/core/nested";


/**
 * Shape definition for boolean values.
 *
 * Validates boolean literals. Boolean shapes accept only `true` or `false` values
 * and do not support additional constraints.
 *
 * **Inheritance**
 *
 * When a {@link ResourceShape} extends a parent via {@link ResourceConstraints.extends | extends}, boolean-valued
 * properties are merged according to the following rules. The *child* is the extending shape; the *parent* is the
 * inherited shape.
 *
 * | Field   | Override Rule                                                    |
 * | ------- | --------------------------------------------------------------- |
 * | `kind`  | Cannot be overridden                                            |
 * | `model` | Must be strictly equal — mismatch signals incompatible shapes   |
 *
 * No user-facing constraints — nothing to narrow or validate beyond `kind` and `model` match.
 *
 * @see {@link https://www.w3.org/TR/xmlschema-2/#boolean XSD 1.0 Part 2: Datatypes § 3.2.2 boolean}
 */
export interface BooleanShape {

	/**
	 * Discriminator identifying this as a boolean shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "boolean";

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * **Inheritance** — must be strictly equal between parent and child.
	 *
	 * @defaultValue `false`
	 */
	readonly model: boolean;

}

/**
 * Constraints for the {@link boolean} shape factory.
 */
export interface BooleanConstraints {

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * @defaultValue `false`
	 */
	readonly model?: boolean;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a boolean shape with a typed model value and no other constraints.
 *
 *
 * @typeParam M The literal boolean type for the model
 *
 * @param model Prototype value for runtime model assembly
 *
 * @returns An immutable shape with `model` typed as `M`
 *
 * @example
 *
 * ```typescript
 * const enabled = boolean(true as const);
 * ```
 */
export function boolean<M extends boolean>(model: M): BooleanShape & { readonly model: M };

/**
 * Creates a boolean shape with optional model constraint.
 *
 *
 * @param constraints Optional shape constraints
 *
 * @returns An immutable shape with `model` typed as `boolean`
 *
 * @throws {TypeError} If `constraints` is not a valid {@link BooleanConstraints}
 *
 * @example
 *
 * ```typescript
 * const flag = boolean();
 * const enabled = boolean({ model: true });
 * ```
 */
export function boolean(constraints?: BooleanConstraints): BooleanShape;

/**
 * Creates a boolean shape.
 *
 */
export function boolean(constraints: boolean | BooleanConstraints = {}): BooleanShape {

	const { model, ...rest } = isBoolean(constraints) ? { model: constraints } : constraints;

	return immutable({

		kind: "boolean",
		model: model ?? false,

		...rest

	});

}
