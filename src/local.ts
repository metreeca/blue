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
 * Language-tagged shape model and factories.
 *
 * Defines shapes and factories for validating language-tagged string values, mapping
 * [JSON-LD language maps](https://www.w3.org/TR/json-ld11/#language-maps) to
 * [RDF 1.1](https://www.w3.org/TR/rdf11-concepts/#dfn-language-tagged-string) language-tagged strings.
 *
 * | Factory           | Description                               |
 * | ----------------- | ----------------------------------------- |
 * | {@link local}     | Single value per language tag             |
 * | {@link locals}    | Multiple values per language tag          |
 *
 * **Defining Language-Tagged Shapes**
 *
 * Single-valued maps hold one string per language tag; multi-valued maps hold arrays.
 * Plain strings and string arrays are accepted as shorthands for language-neutral values
 * and are normalised to the `und` (Undetermined) language tag:
 *
 * ```typescript
 * import { local, locals } from '@metreeca/blue';
 *
 * const label = local();                                   // wildcard: { "*": "" }
 * const title = local("Untitled");                         // shorthand: { und: "Untitled" }
 * const name = local({ minLength: 1, maxLength: 200 });    // constrained
 * const description = local({ languageIn: ["en", "it"] }); // language-restricted
 *
 * const keywords = locals();                               // wildcard: { "*": [""] }
 * const tags = locals({ languageIn: ["en"] });             // English only
 * ```
 *
 * **Using in Resource Shapes**
 *
 * ```typescript
 * import { resource, required, optional, local, locals } from '@metreeca/blue';
 *
 * const Article = resource({
 *   title: required(local({ minLength: 1 })),
 *   abstract: optional(local()),
 *   keywords: optional(locals({ languageIn: ["en", "fr", "de"] }))
 * });
 * ```
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/json-ld11/#language-maps JSON-LD 1.1 § 9.8 Language Maps}
 * @see {@link https://www.w3.org/TR/rdf11-concepts/#dfn-language-tagged-string RDF 1.1 § 3.3 Literals}
 */

import { isObject, isString } from "@metreeca/core";
import { type TagRange } from "@metreeca/core/language";
import { immutable } from "@metreeca/core/nested";
import { type Locale, type Locales } from "@metreeca/qest/model";
import { type Local, type Locals } from "@metreeca/qest/state";
import { checkLocalized } from "./local.core.js";


/**
 * Shape definition for single-valued language-tagged maps.
 *
 * **Inheritance**
 *
 * When a {@link resource!ResourceShape} extends a parent via {@link resource!ResourceConstraints.extends | extends},
 * single-valued language-tagged properties are merged according to the following rules. The *child* is the extending
 * shape; the
 * *parent* is the inherited shape.
 *
 * | Field        | Override Rule                                                                   |
 * | ------------ | ------------------------------------------------------------------------------ |
 * | `kind`       | Cannot be overridden                                                           |
 * | `model`      | Must be deeply equal — mismatch signals incompatible shapes                    |
 * | `minLength`  | Child ≥ parent, narrowing the minimum length                                        |
 * | `maxLength`  | Child ≤ parent, narrowing the maximum length                                        |
 * | `languageIn` | Intersection of parent and child sets; empty result is reported as an error               |
 *
 * **Cross-Field Validation**
 *
 * - merged `minLength` must be ≤ merged `maxLength`
 *
 * @see {@link https://www.w3.org/TR/shacl/#UniqueLangConstraintComponent SHACL § 4.8.1 sh:uniqueLang}
 */
export interface LocalShape extends LocalizedConstraints {

	/**
	 * Discriminator identifying this as a single-valued language-tagged shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "local";

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * Accepts plain strings as shorthands for language-neutral values, equivalent to `{ und: value }`.
	 *
	 * **Inheritance** — must be deeply equal between parent and child.
	 *
	 * @defaultValue `{ "*": "" }` (wildcard empty string)
	 */
	readonly model: Local;

}

/**
 * Shape definition for multi-valued language-tagged maps.
 *
 * **Inheritance**
 *
 * When a {@link resource!ResourceShape} extends a parent via {@link resource!ResourceConstraints.extends | extends},
 * multi-valued language-tagged properties are merged according to the following rules. The *child* is the extending
 * shape; the
 * *parent* is the inherited shape.
 *
 * | Field        | Override Rule                                                                   |
 * | ------------ | ------------------------------------------------------------------------------ |
 * | `kind`       | Cannot be overridden                                                           |
 * | `model`      | Must be deeply equal — mismatch signals incompatible shapes                    |
 * | `minLength`  | Child ≥ parent, narrowing the minimum length                                        |
 * | `maxLength`  | Child ≤ parent, narrowing the maximum length                                        |
 * | `languageIn` | Intersection of parent and child sets; empty result is reported as an error               |
 *
 * **Cross-Field Validation**
 *
 * - merged `minLength` must be ≤ merged `maxLength`
 *
 * @see {@link https://www.w3.org/TR/shacl/#LanguageInConstraintComponent SHACL § 4.8.2 sh:languageIn}
 */
export interface LocalsShape extends LocalizedConstraints {

	/**
	 * Discriminator identifying this as a multi-valued language-tagged shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "locals";

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * Accepts plain string arrays as shorthands for language-neutral values, equivalent to `{ und: values }`.
	 *
	 * **Inheritance** — must be deeply equal between parent and child.
	 *
	 * @defaultValue `{ "*": [""] }` (wildcard empty string array)
	 */
	readonly model: Locals;

}


/**
 * Constraints for the {@link local} shape factory.
 */
export interface LocalConstraints extends LocalizedConstraints {

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * Accepts plain strings as shorthands for language-neutral values, normalised to `{ und: value }`.
	 *
	 * @defaultValue `{ "*": "" }` (wildcard empty string)
	 */
	readonly model?: Locale;

}

/**
 * Constraints for the {@link locals} shape factory.
 */
export interface LocalsConstraints extends LocalizedConstraints {

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * Accepts plain string arrays as shorthands for language-neutral values, normalised to `{ und: values }`.
	 *
	 * @defaultValue `{ "*": [""] }` (wildcard empty string array)
	 */
	readonly model?: Locales;

}

/**
 * Base constraint properties for language-tagged shapes.
 */
export interface LocalizedConstraints {

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
	 * Allowed language ranges for language-tagged strings.
	 *
	 * When specified, language tags must match one of the given BCP47 language ranges. Must be non-empty.
	 *
	 * **Inheritance** — intersection of parent and child sets; empty result is reported as an error.
	 *
	 * @defaultValue `undefined` (no language constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#LanguageInConstraintComponent SHACL § 4.8.2 sh:languageIn}
	 */
	readonly languageIn?: readonly [TagRange, ...TagRange[]];

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a single-valued language-tagged map shape with a typed model value and no other constraints.
 *
 *
 * @typeParam M The `Locale` type of the {@link Local} model
 *
 * @param model Prototype value for runtime model assembly
 *
 * @returns An immutable shape with `model` typed as `M`
 *
 * @example
 *
 * ```typescript
 * const title = local({ "*": "Untitled" } as const);
 * const name = local("Default");  // shorthand for { und: "Default" }
 * ```
 */
export function local<M extends Locale>(model: M): LocalShape & { readonly model: M };

/**
 * Creates a single-valued language-tagged map shape with optional validation constraints.
 *
 *
 * @param constraints Optional shape {@link LocalConstraints constraints}
 *
 * @returns An immutable shape with `model` typed as `Local`
 *
 * @throws {RangeError} If `constraints` contains contradictory values
 *
 * @example
 *
 * ```typescript
 * const label = local();
 * const name = local({ minLength: 1, maxLength: 100 });
 * const text = local({ languageIn: ["en", "it"] });
 * ```
 */
export function local<const C extends LocalConstraints>(constraints?: C): LocalShape;

/**
 * Creates a single-valued language-tagged map shape.
 *
 */
export function local(constraints: Locale | LocalConstraints = {}): LocalShape {

	const { model, ...rest } =
		isString(constraints) ? { model: { "*": constraints } }
			: isLocalConstraints(constraints) ? constraints
				: { model: constraints };

	const shape: LocalShape = immutable({

		kind: "local",
		model: isString(model) ? { "*": model } : model ?? { "*": "" },

		...rest

	});

	const trace = checkLocalized(shape);

	if ( trace !== undefined ) {
		throw Object.assign(new RangeError("inconsistent local shape constraints"), { trace });
	}

	return shape;


	function isLocalConstraints(value: unknown): value is LocalConstraints {
		return isObject(value, (v, k) =>
			["minLength", "maxLength", "languageIn", "model"].includes(k)
		);
	}

}


/**
 * Creates a multi-valued language-tagged map shape.
 *
 *
 * @param constraints Optional validation {@link LocalsConstraints constraints}
 *
 * @returns An immutable shape for validating multi-valued language-tagged maps
 *
 * @throws {RangeError} If `constraints` contains contradictory values
 */
export function locals(constraints: LocalsConstraints = {}): LocalsShape {

	const { model, ...rest } = constraints;

	const shape: LocalsShape = immutable({

		kind: "locals",
		model: Array.isArray(model) ? { "*": model } : model ?? { "*": [""] },

		...rest

	});

	const trace = checkLocalized(shape);

	if ( trace !== undefined ) {
		throw Object.assign(new RangeError("inconsistent locals shape constraints"), { trace });
	}

	return shape;
}
