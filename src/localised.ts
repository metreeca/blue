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
 * Localised text shape and factories.
 *
 * Defines shapes and factories for validating language-tagged string values, mapping
 * [JSON-LD language maps](https://www.w3.org/TR/json-ld11/#language-maps) to
 * [RDF 1.1](https://www.w3.org/TR/rdf11-concepts/#dfn-language-tagged-string) language-tagged strings.
 *
 * Whether each tag holds a single string or a string array is determined by the cardinality of the enclosing
 * {@link value!SetShape | SetShape}, not by the shape itself:
 *
 * - Scalar cardinality (`maxCount === 1`): each tag holds a single string
 * - Array cardinality (`maxCount > 1` or unbounded): each tag holds a string array
 *
 * **Defining Language-Tagged Shapes**
 *
 * Plain strings and string arrays are accepted as shorthands for language-neutral values and are normalised
 * to the `*` (wildcard) tag:
 *
 * ```typescript
 * import { required, optional, multiple } from '@metreeca/blue/value';
 * import { localised } from '@metreeca/blue/localised';
 *
 * const label = required(localised());                                   // scalar: { "*": "" }
 * const title = required(localised("Untitled"));                         // scalar shorthand
 * const name = required(localised({ minLength: 1, maxLength: 200 }));    // constrained scalar
 * const description = optional(localised({ languageIn: ["en", "it"] })); // language-restricted scalar
 * const keywords = multiple(localised({ languageIn: ["en"] }));          // array per tag
 * ```
 *
 * **Using in Resource Shapes**
 *
 * ```typescript
 * import { required, optional, multiple } from '@metreeca/blue/value';
 * import { localised } from '@metreeca/blue/localised';
 * import { resource } from '@metreeca/blue/resource';
 *
 * const Article = resource({
 *   title: required(localised({ minLength: 1 })),
 *   abstract: optional(localised()),
 *   keywords: multiple(localised({ languageIn: ["en", "fr", "de"] }))
 * });
 * ```
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/json-ld11/#language-maps JSON-LD 1.1 § 9.8 Language Maps}
 * @see {@link https://www.w3.org/TR/rdf11-concepts/#dfn-language-tagged-string RDF 1.1 § 3.3 Literals}
 */

import { isArray, isObject, isString } from "@metreeca/core";
import { immutable } from "@metreeca/core/deep";
import { type TagRange } from "@metreeca/core/language";
import { type Localised } from "@metreeca/qest/resource";
import { type Locale } from "@metreeca/qest/template";
import { TraceError } from "./index.core.js";
import { checkLocalised } from "./localised.core.js";


/**
 * Shape definition for language-tagged string values.
 *
 * Cardinality of the enclosing {@link value!SetShape | SetShape} determines whether each tag holds a single
 * string or a string array.
 *
 * **Inheritance**
 *
 * When a {@link resource!ResourceShape} extends a parent via {@link resource!ResourceConstraints.extends | extends},
 * language-tagged properties are merged according to the following rules. The *child* is the extending shape; the
 * *parent* is the inherited shape.
 *
 * | Field        | Override Rule                                                               |
 * | ------------ | ----------------------------------------------------------------------------|
 * | `kind`       | Cannot be overridden                                                        |
 * | `model`      | Child overrides parent; conflicting parents without child override are reported as an error |
 * | `minLength`  | Child ≥ parent, narrowing the minimum length                                |
 * | `maxLength`  | Child ≤ parent, narrowing the maximum length                                |
 * | `languageIn` | Intersection of parent and child sets; empty result is reported as an error |
 *
 * **Cross-Field Validation**
 *
 * - merged `minLength` must be ≤ merged `maxLength`
 *
 * @see {@link https://www.w3.org/TR/shacl/#UniqueLangConstraintComponent SHACL § 4.8.1 sh:uniqueLang}
 * @see {@link https://www.w3.org/TR/shacl/#LanguageInConstraintComponent SHACL § 4.8.2 sh:languageIn}
 */
export interface LocalisedShape extends LocalisedConstraints {

	/**
	 * Discriminator identifying this as a language-tagged shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "localised";

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * Always a normalised {@link Localised} map after construction; plain string and array shorthands
	 * passed to the factory are normalised to the `*` (wildcard) tag.
	 *
	 * **Inheritance** — child overrides parent; conflicting parents without child override are reported as an error.
	 *
	 * @defaultValue `{ "*": "" }` (wildcard empty string)
	 */
	readonly model: Localised;

}

/**
 * Constraints for the {@link localised} shape factory.
 */
export interface LocalisedConstraints {

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


//// Factories /////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a language-tagged map shape with a typed model value and no other constraints.
 *
 * @typeParam M The {@link Locale} type of the model
 *
 * @param model Prototype value for runtime model assembly
 *
 * @returns An immutable shape with `model` typed as `M`
 *
 * @example
 *
 * ```typescript
 * const title = localised({ "*": "Untitled" } as const);
 * const name = localised("Default");  // shorthand for { "*": "Default" }
 * ```
 */
export function localised<M extends Locale>(model: M): LocalisedShape & { readonly model: M };

/**
 * Creates a language-tagged map shape with optional validation constraints.
 *
 * @param constraints Optional shape {@link LocalisedConstraints constraints}
 *
 * @returns An immutable shape with `model` typed as `Localised`
 *
 * @throws {TraceError} If `constraints` contains contradictory values
 *
 * @example
 *
 * ```typescript
 * const label = localised();
 * const name = localised({ minLength: 1, maxLength: 100 });
 * const text = localised({ languageIn: ["en", "it"] });
 * ```
 */
export function localised<const C extends LocalisedConstraints>(constraints?: C): LocalisedShape;

/**
 * Creates a language-tagged map shape.
 *
 */
export function localised(a: Locale | LocalisedConstraints = {}): LocalisedShape {

	const isConstraints = isObject(a, (v, k) =>
		["minLength", "maxLength", "languageIn"].includes(k)
	);

	const model = isConstraints ? undefined : a;
	const constraints = isConstraints ? a : {};

	const resolved: Localised = model === undefined ? { "*": "" }
		: isString(model) ? { "*": model }
			: isArray(model) ? { "*": model } as Localised
				: model as Localised;

	const shape: LocalisedShape = immutable({

		kind: "localised",
		model: resolved,

		...constraints

	});

	const trace = checkLocalised(shape);

	if ( trace !== undefined ) {
		throw new TraceError("inconsistent localised shape constraints", trace);
	}

	return shape;

}
