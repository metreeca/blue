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
 * Dictionary shape operators.
 *
 * @module
 */

import { type Eager, isArray, isObject, isString, type Lazy, opt as fold, type Optional } from "@metreeca/core";
import { isTag, type Tag } from "@metreeca/core/language";
import { matchTag } from "@metreeca/core/language";
import { immutable } from "@metreeca/core/structures";
import { all, array, fail, length, object, test, type Trace, TraceError, type Validator } from "@metreeca/core/trace";
import { type DictionaryConstraints, type DictionaryShape } from "./dictionary.js";
import type { Scope } from "./index.core.js";


/**
 * Resolves the tag-keyed map a localised shape describes.
 *
 * Yields a map keyed by language tag, carrying a single string under each tag where the shape states
 * {@link DictionaryConstraints.uniqueLang | uniqueLang} and an array of strings under each tag otherwise, so that the
 * content of a tag is typed at the arity the shape admits. A shape leaving the constraint unstated, or stating it only
 * as a boolean, admits several strings under each tag.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Tagged<S extends Lazy<DictionaryShape>> = {

	readonly [tag: Tag]: Eager<S> extends { readonly uniqueLang: true } ? string : readonly string[]

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a localised textual shape.
 *
 * Backs the factory the {@link dictionary!} module exposes: contradictory constraints are rejected as the shape is
 * built, so that a shape that exists admits at least one value.
 *
 * @typeParam U The per-tag arity the shape states, as stated by the signature of the calling factory
 *
 * @param constraints The stated shape {@link DictionaryConstraints constraints}
 *
 * @returns An immutable shape admitting the language maps the constraints bound
 *
 * @throws {TraceError} Where the stated constraints contradict one another
 */
export function create<U extends undefined | boolean>(constraints: DictionaryConstraints): DictionaryShape & {
	readonly uniqueLang: U
} {

	const shape = immutable({

		kind: "dictionary",

		...constraints

	}) as DictionaryShape & { readonly uniqueLang: U }; // ;(cast) the factory signature fixes the stated arity

	const trace = checkDictionary(shape);

	if ( trace !== undefined ) {
		throw new TraceError("inconsistent dictionary shape constraints", trace);
	}

	return shape;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks a set of localised constraints for internal consistency.
 *
 * Reports the contradictions that would leave a shape admitting no value at all, so that a shape is rejected as it is
 * built rather than when a value is first matched against it.
 *
 * @param constraints The constraints to check
 *
 * @returns A trace of the inconsistencies found, or `undefined` where the constraints admit at least one value
 */
export function checkDictionary(constraints: Partial<DictionaryShape>): Optional<Trace> {

	return test<typeof constraints>(({ minLength, maxLength }) => {

		return minLength === undefined || maxLength === undefined || minLength <= maxLength || [
			`{minLength/maxLength} inconsistent bounds <${minLength}> > <${maxLength}>`
		];

	})(constraints);

}

/**
 * Reports whether a localised shape narrows an inherited one.
 *
 * Tests the override relation without building the merged shape, so that an incompatible extension is told apart from
 * a legitimate refinement before either is committed to: a shape narrows the inherited one where it leaves neither
 * length bound wider, adds no language range the inherited shape omits, keeps its per-tag arity, and yields a
 * consistent set of merged constraints.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns A trace of the obstacles to the override, or `undefined` where `target` narrows `source`
 */
export function narrowsDictionary(target: DictionaryShape, source: DictionaryShape): Optional<Trace> {

	const { languageIn: accepted } = source;

	return all<DictionaryShape>(
		test(({ uniqueLang }) => {

			return uniqueLang !== false || source.uniqueLang !== true || [
				`{uniqueLang} dropped unique language constraint`
			];

		}),
		test(({ minLength }) => {

			return minLength === undefined || source.minLength === undefined || minLength >= source.minLength || [
				`{minLength} widened limit <${minLength}> beyond <${source.minLength}>`
			];

		}),
		test(({ maxLength }) => {

			return maxLength === undefined || source.maxLength === undefined || maxLength <= source.maxLength || [
				`{maxLength} widened limit <${maxLength}> beyond <${source.maxLength}>`
			];

		}),
		test(({ languageIn }) => {

			// a range the parent omits would be intersected away, leaving the state wider than the shape admits,
			// so a widened set is rejected outright as with the bounds

			return languageIn === undefined || accepted === undefined
				|| languageIn.every(v => accepted.includes(v))
				|| [
					`{languageIn} unexpected ranges [${languageIn.filter(v => !accepted.includes(v))}]`
				];

		}),
		() => checkDictionary(merge(target, source)) // post-merge constraint consistency
	)(target);

}

/**
 * Merges a localised shape with an inherited one.
 *
 * Yields the single shape an extending member is validated against, combining the inherited constraints with the
 * overriding ones: length bounds accumulate, the accepted language ranges intersect, and `uniqueLang` carries through
 * from whichever shape states it.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns An immutable shape admitting the language maps both `target` and `source` admit
 *
 * @throws {TraceError} Where `target` doesn't narrow `source`
 */
export function mergeDictionary(target: DictionaryShape, source: DictionaryShape): DictionaryShape {

	const trace = narrowsDictionary(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible dictionary shape override", trace);
	}

	return immutable({

		kind: target.kind,

		...merge(target, source)

	});

}


/**
 * Combines the constraints of an overriding shape with the inherited ones.
 *
 * @param target The overriding shape
 * @param source The inherited shape
 *
 * @returns The merged constraints, as they stand before they are checked for consistency
 */
function merge(target: DictionaryShape, source: DictionaryShape): DictionaryConstraints {

	const { languageIn: accepted } = source;

	return {

		// conjunctive: uniqueLang — added but never dropped

		uniqueLang: target.uniqueLang ?? source.uniqueLang,

		// conjunctive: lengths — the tighter bound

		minLength: target.minLength ?? source.minLength,
		maxLength: target.maxLength ?? source.maxLength,

		// conjunctive: languageIn — intersection

		languageIn: target.languageIn !== undefined && accepted !== undefined
			? target.languageIn.filter(v => accepted.includes(v))
			: target.languageIn ?? accepted

	};

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
