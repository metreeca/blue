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

import { describe, expect, it } from "vitest";
import {
	checkDictionary,
	deriveDictionary,
	mergeDictionary,
	narrowsDictionary,
	validateDictionary,
	validateDictionaryString,
	validateDictionaryStrings,
	validateLocales,
	validateLocalesString,
	validateLocalesStrings
} from "./dictionary.core.js";
import { dictionary } from "./dictionary.js";
import { string } from "./string.js";


describe("factories", () => {

	describe("dictionary", () => {

		describe("shape", () => {

			it("returns a shape with kind 'dictionary'", async () => {

				expect(dictionary().kind).toBe("dictionary");
				expect(dictionary({ "*": "example" }).kind).toBe("dictionary");
				expect(dictionary({ minLength: 1 }).kind).toBe("dictionary");

			});

			it.each<[string, () => Record<string, unknown>, Record<string, unknown>]>([
				["no arguments", () => dictionary().model, { "*": "" }],
				["empty constraints", () => dictionary({}).model, { "*": "" }],
				["a scalar model argument", () => dictionary({ "*": "example" }).model, { "*": "example" }],
				["a multi-tag model argument", () => dictionary({ en: "hello", fr: "bonjour" }).model, {
					en: "hello",
					fr: "bonjour"
				}],
				["a languageIn constraint", () => dictionary({ languageIn: ["en", "it"] }).model, { en: "", it: "" }]
			])("resolves model from %s", async (_label, model, expected) => {

				expect(model()).toEqual(expected);

			});

			it("returns an immutable shape", async () => {

				const shape = dictionary();

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).model = { "*": "test" }).toThrow();

			});

		});

		describe("model validation", () => {

			it("rejects the banned @none key", async () => {
				expect(() => dictionary({ "@none": "x" })).toThrow();
			});

			it("rejects an invalid tag-range key", async () => {
				expect(() => dictionary({ "123": "y" })).toThrow();
			});

			it("rejects a model mixing scalar and array values", async () => {
				expect(() => dictionary({ en: "x", fr: ["y"] } as any)).toThrow();
			});

			it("accepts und and zxx tags", async () => {
				expect(dictionary({ und: "", zxx: "" }).model).toEqual({ und: "", zxx: "" });
			});

		});

	});

	describe.each([

		["dictionary", dictionary]

	] as const)("%s constraints", (_name, factory) => {

		describe("minLength", () => {

			it("accepts constraint", async () => {

				expect(factory({ minLength: 1 } as any).minLength).toBe(1);

			});

		});

		describe("maxLength", () => {

			it("accepts constraint", async () => {

				expect(factory({ maxLength: 100 } as any).maxLength).toBe(100);

			});

		});

		describe("languageIn", () => {

			it("accepts constraint", async () => {

				expect(factory({ languageIn: ["en", "fr"] } as any).languageIn).toEqual(["en", "fr"]);

			});

		});

		describe("combined", () => {

			it("accepts multiple constraints", async () => {

				const shape = factory({ minLength: 1, maxLength: 100, languageIn: ["en", "fr"] } as any);

				expect(shape.minLength).toBe(1);
				expect(shape.maxLength).toBe(100);
				expect(shape.languageIn).toEqual(["en", "fr"]);

			});

			it("includes only provided entries", async () => {

				expect(Object.keys(factory()).sort()).toEqual(["kind", "model"]);

			});

		});

	});

});

// navigate an array-shaped trace by key path, returning the value at the path or undefined

function at(trace: unknown, ...path: readonly string[]): unknown {
	return path.reduce<unknown>((node, key) => {
		const record = Array.isArray(node) ? node.find(item => item !== null && typeof item === "object") : node;
		return record === null || typeof record !== "object" ? undefined : (record as Record<string, unknown>)[key];
	}, trace);
}


describe("operators", () => {

	describe("checkDictionary", () => {

		it("returns undefined for consistent constraints", async () => {

			expect(checkDictionary({ minLength: 1, maxLength: 10 })).toBeUndefined();

		});

		it("returns undefined when minLength equals maxLength", async () => {

			expect(checkDictionary({ minLength: 5, maxLength: 5 })).toBeUndefined();

		});

		it("returns undefined when only minLength is provided", async () => {

			expect(checkDictionary({ minLength: 5 })).toBeUndefined();

		});

		it("returns undefined when only maxLength is provided", async () => {

			expect(checkDictionary({ maxLength: 5 })).toBeUndefined();

		});

		it("returns undefined when no constraints are provided", async () => {

			expect(checkDictionary({})).toBeUndefined();

		});

		it("returns trace when minLength > maxLength", async () => {

			const trace = checkDictionary({ minLength: 10, maxLength: 5 });

			expect(trace).toContainEqual(expect.stringContaining("{minLength/maxLength}"));

		});

		describe("model", () => {

			it("rejects plain string (no bare-string shorthand)", async () => {

				expect(at(checkDictionary({ model: "hello" } as any), "{model}")).toBeDefined();
				expect(at(checkDictionary({ model: "" } as any), "{model}")).toBeDefined();

			});

			it("rejects singleton string array (no bare-array shorthand)", async () => {

				expect(at(checkDictionary({ model: ["hello"] } as any), "{model}")).toBeDefined();

			});

			it("rejects multi-element string array", async () => {

				expect(at(checkDictionary({ model: ["hello", "world"] } as any), "{model}")).toBeDefined();

			});

			it("accepts object with string values", async () => {

				expect(checkDictionary({ model: { "en": "hello" } } as any)).toBeUndefined();

			});

			it("accepts object with singleton string array values", async () => {

				expect(checkDictionary({ model: { "en": ["hello"] } } as any)).toBeUndefined();

			});

			it("rejects object with multi-element string array values", async () => {

				const trace = checkDictionary({ model: { "en": ["hello", "world"] } } as any);

				expect(at(trace, "{model}", "en")).toBeDefined();

			});

			it("accepts object with valid tag range keys", async () => {

				expect(checkDictionary({ model: { "*": ["hello"] } } as any)).toBeUndefined();
				expect(checkDictionary({ model: { "en-US": ["hello"] } } as any)).toBeUndefined();

			});

			it("accepts empty object", async () => {

				expect(checkDictionary({ model: {} } as any)).toBeUndefined();

			});

			it("rejects non-string non-array non-object value", async () => {

				expect(at(checkDictionary({ model: 42 } as any), "{model}")).toBeDefined();
				expect(at(checkDictionary({ model: true } as any), "{model}")).toBeDefined();
				expect(at(checkDictionary({ model: null } as any), "{model}")).toBeDefined();

			});

			it("reports invalid tag range keys", async () => {

				const trace = checkDictionary({ model: { "123": ["hello"] } } as any);

				expect(at(trace, "{model}", "123")).toBeDefined();

				// extended ranges (RFC 4647 § 2.2) are not basic ranges and are rejected

				const extended = checkDictionary({ model: { "en-*": ["hello"] } } as any);

				expect(at(extended, "{model}", "en-*")).toBeDefined();

			});

			it("reports non-string non-array values", async () => {

				const trace = checkDictionary({ model: { en: 42 } } as any);

				expect(at(trace, "{model}", "en")).toBeDefined();

			});

			it("reports only invalid entries in mixed object", async () => {

				const trace = checkDictionary({ model: { en: ["hello"], "123": ["bad"], fr: 42 } } as any);

				expect(at(trace, "{model}", "123")).toBeDefined();
				expect(at(trace, "{model}", "fr")).toBeDefined();
				expect(at(trace, "{model}", "en")).toBeUndefined();

			});

			it("rejects mixed scalar and singleton-array values across tag-range keys", async () => {

				// qest's Locales type defines `{ TagRange: string }` and `{ TagRange: [string] }` as
				// distinct arms; a single map with both shapes satisfies neither

				expect(at(checkDictionary({
					model: {
						en: "hello",
						fr: ["bonjour"]
					}
				} as any), "{model}")).toBeDefined();

			});

			describe("selection operator keys rejected", () => {

				// localised entries carry no inline Selection — Locales is its own Placeholders
				// arm, not a Locales & Selection branch — so an operator-prefixed key is just an
				// invalid tag range

				it("reports a selection key alongside tag-range keys as an invalid tag range", async () => {

					const trace = checkDictionary({ model: { en: ["hi"], ">=length:": 5 } } as any);

					expect(at(trace, "{model}", ">=length:")).toBeDefined();
					expect(at(trace, "{model}", "en")).toBeUndefined();

				});

				it("rejects an object with only selection keys", async () => {

					expect(at(checkDictionary({ model: { ">=length:": 5 } } as any), "{model}")).toBeDefined();

				});

				it.each([
					["keyword search", { en: ["hi"], "~": "foo" }],
					["sort ordering", { en: ["hi"], "^": "asc" }],
					["pagination offset", { en: ["hi"], ":": 0 }],
					["pagination limit", { en: ["hi"], "#": 10 }]
				])("rejects %s selection key", async (_label, value) => {

					expect(at(checkDictionary({ model: value } as any), "{model}")).toBeDefined();

				});

			});

		});

	});

	describe("narrowsDictionary", () => {

		it("accepts a child that tightens minLength", async () => {

			expect(narrowsDictionary(dictionary({ minLength: 5 }), dictionary())).toBeUndefined();

		});

		it("rejects a child that widens minLength", async () => {

			expect(narrowsDictionary(dictionary({ minLength: 1 }), dictionary({ minLength: 5 }))).toBeDefined();

		});

		it("rejects a child with a disjoint languageIn", async () => {

			expect(narrowsDictionary(dictionary({ languageIn: ["en"] }), dictionary({ languageIn: ["fr"] }))).toBeDefined();

		});

		it("accepts a child narrowing languageIn", async () => {

			expect(narrowsDictionary(
				dictionary({ languageIn: ["en"] }),
				dictionary({ languageIn: ["en", "fr"] })
			)).toBeUndefined();

		});

		it("rejects a child widening languageIn", async () => {

			// a tag the parent omits would be intersected away, leaving the state wider than the shape admits

			expect(narrowsDictionary(
				dictionary({ languageIn: ["en", "fr"] }),
				dictionary({ languageIn: ["en"] })
			)).toBeDefined();

		});

	});

	describe("mergeDictionary", () => {

		describe.each([

			["mergeDictionary (scalar)", mergeDictionary, dictionary, "dictionary", { "*": "" },
				{ target: { en: "hello", fr: "bonjour" }, source: { en: "hello", fr: "bonjour" } },
				{ equal: { en: "hello", fr: "bonjour" } },
				{ target: { en: "hello" }, source: { fr: "bonjour" }, expected: { en: "hello" } }
			],

			["mergeDictionary (array)", mergeDictionary, (constraints: any = {}) => ({
				...dictionary(),
				...constraints
			}), "dictionary", { "*": "" },
				{
					target: { model: { en: ["hello"], fr: ["bonjour"] } },
					source: { model: { en: ["hello"], fr: ["bonjour"] } }
				},
				{ equal: { en: ["hello"], fr: ["bonjour"] } },
				{
					target: { model: { en: ["hello"] } },
					source: { model: { fr: ["bonjour"] } },
					expected: { en: ["hello"] }
				}
			]

		] as const)("%s", (_name, merge, factory, kind, defaultModel, nonDefaultModels, equalModel, differentModels) => {

			describe("kind", () => {

				it(`preserves kind as '${kind}'`, async () => {

					const merged = merge(factory() as any, factory() as any);

					expect(merged.kind).toBe(kind);

				});

			});

			describe("model", () => {

				it("merges shapes with equal models", async () => {

					const merged = merge(factory() as any, factory() as any);

					expect(merged.model).toEqual(defaultModel);

				});

				it("merges shapes with equal non-default models", async () => {

					const merged = merge(
						factory(nonDefaultModels.target as any) as any,
						factory(nonDefaultModels.source as any) as any
					);

					expect(merged.model).toEqual(equalModel.equal);

				});

				it("accepts child model overriding parent model", async () => {

					const merged = merge(
						factory(differentModels.target as any) as any,
						factory(differentModels.source as any) as any
					);

					expect(merged.model).toEqual(differentModels.expected);

				});

			});

			describe("minLength", () => {

				it("inherits source minLength when target has none", async () => {

					const merged = merge(factory() as any, factory({ minLength: 5 } as any) as any);

					expect(merged.minLength).toBe(5);

				});

				it("keeps target minLength when source has none", async () => {

					const merged = merge(factory({ minLength: 5 } as any) as any, factory() as any);

					expect(merged.minLength).toBe(5);

				});

				it("accepts target minLength >= source minLength", async () => {

					const merged = merge(factory({ minLength: 10 } as any) as any, factory({ minLength: 5 } as any) as any);

					expect(merged.minLength).toBe(10);

				});

				it("rejects target minLength < source minLength", async () => {

					expect(() => merge(
						factory({ minLength: 3 } as any) as any,
						factory({ minLength: 5 } as any) as any
					)).toThrow(RangeError);

				});

			});

			describe("maxLength", () => {

				it("inherits source maxLength when target has none", async () => {

					const merged = merge(factory() as any, factory({ maxLength: 100 } as any) as any);

					expect(merged.maxLength).toBe(100);

				});

				it("keeps target maxLength when source has none", async () => {

					const merged = merge(factory({ maxLength: 100 } as any) as any, factory() as any);

					expect(merged.maxLength).toBe(100);

				});

				it("accepts target maxLength <= source maxLength", async () => {

					const merged = merge(factory({ maxLength: 50 } as any) as any, factory({ maxLength: 100 } as any) as any);

					expect(merged.maxLength).toBe(50);

				});

				it("rejects target maxLength > source maxLength", async () => {

					expect(() => merge(
						factory({ maxLength: 200 } as any) as any,
						factory({ maxLength: 100 } as any) as any
					)).toThrow(RangeError);

				});

			});

			describe("languageIn", () => {

				it("inherits source languageIn when target has none", async () => {

					const merged = merge(factory() as any, factory({ languageIn: ["en", "fr"] } as any) as any);

					expect(merged.languageIn).toEqual(["en", "fr"]);

				});

				it("keeps target languageIn when source has none", async () => {

					const merged = merge(factory({ languageIn: ["en", "fr"] } as any) as any, factory() as any);

					expect(merged.languageIn).toEqual(["en", "fr"]);

				});

				it("keeps a target languageIn narrowing source", async () => {

					const merged = merge(
						factory({ languageIn: ["en", "de"] } as any) as any,
						factory({ languageIn: ["en", "fr", "de"] } as any) as any
					);

					expect(merged.languageIn).toEqual(["en", "de"]);

				});

				it("rejects a target languageIn widening source", async () => {

					expect(() => merge(
						factory({ languageIn: ["en", "fr", "de"] } as any) as any,
						factory({ languageIn: ["en", "de", "it"] } as any) as any
					)).toThrow(RangeError);

				});

				it("rejects disjoint sets", async () => {

					expect(() => merge(
						factory({ languageIn: ["en"] } as any) as any,
						factory({ languageIn: ["fr"] } as any) as any
					)).toThrow(RangeError);

				});

			});

			describe("post-merge validation", () => {

				it("rejects merged minLength > maxLength", async () => {

					expect(() => merge(
						factory({ minLength: 10 } as any) as any,
						factory({ maxLength: 5 } as any) as any
					)).toThrow(RangeError);

				});

			});

		});

	});

	describe("deriveDictionary", () => {

		it("derives the wildcard placeholder when no language constraint is set", async () => {

			expect(deriveDictionary({})).toEqual({ "*": "" });

		});

		it("derives an empty placeholder keyed by every languageIn range", async () => {

			expect(deriveDictionary({ languageIn: ["en", "it"] })).toEqual({ en: "", it: "" });

		});

	});

});

describe("validators", () => {

	describe("validateDictionary", () => {

		it("propagates per-tag detail when both arms reject the value", async () => {

			// `{ en: 42 }` fails the scalar arm (en value is not a string) and the array arm (en
			// value is not a string array); the merged trace should preserve the per-tag detail
			// rather than returning a single top-level kind error

			const trace = validateDictionary([{ en: 42 }], dictionary());

			expect(trace).toBeDefined();
			expect(JSON.stringify(trace)).toContain("en");

		});

		// @none is banned (use und/zxx); a map is uniformly scalar or uniformly array

		it("rejects the banned @none tag", async () => {

			const trace = validateDictionary([{ "@none": "x" }], dictionary());

			expect(trace).toBeDefined();
			expect(JSON.stringify(trace)).toContain("@none");

		});

		it("accepts the und tag", async () => {
			expect(validateDictionary([{ und: "Acme" }], dictionary())).toBeUndefined();
		});

		it("accepts the zxx tag", async () => {
			expect(validateDictionary([{ zxx: "H2O" }], dictionary())).toBeUndefined();
		});

		it("rejects a map mixing scalar and array values", async () => {
			expect(validateDictionary([{ en: "x", fr: ["y"] }], dictionary())).toBeDefined();
		});

		it("accepts a uniform scalar map", async () => {
			expect(validateDictionary([{ en: "x", fr: "y" }], dictionary())).toBeUndefined();
		});

		it("accepts a uniform array map", async () => {
			expect(validateDictionary([{ en: ["x"], fr: ["y"] }], dictionary())).toBeUndefined();
		});

	});

	describe("validateDictionaryString", () => {

		describe("type filtering", () => {

			it("returns undefined for valid local values", async () => {

				expect(validateDictionaryString([{ "en": "hello" }], dictionary())).toBeUndefined();

			});

			it("rejects plain string (no und shorthand)", async () => {

				expect(validateDictionaryString(["hello"], dictionary())).toContainEqual(expect.stringContaining("{kind}"));

			});

			it("returns undefined for empty values array", async () => {

				expect(validateDictionaryString([], dictionary())).toBeUndefined();

			});

			it.each<[string, readonly unknown[]]>([
				["a single non-object non-string value", [42]],
				["multiple non-object non-string values", [42, true]],
				["mixed valid and non-object values", [{ "en": "hello" }, 42]]
			])("returns a kind trace for %s", async (_label, values) => {

				expect(validateDictionaryString(values, dictionary())).toContainEqual(expect.stringContaining("{kind}"));

			});

			it("rejects multiple object values", async () => {

				expect(validateDictionaryString([{ "en": "hello" }, { "fr": "bonjour" }], dictionary())).toBeDefined();

			});

		});

		describe("structural validation", () => {

			it("returns undefined for empty object", async () => {

				expect(validateDictionaryString([{}], dictionary())).toBeUndefined();

			});

			it("returns trace for object with invalid tag key", async () => {

				const result = validateDictionaryString([{ "123": "hello" }], dictionary());

				expect(result).toBeDefined();
				expect(at(result, "123")).toBeDefined();

			});

			it("returns trace for object with non-string value", async () => {

				const result = validateDictionaryString([{ en: 42 }], dictionary());

				expect(result).toBeDefined();
				expect(at(result, "en")).toBeDefined();

			});

			it("reports only invalid entries in mixed object", async () => {

				const result = validateDictionaryString([{ en: "hello", "123": "bad tag", fr: 42 }], dictionary());

				expect(result).toBeDefined();
				expect(at(result, "123")).toBeDefined();
				expect(at(result, "fr")).toBeDefined();
				expect(at(result, "en")).toBeUndefined();

			});

			it("validates structural issues alongside constraint violations", async () => {

				const result = validateDictionaryString([{ en: "hi", "123": "bad" }], dictionary({ minLength: 5 }));

				expect(result).toBeDefined();
				expect(at(result, "123")).toBeDefined(); // invalid tag
				expect(at(result, "en")).toBeDefined(); // valid tag but fails minLength

			});

			it("does not apply constraints to structurally invalid entries", async () => {

				const result = validateDictionaryString([{ en: 42 }], dictionary({ minLength: 5 }));

				// structural error, not a constraint error

				expect(at(result, "en")).toEqual(["expected string value"]);

			});

		});

		describe("minLength constraint", () => {

			it("returns undefined when all strings meet minimum length", async () => {

				expect(validateDictionaryString([{
					en: "hello",
					fr: "bonjour"
				}], dictionary({ minLength: 3 }))).toBeUndefined();

			});

			it("returns trace when any string is below minimum length", async () => {

				const result = validateDictionaryString([{ en: "hi", fr: "bonjour" }], dictionary({ minLength: 5 }));

				expect(at(result, "en")).toBeDefined();
				expect(at(result, "fr")).toBeUndefined();

			});

			it("returns trace for empty string when minLength > 0", async () => {

				expect(at(validateDictionaryString([{ en: "" }], dictionary({ minLength: 1 })), "en")).toBeDefined();

			});

		});

		describe("maxLength constraint", () => {

			it("returns undefined when all strings are within maximum length", async () => {

				expect(validateDictionaryString([{
					en: "hello",
					fr: "bonjour"
				}], dictionary({ maxLength: 10 }))).toBeUndefined();

			});

			it("returns trace when any string exceeds maximum length", async () => {

				const result = validateDictionaryString([{
					en: "hello",
					fr: "bonjour"
				}], dictionary({ maxLength: 5 }));

				expect(at(result, "fr")).toBeDefined();

			});

		});

		describe("languageIn constraint", () => {

			it("returns undefined when all tags match allowed languages", async () => {

				expect(validateDictionaryString([{
					en: "hello",
					fr: "bonjour"
				}], dictionary({ languageIn: ["en", "fr"] }))).toBeUndefined();

			});

			it("returns trace when tag is not in allowed languages", async () => {

				const result = validateDictionaryString([{
					en: "hello",
					de: "hallo"
				}], dictionary({ languageIn: ["en", "fr"] }));

				expect(at(result, "de")).toBeDefined();
				expect(at(result, "en")).toBeUndefined();

			});

			it("handles language range matching", async () => {

				const shape = dictionary({ languageIn: ["en"] });

				expect(validateDictionaryString([{ "en-US": "color" }], shape)).toBeUndefined();
				expect(validateDictionaryString([{ "en-GB": "colour" }], shape)).toBeUndefined();

			});

			it("returns trace for base language when only subtag allowed", async () => {

				expect(at(validateDictionaryString([{ en: "hello" }], dictionary({ languageIn: ["en-US"] })), "en")).toBeDefined();

			});

		});

		describe("combined constraints", () => {

			it("returns undefined when all constraints are satisfied", async () => {

				expect(validateDictionaryString([{ en: "hello", fr: "bonjour" }], dictionary({
					minLength: 2,
					maxLength: 10,
					languageIn: ["en", "fr"]
				}))).toBeUndefined();

			});

			it("returns trace when length constraint fails", async () => {

				const result = validateDictionaryString([{ en: "hello" }], dictionary({
					minLength: 10,
					languageIn: ["en"]
				}));

				expect(at(result, "en")).toBeDefined();

			});

			it("returns trace when language constraint fails", async () => {

				const result = validateDictionaryString([{ fr: "bonjour" }], dictionary({
					minLength: 2,
					languageIn: ["en"]
				}));

				expect(at(result, "fr")).toBeDefined();

			});

		});

		describe("plain-string rejection", () => {

			it("rejects plain string values (no und shorthand)", async () => {

				expect(validateDictionaryString(["hello"], dictionary())).toContainEqual(expect.stringContaining("{kind}"));

			});

			it("rejects empty plain string values", async () => {

				expect(validateDictionaryString([""], dictionary())).toContainEqual(expect.stringContaining("{kind}"));

			});

		});

	});

	describe("validateDictionaryStrings", () => {

		describe("type filtering", () => {

			it("returns undefined for valid locals values", async () => {

				expect(validateDictionaryStrings([{ "en": ["hello"] }], dictionary())).toBeUndefined();

			});

			it("rejects plain string array (no und shorthand)", async () => {

				expect(validateDictionaryStrings([["hello"]], dictionary())).toContainEqual(expect.stringContaining("{kind}"));

			});

			it("returns undefined for empty values array", async () => {

				expect(validateDictionaryStrings([], dictionary())).toBeUndefined();

			});

			it.each<[string, readonly unknown[]]>([
				["a single non-object non-array value", [42]],
				["multiple non-object non-array values", [42, true]],
				["mixed valid and non-object values", [{ "en": ["hello"] }, 42]]
			])("returns a kind trace for %s", async (_label, values) => {

				expect(validateDictionaryStrings(values, dictionary())).toContainEqual(expect.stringContaining("{kind}"));

			});

			it("accepts scalar string value for array-model shape", async () => {

				expect(validateDictionary([{ "en": "hello" }], dictionary())).toBeUndefined();

			});

			it("rejects multiple object values", async () => {

				expect(validateDictionaryStrings([{ "en": ["hello"] }, { "fr": ["bonjour"] }], dictionary())).toBeDefined();

			});

		});

		describe("structural validation", () => {

			it("returns undefined for empty object", async () => {

				expect(validateDictionaryStrings([{}], dictionary())).toBeUndefined();

			});

			it("returns trace for object with invalid tag key", async () => {

				const result = validateDictionaryStrings([{ "123": ["hello"] }], dictionary());

				expect(result).toBeDefined();
				expect(at(result, "123")).toBeDefined();

			});

			it("returns trace for object with non-string non-array value", async () => {

				const result = validateDictionaryStrings([{ en: 42 }], dictionary());

				expect(result).toBeDefined();
				expect(at(result, "en")).toBeDefined();

			});

			it("reports only invalid entries in mixed object", async () => {

				const result = validateDictionaryStrings([{ en: ["hello"], "123": ["bad tag"], fr: 42 }], dictionary());

				expect(result).toBeDefined();
				expect(at(result, "123")).toBeDefined();
				expect(at(result, "fr")).toBeDefined();
				expect(at(result, "en")).toBeUndefined();

			});

			it("does not apply constraints to structurally invalid entries", async () => {

				const result = validateDictionaryStrings([{ en: 42 }], { ...dictionary(), minLength: 5 } as any);

				// structural error, not a constraint error

				expect(at(result, "en")).toEqual(["expected string array value"]);

			});

		});

		describe("minLength constraint", () => {

			it("returns undefined when all strings meet minimum length", async () => {

				expect(validateDictionaryStrings([{
					en: ["hello", "world"],
					fr: ["bonjour"]
				}], { ...dictionary(), minLength: 3 } as any)).toBeUndefined();

			});

			it("returns trace when any string is below minimum length", async () => {

				const result = validateDictionaryStrings([{ en: ["hello", "hi"] }], {
					...dictionary(),
					minLength: 5
				} as any);

				expect(at(result, "en")).toBeDefined();

			});

		});

		describe("maxLength constraint", () => {

			it("returns undefined when all strings are within maximum length", async () => {

				expect(validateDictionaryStrings([{
					en: ["hello", "hi"],
					fr: ["bonjour"]
				}], { ...dictionary(), maxLength: 10 } as any)).toBeUndefined();

			});

			it("returns trace when any string exceeds maximum length", async () => {

				const result = validateDictionaryStrings([{ en: ["hello", "greetings"] }], {
					...dictionary(),
					maxLength: 5
				} as any);

				expect(at(result, "en")).toBeDefined();

			});

		});

		describe("languageIn constraint", () => {

			it("returns undefined when all tags match allowed languages", async () => {

				expect(validateDictionaryStrings([{
					en: ["hello"],
					fr: ["bonjour"]
				}], { ...dictionary(), languageIn: ["en", "fr"] } as any)).toBeUndefined();

			});

			it("returns trace when tag is not in allowed languages", async () => {

				const result = validateDictionaryStrings([{
					en: ["hello"],
					de: ["hallo"]
				}], { ...dictionary(), languageIn: ["en", "fr"] } as any);

				expect(at(result, "de")).toBeDefined();
				expect(at(result, "en")).toBeUndefined();

			});

			it("handles language range matching", async () => {

				expect(validateDictionaryStrings([{ "en-US": ["color"] }], {
					...dictionary(),
					languageIn: ["en"]
				} as any)).toBeUndefined();

			});

		});

		describe("combined constraints", () => {

			it("returns undefined when all constraints are satisfied", async () => {

				expect(validateDictionaryStrings([{ en: ["hello", "world"], fr: ["bonjour"] }], {
					...dictionary(),
					minLength: 2,
					maxLength: 10,
					languageIn: ["en", "fr"]
				} as any)).toBeUndefined();

			});

			it("returns trace when any constraint fails", async () => {

				const result = validateDictionaryStrings([{ en: ["hello"] }], {
					...dictionary(),
					minLength: 10,
					languageIn: ["en"]
				} as any);

				expect(at(result, "en")).toBeDefined();

			});

		});

		describe("plain-string-array rejection", () => {

			it("rejects plain string array values (no und shorthand)", async () => {

				expect(validateDictionaryStrings([["hello", "world"]], {
					...dictionary(),
					minLength: 3
				} as any)).toContainEqual(expect.stringContaining("{kind}"));

			});

			it("rejects single-element plain string array", async () => {

				expect(validateDictionaryStrings([["hello"]], dictionary())).toContainEqual(expect.stringContaining("{kind}"));

			});

		});

		describe("per-value errors", () => {

			it.each<[string, readonly string[], Record<string, number>]>([
				["multiple failing minLength texts", ["ab", "c", "d"], { minLength: 3 }],
				["maxLength violations", ["toolong", "alsotoolong"], { maxLength: 3 }],
				["only failing texts", ["ab", "hello", "c"], { minLength: 3 }]
			])("keys per-element length violations for %s", async (_label, values, constraints) => {

				const result = validateDictionaryStrings([{ en: values }], { ...dictionary(), ...constraints } as any);

				expect(JSON.stringify(at(result, "en"))).toContain("{length}");

			});

		});

	});


	describe("validateLocales", () => {

		it("returns undefined for an empty values array", async () => {
			expect(validateLocales([])).toBeUndefined();
		});

		it("rejects more than one value", async () => {
			expect(validateLocales(["a", "b"])).toBeDefined();
		});

		it("reports an arity violation under the kind key, as the dictionary arms do", async () => {
			expect(validateLocales(["a", "b"])).toEqual(["{kind} expected at most one <dictionary> value"]);
		});

		it("accepts a bare string (coalesced scalar placeholder)", async () => {
			expect(validateLocales(["hello"])).toBeUndefined();
			expect(validateLocales([""])).toBeUndefined();
		});

		it("accepts a bare singleton string array (coalesced array placeholder)", async () => {
			expect(validateLocales([["hello"]])).toBeUndefined();
		});

		it("accepts a single-string-per-tag map", async () => {
			expect(validateLocales([{ en: "hello" }])).toBeUndefined();
			expect(validateLocales([{ "*": "hello" }])).toBeUndefined();
		});

		it("accepts an array-per-tag map", async () => {
			expect(validateLocales([{ en: ["hello"] }])).toBeUndefined();
		});

		it("rejects a non-dictionary scalar", async () => {
			expect(validateLocales([42])).toBeDefined();
			expect(validateLocales([true])).toBeDefined();
		});

		it("propagates per-tag detail when both arms reject the value", async () => {

			const trace = validateLocales([{ en: 42 }]);

			expect(trace).toBeDefined();
			expect(JSON.stringify(trace)).toContain("en");

		});

		it("reports an invalid tag range", async () => {

			const trace = validateLocales([{ "123": "hello" }]);

			expect(trace).toBeDefined();
			expect(JSON.stringify(trace)).toContain("123");

		});

	});

	describe("validateLocalesString", () => {

		it("accepts bare string as coalesced scalar placeholder", async () => {

			expect(validateLocalesString("")).toBeUndefined();
			expect(validateLocalesString("hello")).toBeUndefined();

		});

		it("accepts object with valid tag range keys", async () => {

			expect(validateLocalesString({ "en": "hello" })).toBeUndefined();
			expect(validateLocalesString({ "*": "hello" })).toBeUndefined();
			expect(validateLocalesString({ "en-US": "hello" })).toBeUndefined();

		});

		it("accepts empty object", async () => {

			expect(validateLocalesString({})).toBeUndefined();

		});

		it("rejects non-string non-object value", async () => {

			expect(validateLocalesString(42)).toBeDefined();
			expect(validateLocalesString(true)).toBeDefined();
			expect(validateLocalesString(null)).toBeDefined();

		});

		it("rejects array value", async () => {

			expect(validateLocalesString(["hello"])).toBeDefined();

		});

		it("reports invalid tag range keys", async () => {

			const result = validateLocalesString({ "123": "hello" });

			expect(result).toBeDefined();
			expect(at(result, "123")).toBeDefined();

			// extended ranges (RFC 4647 § 2.2) are not basic ranges and are rejected

			const extended = validateLocalesString({ "en-*": "hello" });

			expect(extended).toBeDefined();
			expect(at(extended, "en-*")).toBeDefined();

		});

		it("reports non-string values", async () => {

			const result = validateLocalesString({ en: 42 });

			expect(result).toBeDefined();
			expect(at(result, "en")).toBeDefined();

		});

		it("reports only invalid entries in mixed object", async () => {

			const result = validateLocalesString({ en: "hello", "123": "bad", fr: 42 });

			expect(result).toBeDefined();
			expect(at(result, "123")).toBeDefined();
			expect(at(result, "fr")).toBeDefined();
			expect(at(result, "en")).toBeUndefined();

		});

		describe("selection operator keys rejected", () => {

			// localised entries carry no inline Selection — Locales is its own Placeholders
			// arm, not a Locales & Selection branch — so an operator-prefixed key is just an
			// invalid tag range

			it("reports a selection key alongside tag-range keys as an invalid tag range", async () => {

				const result = validateLocalesString({ en: "hi", ">=length:": 5 });

				expect(at(result, ">=length:")).toBeDefined();
				expect(at(result, "en")).toBeUndefined();

			});

			it("rejects an object with only selection keys", async () => {

				expect(validateLocalesString({ ">=length:": 5 })).toBeDefined();

			});

			it.each([
				["keyword search", { en: "hi", "~": "foo" }],
				["sort ordering", { en: "hi", "^": "asc" }],
				["pagination offset", { en: "hi", ":": 0 }],
				["pagination limit", { en: "hi", "#": 10 }]
			])("rejects %s selection key", async (_label, value) => {

				expect(validateLocalesString(value)).toBeDefined();

			});

		});

	});

	describe("validateLocalesStrings", () => {

		it("rejects plain string (no bare-string shorthand)", async () => {

			expect(validateLocalesStrings("hello")).toBeDefined();
			expect(validateLocalesStrings("")).toBeDefined();

		});

		it("accepts bare singleton array as coalesced array placeholder", async () => {

			expect(validateLocalesStrings(["hello"])).toBeUndefined();
			expect(validateLocalesStrings([""])).toBeUndefined();

		});

		it("rejects bare multi-element array", async () => {

			expect(validateLocalesStrings(["hello", "world"])).toBeDefined();

		});

		it("accepts object with singleton-tuple tag values", async () => {

			expect(validateLocalesStrings({ "en": ["hello"] })).toBeUndefined();
			expect(validateLocalesStrings({ "*": ["hello"] })).toBeUndefined();
			expect(validateLocalesStrings({ "en-US": ["hello"] })).toBeUndefined();

		});

		it("rejects single-string tag values (the single-string arm)", async () => {

			const result = validateLocalesStrings({ "en": "hello" });

			expect(result).toBeDefined();
			expect(at(result, "en")).toBeDefined();

		});

		it("rejects multi-element tuple tag values", async () => {

			const result = validateLocalesStrings({ "en": ["hello", "world"] });

			expect(result).toBeDefined();
			expect(at(result, "en")).toBeDefined();

		});

		it("accepts empty object", async () => {

			expect(validateLocalesStrings({})).toBeUndefined();

		});

		it("rejects non-object value", async () => {

			expect(validateLocalesStrings(42)).toBeDefined();
			expect(validateLocalesStrings(true)).toBeDefined();
			expect(validateLocalesStrings(null)).toBeDefined();

		});

		it("reports invalid tag range keys", async () => {

			const result = validateLocalesStrings({ "123": ["hello"] });

			expect(result).toBeDefined();
			expect(at(result, "123")).toBeDefined();

			// extended ranges (RFC 4647 § 2.2) are not basic ranges and are rejected

			const extended = validateLocalesStrings({ "en-*": ["hello"] });

			expect(extended).toBeDefined();
			expect(at(extended, "en-*")).toBeDefined();

		});

	});

});
