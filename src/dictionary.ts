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
 * Dictionary shape and factories.
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
 * The tag-keyed map is the form stored and ingested. A localised property additionally *coalesces* under language
 * negotiation when retrieved, at its per-tag cardinality: its template slot also accepts a coalesced placeholder for
 * the negotiated value(s) (a bare string for single-string-per-tag, a single-element string array for array-per-tag),
 * and a selection may constrain it with a plain-string operand (comparison, text search, or option) matched
 * existentially over the coalesced value set under ordinary string semantics. State ingress never coalesces: it
 * accepts only the tag-keyed form.
 *
 * **Compatibility**
 *
 * | JSON                 | JSON-LD                            | RDF 1.1                         |
 * | -------------------- | ---------------------------------- | ------------------------------- |
 * | tag-keyed string map | `@language`-container language map | language-tagged string literals |
 *
 * **Defining Language-Tagged Shapes**
 *
 * Models are tag-keyed maps; the [`und`](https://iso639-3.sil.org/code/und) tag carries content of
 * undetermined language (a proper name, say), and the [`zxx`](https://iso639-3.sil.org/code/zxx) tag content
 * with no language at all (identifiers, codes, formulae):
 *
 * ```typescript
 * import { required, optional, multiple } from '@metreeca/blue/value';
 * import { dictionary } from '@metreeca/blue/dictionary';
 *
 * const label = required(dictionary());                                   // scalar, default model: { "*": "" }
 * const title = required(dictionary({ und: "Untitled" }));                // scalar with default content
 * const name = required(dictionary({ minLength: 1, maxLength: 200 }));    // constrained scalar
 * const description = optional(dictionary({ languageIn: ["en", "it"] })); // language-restricted scalar
 * const keywords = multiple(dictionary({ languageIn: ["en"] }));          // array per tag
 * ```
 *
 * **Using in Resource Shapes**
 *
 * ```typescript
 * import { required, optional, multiple } from '@metreeca/blue/value';
 * import { dictionary } from '@metreeca/blue/dictionary';
 * import { resource } from '@metreeca/blue/resource';
 *
 * const Article = resource({
 *   title: required(dictionary({ minLength: 1 })),
 *   abstract: optional(dictionary()),
 *   keywords: multiple(dictionary({ languageIn: ["en", "fr", "de"] }))
 * });
 * ```
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/json-ld11/#language-maps JSON-LD 1.1 § 9.8 Language Maps}
 * @see {@link https://www.w3.org/TR/rdf11-concepts/#dfn-language-tagged-string RDF 1.1 § 3.3 Literals}
 */

import { isObject } from "@metreeca/core";
import type { Tag, TagRange } from "@metreeca/core/language";
import { immutable } from "@metreeca/core/structures";
import { TraceError } from "@metreeca/core/trace";
import type { Locales } from "@metreeca/qest/template";
import { checkDictionary, deriveDictionary } from "./dictionary.core.js";


/**
 * Shape definition for language-tagged string values.
 *
 * Cardinality of the enclosing {@link value!SetShape | SetShape} determines whether each tag holds a single
 * string or a string array.
 *
 * **Inheritance**
 *
 * When a {@link resource!ResourceShape} extends a parent via {@link resource!ResourceShape.parents | parents},
 * language-tagged entries are merged according to the following rules. The *child* is the extending shape; the
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
 * @see {@link https://www.w3.org/TR/shacl/#UniqueLangConstraintComponent SHACL § 4.4.5 sh:uniqueLang}
 * @see {@link https://www.w3.org/TR/shacl/#LanguageInConstraintComponent SHACL § 4.4.4 sh:languageIn}
 */
export interface DictionaryShape extends DictionaryConstraints {

	/**
	 * Discriminator identifying this as a language-tagged shape.
	 *
	 * **Inheritance** — cannot be overridden.
	 */
	readonly kind: "dictionary";

	/**
	 * Prototype value for runtime model assembly.
	 *
	 * Stored as supplied to the factory: a tag-keyed map associating each language tag (or
	 * tag range) with its content.
	 *
	 * **Inheritance** — child overrides parent; conflicting parents without child override are reported as an error.
	 *
	 * @defaultValue `{ "*": "" }` (wildcard tag range bound to an empty string)
	 */
	readonly model: Locales;

}

/**
 * Constraints for the {@link dictionary} shape factory.
 */
export interface DictionaryConstraints {

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


	/**
	 * Allowed language ranges for language-tagged strings.
	 *
	 * When specified, language tags must match one of the given {@link TagRange} values under RFC 4647 basic
	 * filtering. Each range is a basic language range (a sequence of subtags or the standalone `*` wildcard);
	 * extended ranges such as `en-*` are not accepted. Empty arrays are ignored.
	 *
	 * **Inheritance** — intersection of parent and child sets; empty result is reported as an error.
	 *
	 * @defaultValue `undefined` (no language constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#LanguageInConstraintComponent SHACL § 4.4.4 sh:languageIn}
	 * @see {@link https://www.rfc-editor.org/rfc/rfc4647.html RFC 4647 - Matching of Language Tags}
	 */
	readonly languageIn?: readonly TagRange[];

}


//// Factories /////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a dictionary shape with a typed model value and no other constraints.
 *
 * @typeParam M The scalar {@link Locales} type of the model
 *
 * @param model Scalar localised prototype value for runtime model assembly: a tag-keyed map
 *     associating each language tag (or tag range) with its content
 *
 * @returns An immutable shape with `model` typed as `M`
 *
 * @throws {TraceError} If `model` is not a uniform tag-keyed map of either single strings or singleton string tuples,
 *     or if any of its keys is not a basic language range
 *
 * @example
 *
 * ```typescript
 * const title = dictionary({ en: "Untitled", it: "Senza titolo" } as const);
 * const name = dictionary({ und: "Default" });  // language-neutral content under `und`
 * ```
 */
export function dictionary<
	M extends { readonly [tag: Tag]: string }
>(model: M): Omit<DictionaryShape, "model"> & { readonly model: M };

/**
 * Creates a dictionary shape with optional validation constraints.
 *
 * @param constraints Optional shape {@link DictionaryConstraints constraints}
 *
 * @returns An immutable shape with `model` typed as `Locales`
 *
 * @throws {TraceError} If `constraints` contains contradictory values
 *
 * @example
 *
 * ```typescript
 * const label = dictionary();
 * const name = dictionary({ minLength: 1, maxLength: 100 });
 * const restricted = dictionary({ languageIn: ["en", "it"] });
 * ```
 */
export function dictionary<const C extends DictionaryConstraints>(constraints?: C): DictionaryShape;

/**
 * Creates a dictionary shape.
 */
export function dictionary(a: Locales | DictionaryConstraints = {}): DictionaryShape {

	function isDictionaryConstraints(value: unknown): value is DictionaryConstraints {
		return isObject(value, (v, k) =>
			["minLength", "maxLength", "languageIn"].includes(k)
		);
	}

	const withConstraints = isDictionaryConstraints(a);

	const model: Locales = withConstraints ? deriveDictionary(a) : a;
	const constraints = withConstraints ? a : {};

	const shape: DictionaryShape = immutable({

		kind: "dictionary",
		model,

		...constraints

	});

	const trace = checkDictionary(shape);

	if ( trace !== undefined ) {
		throw new TraceError("inconsistent dictionary shape constraints", trace);
	}

	return shape;

}
