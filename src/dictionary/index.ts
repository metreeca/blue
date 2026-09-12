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
 * > Factories validate constraint consistency at construction time:
 * > contradictory constraints like `minLength > maxLength` throw a `TraceError`.
 *
 * How many strings a tag carries is fixed by {@link DictionaryConstraints.uniqueLang | uniqueLang}: a unique-tagged
 * shape gives every tag a single string, and any other gives every tag an array.
 *
 * The tag-keyed map is the form a value is stored and submitted in. A localised member additionally *coalesces* under
 * language negotiation when retrieved, at the same per-tag arity: the value may be retrieved as the negotiated content
 * alone, and filtered by a plain string operand matched against it under ordinary textual semantics. Submission never
 * coalesces: it accepts the tag-keyed form alone.
 *
 * **Compatibility**
 *
 * | JSON                 | JSON-LD                            | RDF 1.1                         |
 * | -------------------- | ---------------------------------- | ------------------------------- |
 * | tag-keyed string map | `@language`-container language map | language-tagged string literals |
 *
 * **Defining Language-Tagged Shapes**
 *
 * Values are tag-keyed maps; the [`und`](https://iso639-3.sil.org/code/und) tag carries content of undetermined
 * language (a proper name, say), and the [`zxx`](https://iso639-3.sil.org/code/zxx) tag content with no language at
 * all (identifiers, codes, formulae):
 *
 * ```typescript
 * import { dictionary } from '@metreeca/blue/dictionary';
 *
 * const label = dictionary({ uniqueLang: true });           // a single string per tag
 * const keywords = dictionary();                            // an array of strings per tag
 * const name = dictionary({ minLength: 1, maxLength: 200 });// length-constrained
 * const abstract = dictionary({ languageIn: ["en", "it"] });// language-restricted
 * ```
 *
 * **Using in Resource Shapes**
 *
 * ```typescript
 * import { multiple, optional, required, resource } from '@metreeca/blue/resource';
 * import { dictionary } from '@metreeca/blue/dictionary';
 *
 * const Article = resource({
 *   title: required(dictionary({ uniqueLang: true, minLength: 1 })),
 *   abstract: optional(dictionary({ uniqueLang: true })),
 *   keywords: multiple(dictionary({ languageIn: ["en", "fr", "de"] }))
 * });
 * ```
 *
 * @module
 *
 * @see {@link https://www.w3.org/TR/json-ld11/#language-maps JSON-LD 1.1 § 9.8 Language Maps}
 * @see {@link https://www.w3.org/TR/rdf11-concepts/#dfn-language-tagged-string RDF 1.1 § 3.3 Literals}
 */

import type { TagRange } from "@metreeca/core/language";
import { TraceError } from "@metreeca/core/trace";
import { assemble } from "./assembler.js";


/**
 * Describes a localised textual value.
 *
 * Admits the [JSON-LD language maps](https://www.w3.org/TR/json-ld11/#language-maps) a resource may carry: a map keyed
 * by [BCP 47](https://www.rfc-editor.org/info/bcp47) language tag, holding the content the resource states in each
 * language, so that a property whose value varies by language is described by a single shape rather than by one member
 * per language. Content of undetermined language (a proper name, say) is keyed by the
 * [`und`](https://iso639-3.sil.org/code/und) tag, and content belonging to no language at all (an identifier, a code, a
 * formula) by the [`zxx`](https://iso639-3.sil.org/code/zxx) tag. Each entry is stored as a
 * [RDF 1.1](https://www.w3.org/TR/rdf11-concepts/#dfn-language-tagged-string) language-tagged string.
 *
 * How many strings a tag carries is fixed by {@link DictionaryConstraints.uniqueLang | uniqueLang}: a unique-tagged
 * shape gives every tag a single string, and any other gives every tag an array. The map is a structured value in its
 * own right, as a resource is, so the bounds of the enclosing {@link _!Range} count the maps a member carries rather
 * than the strings a tag holds.
 *
 * **Negotiation**
 *
 * The tag-keyed map is the form a value is stored and submitted in. On retrieval a localised member is additionally
 * *coalesced* under language negotiation, at the same per-tag arity: the value may be retrieved as the negotiated
 * content alone (a bare string where a tag carries one, a single-element array where it carries several), and filtered
 * by a plain string operand (a comparison, a text search or an option) matched against the negotiated content under
 * ordinary textual semantics. Submission never coalesces: it accepts the tag-keyed form alone.
 *
 * **Inheritance**
 *
 * Where a {@link resource!ResourceShape} extends the shapes it lists as {@link resource!ResourceShape.parents |
 * parents}, localised members are merged according to the following rules. The *child* is the extending shape; the
 * *parent* is the inherited one.
 *
 * | Field        | Override Rule                                                               |
 * | ------------ | --------------------------------------------------------------------------- |
 * | `kind`       | Cannot be overridden                                                        |
 * | `minLength`  | Child ≥ parent, narrowing the minimum length                                |
 * | `maxLength`  | Child ≤ parent, narrowing the maximum length                                |
 * | `languageIn` | Child may only drop accepted ranges                                          |
 * | `uniqueLang` | Child may add but not drop; an inherited constraint always carries through  |
 *
 * **Cross-Field Validation**
 *
 * - merged `minLength` must be ≤ merged `maxLength`
 *
 * @see {@link https://www.w3.org/TR/json-ld11/#language-maps JSON-LD 1.1 § 9.8 Language Maps}
 * @see {@link https://www.w3.org/TR/rdf11-concepts/#dfn-language-tagged-string RDF 1.1 § 3.3 Literals}
 */
export type DictionaryShape = DictionaryConstraints & {

	readonly kind: "dictionary"

}

/**
 * Constraints accepted by the {@link dictionary} shape factory.
 *
 * Bounds the content a tag may carry and the languages the map may key it by. Length bounds are matched against each
 * string separately, so a value is held to them whatever language it is stated in.
 *
 * @see {@link https://www.w3.org/TR/shacl/#core-components-string SHACL § 4.4 String-based Constraint Components}
 */
export type DictionaryConstraints = {

	/**
	 * Restricts every tag to a single string.
	 *
	 * When `true`, a tag carries a single string, so that a member stating several values spreads them across languages
	 * rather than stacking them under one. Fixes the arity the content is resolved at, as {@link Tagged} reads it: a
	 * bare string under every tag where the constraint is stated, an array of strings under every tag otherwise.
	 *
	 * **Inheritance** — a child may add the constraint but not drop it: overriding a unique-tagged parent with a
	 * non-unique-tagged child is rejected.
	 *
	 * @defaultValue `undefined` (several strings admitted per tag)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#UniqueLangConstraintComponent SHACL § 4.4.5 sh:uniqueLang}
	 */
	readonly uniqueLang?: boolean;

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
	 * Allowed language ranges.
	 *
	 * When specified, every tag the map is keyed by must match one of the given {@link TagRange} values under RFC 4647
	 * basic filtering. Each range is a basic language range (a sequence of subtags or the standalone `*` wildcard);
	 * extended ranges such as `en-*` are not accepted. Empty arrays are ignored. Language *tags*, which identify a
	 * language rather than select one, are described by {@link string!tag | tag} instead.
	 *
	 * **Inheritance** — child may only drop accepted ranges.
	 *
	 * @defaultValue `undefined` (no language constraint)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#LanguageInConstraintComponent SHACL § 4.4.4 sh:languageIn}
	 * @see {@link https://www.rfc-editor.org/rfc/rfc4647.html RFC 4647 - Matching of Language Tags}
	 */
	readonly languageIn?: readonly TagRange[];

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Assembles a localised textual shape.
 *
 * Contradictory constraints are rejected as the shape is built, so a shape that exists admits at least one value.
 *
 * @typeParam C The stated constraints
 *
 * @param constraints Optional shape {@link DictionaryConstraints constraints}
 *
 * @returns An immutable shape admitting the language maps the constraints bound, carrying a single string per tag where
 *     they state {@link DictionaryConstraints.uniqueLang | uniqueLang}
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 *
 * @example
 *
 * ```typescript
 * const label = required(dictionary({ uniqueLang: true }));
 * const description = optional(dictionary({ languageIn: ["en", "it"] }));
 * const keywords = multiple(dictionary({ languageIn: ["en"] }));
 * ```
 */
export function dictionary<const C extends DictionaryConstraints = {}>(constraints?: C): DictionaryShape & {
	readonly uniqueLang: C["uniqueLang"]
} {

	return assemble<C["uniqueLang"]>(constraints ?? {});

}
