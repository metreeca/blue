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
 * Localised text shape operators.
 *
 * @module
 */

import { isArray, isObject, isString, opt as fold } from "@metreeca/core";
import { immutable } from "@metreeca/core/structures";
import { isTag, isTagRange, matchTag, type Tag } from "@metreeca/core/language";
import type { Text } from "@metreeca/qest/resource";
import { type Locale, type Placeholders, type Selection } from "@metreeca/qest/template";
import { all, array, fail, length, object, test, type Trace, TraceError } from "@metreeca/core/trace";
import type { TextConstraints, TextShape } from "./text.js";


/**
 * Checks internal consistency of a {@link TextShape} declaration.
 *
 * Verifies that the optional `minLength` does not exceed the optional `maxLength`, and that the
 * optional {@link Locale} `model` is a well-formed prototype declaration. Used by shape factories
 * to reject malformed declarations at construction time.
 *
 * @param constraints The constraint fields to check
 * @param constraints.minLength Lower bound on per-tag string length
 * @param constraints.maxLength Upper bound on per-tag string length
 * @param constraints.model The localised prototype model
 *
 * @returns A keyed trace of violations, or `undefined` if the declaration is consistent
 */
export function checkText(constraints: Partial<TextShape>): undefined | Trace {

	return all<typeof constraints>(
		test(({ minLength, maxLength }) => {

			return minLength === undefined || maxLength === undefined || minLength <= maxLength || [
				`{minLength/maxLength} inconsistent bounds <${minLength}> > <${maxLength}>`
			];

		}),
		test(({ model }) => {

			return model === undefined || fold(checkTextModel(model), trace => [{ "{model}": trace }]) || true;

		})
	)(constraints);


	/**
	 * Validates a localised text shape's {@link Locale} model.
	 *
	 * The model declares the property's per-tag cardinality, so it admits a tag-range-keyed map whose
	 * per-tag values are either uniformly single strings (single-string-per-tag) or uniformly singleton
	 * string tuples (array-per-tag). Mixed maps combining both shapes are rejected: a property is one
	 * cardinality or the other, never both. Keys must be basic language ranges (a sequence of subtags or
	 * the standalone `*` wildcard); extended ranges such as `en-*` are not accepted, and any key that
	 * fails `isTagRange` is reported as `invalid tag range`. Unlike the placeholder validators
	 * ({@link validateLocaleString} / {@link validateLocaleStrings}), which match a value against a property's
	 * already-declared cardinality, this checks the declaration itself at shape construction. {@link checkText}
	 * invokes it under the `{model}` key, folding model legality into its overall declaration check.
	 *
	 * @param value The localised model to validate
	 *
	 * @returns A keyed trace of per-entry violations, or `undefined` when the model is a uniform
	 *     tag-keyed map of single strings or singleton string tuples
	 *
	 * @see {@link https://www.rfc-editor.org/rfc/rfc4647.html RFC 4647 - Matching of Language Tags}
	 */
	function checkTextModel(value: unknown): undefined | Trace {

		if ( isObject(value) ) {

			const entries = Object.entries(value);

			const hasScalar = entries.some(([k, v]) => isTagRange(k) && isString(v));
			const hasArray = entries.some(([k, v]) => isTagRange(k) && isArray(v, [isString]));

			return hasScalar && hasArray

				? ["{kind} mixed scalar and singleton-tuple values"]

				: object(([k, v]) =>
					!isTagRange(k) ? [{ [k]: ["invalid tag range"] }]
						: isString(v) || isArray(v, [isString]) ? undefined
							: [{ [k]: ["expected string or singleton string tuple"] }]
				)(value);

		} else {

			return ["expected <text> value"];

		}

	}

}


/**
 * Reports whether an overriding text shape narrows an inherited base shape.
 *
 * Tests the override relation without building the merged shape: returns `undefined` when `target` only tightens
 * `source` (lengths not widened, `languageIn` intersection non-empty, merged constraints consistent), or a keyed
 * {@link Trace} describing the obstacles otherwise.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns A keyed trace of narrowing obstacles, or `undefined` when `target` narrows `source`
 */
export function narrowsText(target: TextShape, source: TextShape): undefined | Trace {

	return all<TextShape>(
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

			return languageIn === undefined || source.languageIn === undefined
				|| languageIn.some(v => source.languageIn!.includes(v))
				|| [
					`{languageIn} disjoint sets [${languageIn}] and [${source.languageIn}]`
				];

		}),
		() => checkText({ // post-merge constraint consistency

			minLength: target.minLength ?? source.minLength,
			maxLength: target.maxLength ?? source.maxLength

		})
	)(target);

}

/**
 * Merges an overriding text shape with an inherited base shape.
 *
 * Combines constraints from `source` into `target`, enforcing that overrides only narrow inherited definitions.
 *
 * @param target The overriding child shape
 * @param source The inherited parent shape
 *
 * @returns The merged shape with combined constraints
 *
 * @throws {TraceError} On incompatible overrides
 */
export function mergeText(target: TextShape, source: TextShape): TextShape {

	const trace = narrowsText(target, source);

	if ( trace !== undefined ) {
		throw new TraceError("incompatible text shape override", trace);
	}

	// conjunctive: languageIn — intersection

	const languageIn = target.languageIn !== undefined && source.languageIn !== undefined
		? target.languageIn.filter(v => source.languageIn!.includes(v))
		: target.languageIn ?? source.languageIn;

	// merged constraints

	const minLength = target.minLength ?? source.minLength;
	const maxLength = target.maxLength ?? source.maxLength;

	// build shape — child model overrides parent

	return immutable({

		kind: target.kind,
		model: target.model,

		minLength,
		maxLength,

		languageIn

	});

}

/**
 * Derives the default localised prototype model.
 *
 * Produces a {@link Locale} placeholder keyed by every {@link TextConstraints.languageIn | languageIn} range mapped to
 * empty content, so retrieval requests all permitted languages; when no language constraint is set the placeholder is
 * the single `*` wildcard standing for any language. The result is a legal placeholder rather than a legal value,
 * since the content is empty and the keys are basic ranges rather than concrete tags.
 *
 * @param constraints The text constraints whose language constraint selects the placeholder ranges
 *
 * @returns The default localised prototype model
 */
export function deriveText({

	languageIn

}: TextConstraints): Locale {

	return immutable(Object.fromEntries((languageIn ?? ["*"]).map(range => [range, ""])));

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validates {@link Text | localised state values} against a {@link TextShape}.
 *
 * Tries the two {@link Text} arms in turn (the single-string-per-tag form via
 * {@link validateTextString} and the string-array-per-tag form via
 * {@link validateTextStrings}), succeeding if either form passes. When both arms fail,
 * returns whichever sub-trace carries structured per-tag detail (preferring object traces
 * over plain `{kind}` errors), so that downstream consumers see the specific tag-level
 * violations instead of a generic "neither arm matched" message.
 *
 * Use this entry point at call sites where the value's per-tag form (scalar vs array) cannot
 * be predicted from cardinality bounds; cardinality-aware call sites should dispatch directly
 * to one of the per-arm validators.
 *
 * @param values The values to validate
 * @param shape The text shape to validate against
 *
 * @returns A trace of violations, or `undefined` when either arm accepts the value
 */
export function validateText(values: readonly unknown[], shape: TextShape): undefined | Trace {

	const stringTrace = validateTextString(values, shape);
	const stringsTrace = validateTextStrings(values, shape);

	// either arm accepts; otherwise prefer the structurally richer trace (one carrying a keyed record)

	return stringTrace === undefined || stringsTrace === undefined ? undefined
		: keyed(stringsTrace) ? stringsTrace
			: keyed(stringTrace) ? stringTrace
				: stringsTrace;

}

/**
 * Validates a localised {@link Text} value set against a {@link TextShape} under set cardinality bounds.
 *
 * Commits to a single per-tag form based on the expected cardinality: the single-string-per-tag arm
 * ({@link validateTextString}) when `maxCount === 1`, the string-array-per-tag arm ({@link validateTextStrings})
 * otherwise. It then enforces the `minCount` / `maxCount` bounds against each language tag's value count. An empty tag
 * map, or one whose every tag holds an empty array, counts as an absent value and satisfies the shape unless
 * `minCount >= 1` requires at least one language tag.
 *
 * Unlike {@link validateText}, which probes both arms where the per-tag form cannot be predicted from cardinality, this
 * entry point is cardinality-aware and commits to a single arm.
 *
 * @param value The value to validate, with `undefined` and empty-array absence already normalised away
 * @param bounds The set-level cardinality bounds
 * @param bounds.minCount Minimum number of values required per language tag
 * @param bounds.maxCount Maximum number of values admitted per language tag
 * @param shape The text shape carrying per-tag length and language constraints
 *
 * @returns A keyed trace of violations, or `undefined` when the value matches
 */
export function validateTextSet(value: unknown, {

	minCount,
	maxCount

}: {

	readonly minCount?: number
	readonly maxCount?: number

}, shape: TextShape): undefined | Trace {

	const present = isObject(value) && (
		Object.keys(value).length === 0
		|| Object.values(value).every(v => isArray(v) && v.length === 0)
	) ? undefined : value;

	const values = present === undefined ? [] : [present];

	const structural = maxCount === 1
		? validateTextString(values, shape)
		: validateTextStrings(values, shape);

	if ( structural !== undefined ) {

		return structural;

	} else if ( present === undefined ) {

		return minCount !== undefined && minCount >= 1
			? ["{minCount} expected at least one language tag"]
			: undefined;

	} else {

		// validator contract: structural arm passed and present !== undefined, so present
		// is a non-array object (see validateTextString/validateTextStrings)

		const entries = present as Record<string, unknown>;

		return Object.keys(entries).length === 0 && minCount !== undefined && minCount >= 1

			? ["{minCount} expected at least one language tag"]

			: object(([tag, tagValue]: readonly [string, unknown]) => {

				const count = isArray(tagValue) ? tagValue.length : 1;

				return fold(all(
					(minCount !== undefined && count < minCount)
					&& fail([`{minCount} expected at least <${minCount}> value(s) for tag`]),
					(maxCount !== undefined && count > maxCount)
					&& fail([`{maxCount} expected at most <${maxCount}> value(s) for tag`])
				)(undefined), trace => [{ [tag]: trace }]);

			})(entries);

	}

}

/**
 * Validates the single-string-per-tag arm of a {@link Text} state value against a
 * {@link TextShape}.
 *
 * Expects at most one value, structured as a map with concrete language {@link Tag} keys
 * mapping to single string values. Per-tag array values are rejected: those belong to the
 * string-array arm, validated by {@link validateTextStrings}. The per-tag string
 * length and language constraints declared on the shape (`minLength`, `maxLength`,
 * `languageIn`) are enforced; tag keys that fail `isTag` are reported as `invalid tag`.
 *
 * @param values The values to validate (zero or one element)
 * @param shape The text shape carrying length and language constraints
 *
 * @returns A keyed trace of per-tag violations, or `undefined` when the value matches the
 *     single-string-per-tag arm
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc5646.html RFC 5646 - Tags for Identifying Languages}
 */
export function validateTextString(values: readonly unknown[], {

	minLength,
	maxLength,

	languageIn

}: TextShape): undefined | Trace {

	const [value] = values;

	if ( values.length === 0 ) {

		return undefined;

	} else if ( values.length > 1 ) {

		return ["{kind} expected at most one <text> value"];

	} else if ( !isObject(value) ) {

		return ["{kind} expected <text> value"];

	} else {

		return object(([key, text]: readonly [string, unknown]) =>
			!isTag(key) ? [{ [key]: ["invalid tag"] }]
				: !isString(text) ? [{ [key]: ["expected string value"] }]
					: fold(all(
						length(minLength, maxLength),
						(languageIn !== undefined && !languageIn.some(range => matchTag(key, range)))
						&& fail([`{languageIn} unsupported tag for allowed languages [${languageIn.join(", ")}]`])
					)(text), trace => [{ [key]: trace }])
		)(value);

	}

}

/**
 * Validates the string-array-per-tag arm of a {@link Text} state value against a
 * {@link TextShape}.
 *
 * Expects at most one value, structured as a map with concrete language {@link Tag} keys
 * mapping to string arrays. Per-tag scalar string values are rejected: those belong to the
 * single-string arm, validated by {@link validateTextString}. The per-tag string
 * length and language constraints declared on the shape (`minLength`, `maxLength`,
 * `languageIn`) are enforced over each element of the array; tag keys that fail `isTag` are
 * reported as `invalid tag`. Empty arrays per tag are accepted as absent (vacuous truth on
 * the length checks) matching the "empty arrays are ignored" rule.
 *
 * @param values The values to validate (zero or one element)
 * @param shape The text shape carrying length and language constraints
 *
 * @returns A keyed trace of per-tag violations, or `undefined` when the value matches the
 *     string-array-per-tag arm
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc5646.html RFC 5646 - Tags for Identifying Languages}
 */
export function validateTextStrings(values: readonly unknown[], {

	minLength,
	maxLength,

	languageIn

}: TextShape): undefined | Trace {

	const [value] = values;

	if ( values.length === 0 ) {

		return undefined;

	} else if ( values.length > 1 ) {

		return ["{kind} expected at most one <text> value"];

	} else if ( !isObject(value) ) {

		return ["{kind} expected <text> value"];

	} else {

		return object(([key, texts]: readonly [string, unknown]) =>
			!isTag(key) ? [{ [key]: ["invalid tag"] }]
				: !isArray<string>(texts, isString) ? [{ [key]: ["expected string array value"] }]
					: fold(all(
						array(length(minLength, maxLength)),
						(languageIn !== undefined && !languageIn.some(range => matchTag(key, range)))
						&& fail([`{languageIn} unsupported tag for allowed languages [${languageIn.join(", ")}]`])
					)(texts), trace => [{ [key]: trace }])
		)(value);

	}

}


/**
 * Validates a {@link Locale} placeholder against both per-tag arms.
 *
 * Tries the two {@link Locale} arms in turn (the single-string-per-tag form via
 * {@link validateLocaleString} and the string-array-per-tag form via {@link validateLocaleStrings}),
 * succeeding if either form passes. When both arms fail, returns whichever sub-trace carries
 * structured per-tag detail (preferring object traces over plain string errors), so that downstream
 * consumers see the specific tag-level violations instead of a generic "neither arm matched" message.
 *
 * Symmetric to {@link validateText}, the localised-value counterpart: where {@link validateText}
 * probes both arms of an actual localised value against a {@link TextShape}, this probes both arms of a
 * localised placeholder, enforcing no length or language constraints since template values are
 * placeholders.
 *
 * @param values The placeholder values to validate (zero or one element)
 *
 * @returns A trace of violations, or `undefined` when either arm accepts the value
 */
export function validateLocale(values: readonly unknown[]): undefined | Trace {

	if ( values.length === 0 ) {

		return undefined;

	} else if ( values.length > 1 ) {

		return ["{kind} expected at most one <text> value"];

	} else {

		const [value] = values;

		const stringTrace = validateLocaleString(value);
		const stringsTrace = validateLocaleStrings(value);

		// either arm accepts; otherwise prefer the structurally richer trace (one carrying a keyed record)

		return stringTrace === undefined || stringsTrace === undefined ? undefined
			: keyed(stringsTrace) ? stringsTrace
				: keyed(stringTrace) ? stringTrace
					: stringsTrace;

	}

}

/**
 * Validates the single-string-per-tag arm of a {@link Locale} placeholder.
 *
 * Accepts either a tag-range-keyed map of single string values — the single-string arm of a
 * localised property's {@link Locale} {@link Placeholders} — or a bare string, the coalesced scalar
 * placeholder a single-string-per-tag localised property reduces to under language negotiation.
 * Per-tag array values are rejected: those belong to the string-array arm, validated by
 * {@link validateLocaleStrings}. Keys must be basic language ranges (a sequence of subtags or the
 * standalone `*` wildcard); extended ranges such as `en-*` are not accepted, and any key that fails
 * `isTagRange` is reported as `invalid tag range`. A localised property carries no inline
 * {@link Selection}, so an operator-prefixed key is simply an invalid tag range. Template values are
 * placeholders, so string length and language constraints are
 * intentionally not enforced.
 *
 * @param value The template value to validate
 *
 * @returns A keyed trace of per-entry violations, or `undefined` when the value matches the
 *     single-string-per-tag arm
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc4647.html RFC 4647 - Matching of Language Tags}
 */
export function validateLocaleString(value: unknown): undefined | Trace {

	if ( isString(value) ) {

		// a bare string is the coalesced scalar placeholder for a single-string-per-tag localised property

		return undefined;

	} else if ( isObject(value) ) {

		return object(([k, v]: readonly [string, unknown]) =>
			!isTagRange(k) ? [{ [k]: ["invalid tag range"] }]
				: isString(v) ? undefined
					: [{ [k]: ["expected string value"] }]
		)(value);

	} else {

		return ["expected <text> value"];

	}

}

/**
 * Validates the string-array-per-tag arm of a {@link Locale} placeholder.
 *
 * Accepts either a tag-range-keyed map whose per-tag values are uniformly singleton string tuples —
 * the string-array arm of a localised property's {@link Locale} {@link Placeholders} — or a bare
 * single-element string array, the coalesced array placeholder an array-per-tag localised property
 * reduces to under language negotiation. Per-tag single string values are rejected: those belong to
 * the single-string arm, validated by {@link validateLocaleString}. Keys must be basic language ranges
 * (a sequence of subtags or the standalone `*` wildcard); extended ranges such as `en-*` are not
 * accepted, and any key that fails `isTagRange` is reported as `invalid tag range`. A localised
 * property carries no inline {@link Selection}, so an operator-prefixed key is simply an invalid tag
 * range. Template values are placeholders, so string length and language constraints are
 * intentionally not enforced.
 *
 * @param value The template value to validate
 *
 * @returns A keyed trace of per-entry violations, or `undefined` when the value matches the
 *     string-array-per-tag arm
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc4647.html RFC 4647 - Matching of Language Tags}
 */
export function validateLocaleStrings(value: unknown): undefined | Trace {

	if ( isArray(value, [isString]) ) {

		// a bare single-element string array is the coalesced array placeholder for an array-per-tag property

		return undefined;

	} else if ( isObject(value) ) {

		return object(([k, v]: readonly [string, unknown]) =>
			!isTagRange(k) ? [{ [k]: ["invalid tag range"] }]
				: isArray(v, [isString]) ? undefined
					: [{ [k]: ["expected singleton string tuple"] }]
		)(value);

	} else {

		return ["expected <text> value"];

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Reports whether a trace carries a keyed record rather than only bare messages.
 */
function keyed(trace: Trace): boolean {
	return trace.some(item => !isString(item));
}
