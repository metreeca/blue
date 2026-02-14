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

import { assert } from "@metreeca/core/error";
import { type TagRange } from "@metreeca/core/language";
import { immutable } from "@metreeca/core/nested";
import { isLocalModel, type LocalModel, type LocalsModel } from "@metreeca/qest/model";
import { type Local, type Locals } from "@metreeca/qest/state";
import {
	isLocalConstraints,
	isLocalizedConstraints,
	isLocalsConstraints,
	isLocalShape,
	isLocalsShape
} from "./local.core.js";

export { isLocalShape, isLocalsShape, isLocalConstraints, isLocalsConstraints, isLocalizedConstraints };


/**
 * Shape definition for single-valued language-tagged maps.
 *
 * @see {@link https://www.w3.org/TR/shacl/#UniqueLangConstraintComponent SHACL § 4.8.1 sh:uniqueLang}
 */
export interface LocalShape extends LocalizedConstraints {

	/**
	 * Discriminator identifying this as a single-valued language-tagged shape.
	 */
	readonly kind: "local";

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * Accepts plain strings as shorthands for language-neutral values, equivalent to `{ und: value }`.
	 *
	 * @defaultValue `{ "*": "" }` (wildcard empty string)
	 */
	readonly model: Local;

}

/**
 * Shape definition for multi-valued language-tagged maps.
 *
 * @see {@link https://www.w3.org/TR/shacl/#LanguageInConstraintComponent SHACL § 4.8.2 sh:languageIn}
 */
export interface LocalsShape extends LocalizedConstraints {

	/**
	 * Discriminator identifying this as a multi-valued language-tagged shape.
	 */
	readonly kind: "locals";

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * Accepts plain string arrays as shorthands for language-neutral values, equivalent to `{ und: values }`.
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
	readonly model?: LocalModel;

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
	readonly model?: LocalsModel;

}

/**
 * Base constraint properties for language-tagged shapes.
 */
export interface LocalizedConstraints {

	/**
	 * Minimum string length in characters.
	 *
	 * @defaultValue `undefined` (no minimum length)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinLengthConstraintComponent SHACL § 4.3.1 sh:minLength}
	 */
	readonly minLength?: number;

	/**
	 * Maximum string length in characters.
	 *
	 * @defaultValue `undefined` (no maximum length)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxLengthConstraintComponent SHACL § 4.3.2 sh:maxLength}
	 */
	readonly maxLength?: number;


	/**
	 * Allowed language ranges for language-tagged strings.
	 *
	 * When specified, language tags must match one of the given BCP47 language ranges.
	 *
	 * @defaultValue `undefined` (no language constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#LanguageInConstraintComponent SHACL § 4.8.2 sh:languageIn}
	 */
	readonly languageIn?: readonly TagRange[];

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a single-valued language-tagged map shape with a typed model value and no other constraints.
 *
 * @group Factories
 *
 * @typeParam M The literal type for the model
 *
 * @param model Prototype value for runtime model assembly
 *
 * @returns A shape with `model` typed as `M`
 *
 * @example
 *
 * ```typescript
 * const title = local({ "*": "Untitled" } as const);
 * const name = local("Default");  // shorthand for { und: "Default" }
 * ```
 */
export function local<M extends Local>(model: M): LocalShape & { readonly model: M };

/**
 * Creates a single-valued language-tagged map shape with optional validation constraints.
 *
 * @group Factories
 *
 * @param constraints Optional shape {@link LocalConstraints constraints}
 *
 * @returns A shape with `model` typed as `Local`
 *
 * @throws {TypeError} If `constraints` is not a valid {@link LocalConstraints}
 *
 * @example
 *
 * ```typescript
 * const label = local();
 * const name = local({ minLength: 1, maxLength: 100 });
 * const text = local({ languageIn: ["en", "it"] });
 * ```
 */
export function local(constraints?: LocalConstraints): LocalShape;

/**
 * Creates a single-valued language-tagged map shape.
 *
 * @group Factories
 */
export function local(constraints: Local | LocalConstraints = {}): LocalShape {

	const $constraints = typeof constraints === "string"
		? { model: { und: constraints } as Local }
		: !isLocalConstraints(constraints) && isLocalModel(constraints) && Object.keys(constraints).length > 0
			? { model: constraints as Local }
			: constraints;

	const { model, languageIn, ...rest } = assert($constraints, isLocalConstraints);

	return immutable({

		kind: "local",
		model: typeof model === "string" ? { und: model } : model ?? { "*": "" },

		languageIn,

		...rest

	}, isLocalShape);
}


/**
 * Creates a multi-valued language-tagged map shape.
 *
 * @group Factories
 *
 * @param constraints Optional validation {@link LocalsConstraints constraints}
 *
 * @returns A shape for validating multi-valued language-tagged maps
 *
 * @throws {TypeError} If `constraints` is not a valid {@link LocalsConstraints}
 */
export function locals(constraints: LocalsConstraints = {}): LocalsShape {

	const { model, languageIn, ...rest } = assert(constraints, isLocalsConstraints);

	return immutable({

		kind: "locals",
		model: Array.isArray(model) ? { und: model } : model ?? { "*": [""] },

		languageIn,

		...rest

	}, isLocalsShape);
}
