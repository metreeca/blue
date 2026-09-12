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
 * Localised value validation.
 *
 * Holds a value to what a localised shape admits and reports everything wrong with it at once, keyed by the tag at
 * fault, so that a caller may tell which language failed and why.
 *
 * @module
 */

import { isArray, isObject, isString, opt as fold, type Optional } from "@metreeca/core";
import { isTag, matchTag, type Tag } from "@metreeca/core/language";
import { all, array, fail, length, object, type Trace, type Validator } from "@metreeca/core/trace";
import type { Scope } from "../index.core.js";
import { type DictionaryShape } from "./index.js";


/**
 * Validates values against a localised shape.
 *
 * Reports a value that is not a language map as a `{kind}` violation, and each entry that breaks a constraint under
 * its own facet, keyed by the tag it is stated under, so that a caller may tell which language failed and why. A tag
 * carries a single string where the shape states {@link DictionaryConstraints.uniqueLang | uniqueLang} and an array of
 * strings otherwise; a value stated at the other arity is rejected as a malformed map rather than as a broken
 * constraint.
 *
 * @param values The values to validate
 * @param shape The shape the values are matched against
 * @param opts Validation options
 * @param opts.scope The {@link Scope | strictness} the shape is enforced at, defaulting to `"state"`. A language map
 *     carries no lexical discriminator, so `"bound"` matches by form alone, exactly as `"model"` does
 *
 * @returns A trace of the violations found, or `undefined` where every value matches `shape`
 */
export function validateDictionary(values: readonly unknown[], shape: DictionaryShape, {

	scope = "state"

}: {

	scope?: Scope

} = {}): Optional<Trace> {

	switch ( scope ) {

		case "state":

			return state(shape)(values);

		case "bound":

			return bound(shape)(values);

		case "model":

			return model(shape)(values);

	}


	function state({

		uniqueLang,

		minLength,
		maxLength,

		languageIn

	}: DictionaryShape): Validator<readonly unknown[]> {

		return map(uniqueLang,

			(tag, content) => all(
				length(minLength, maxLength),
				accepts(tag, languageIn)
			)(content),

			(tag, content) => all(
				array(length(minLength, maxLength)),
				accepts(tag, languageIn)
			)(content)

		);

	}

	function bound({ uniqueLang }: DictionaryShape): Validator<readonly unknown[]> {

		return map(uniqueLang, () => undefined, () => undefined);

	}

	function model({ uniqueLang }: DictionaryShape): Validator<readonly unknown[]> {

		return map(uniqueLang, () => undefined, () => undefined);

	}


	/**
	 * Builds a validator enforcing the form of every language map in a set, holding each entry to the stated arity.
	 *
	 * Reports a value that is not a language map as a `{kind}` violation, and a key that is not a language tag or an
	 * entry stated at the other per-tag arity as an entry violation keyed by the tag; every violation is keyed by the
	 * index of the map carrying it, as a localised value is a structured value in its own right and a member may carry
	 * several. A surviving entry is handed to `unique` or to `stacked`, according to the arity the shape states.
	 */
	function map(
		uniqueLang: undefined | boolean,
		unique: (tag: Tag, content: string) => Optional<Trace>,
		stacked: (tag: Tag, content: readonly string[]) => Optional<Trace>
	): Validator<readonly unknown[]> {

		return array((value: unknown) => !isObject(value) ? ["{kind} expected <dictionary> value"]

			: object(([tag, text]: readonly [string, unknown]) =>
				!isTag(tag) ? [{ [tag]: ["invalid tag"] }]
					: uniqueLang === true
						? isString(text)
							? fold(unique(tag, text), trace => [{ [tag]: trace }])
							: [{ [tag]: ["expected string value"] }]
						: isArray<string>(text, isString)
							? fold(stacked(tag, text), trace => [{ [tag]: trace }])
							: [{ [tag]: ["expected string array value"] }]
			)(value)

		);

	}

	function accepts(tag: Tag, languageIn: undefined | readonly string[]) {

		return languageIn !== undefined && !languageIn.some(range => matchTag(tag, range))
			&& fail([`{languageIn} unsupported tag for allowed languages [${languageIn.join(", ")}]`]);

	}

}
