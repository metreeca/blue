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
import { string } from "./string.js";
import {
	checkText,
	deriveText,
	mergeText,
	narrowsText,
	validateLocaleString,
	validateLocaleStrings,
	validateText,
	validateTextString,
	validateTextStrings
} from "./text.core.js";
import { text } from "./text.js";


describe("factories", () => {

	describe("text", () => {

		describe("shape", () => {

			it("returns a shape with kind 'text'", async () => {

				expect(text().kind).toBe("text");
				expect(text({ "*": "example" }).kind).toBe("text");
				expect(text({ minLength: 1 }).kind).toBe("text");

			});

			it.each<[string, () => Record<string, unknown>, Record<string, unknown>]>([
				["no arguments", () => text().model, { "*": "" }],
				["empty constraints", () => text({}).model, { "*": "" }],
				["a scalar model argument", () => text({ "*": "example" }).model, { "*": "example" }],
				["a multi-tag model argument", () => text({ en: "hello", fr: "bonjour" }).model, {
					en: "hello",
					fr: "bonjour"
				}],
				["a languageIn constraint", () => text({ languageIn: ["en", "it"] }).model, { en: "", it: "" }]
			])("resolves model from %s", async (_label, model, expected) => {

				expect(model()).toEqual(expected);

			});

			it("returns an immutable shape", async () => {

				const shape = text();

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).model = { "*": "test" }).toThrow();

			});

		});

		describe("model validation", () => {

			it("rejects the banned @none key", async () => {
				expect(() => text({ "@none": "x" })).toThrow();
			});

			it("rejects an invalid tag-range key", async () => {
				expect(() => text({ "123": "y" })).toThrow();
			});

			it("rejects a model mixing scalar and array values", async () => {
				expect(() => text({ en: "x", fr: ["y"] } as any)).toThrow();
			});

			it("accepts und and zxx tags", async () => {
				expect(text({ und: "", zxx: "" }).model).toEqual({ und: "", zxx: "" });
			});

		});

	});

	describe.each([

		["text", text]

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

			it("includes only provided properties", async () => {

				expect(Object.keys(factory()).sort()).toEqual(["kind", "model"]);

			});

		});

	});

});

describe("operators", () => {

	describe("checkText", () => {

		it("returns undefined for consistent constraints", async () => {

			expect(checkText({ minLength: 1, maxLength: 10 })).toBeUndefined();

		});

		it("returns undefined when minLength equals maxLength", async () => {

			expect(checkText({ minLength: 5, maxLength: 5 })).toBeUndefined();

		});

		it("returns undefined when only minLength is provided", async () => {

			expect(checkText({ minLength: 5 })).toBeUndefined();

		});

		it("returns undefined when only maxLength is provided", async () => {

			expect(checkText({ maxLength: 5 })).toBeUndefined();

		});

		it("returns undefined when no constraints are provided", async () => {

			expect(checkText({})).toBeUndefined();

		});

		it("returns trace when minLength > maxLength", async () => {

			const trace = checkText({ minLength: 10, maxLength: 5 });

			expect(trace).toBeDefined();
			expect(trace).toHaveProperty("{minLength/maxLength}");

		});

		describe("model", () => {

			it("rejects plain string (no bare-string shorthand)", async () => {

				expect(checkText({ model: "hello" } as any)).toHaveProperty("{model}");
				expect(checkText({ model: "" } as any)).toHaveProperty("{model}");

			});

			it("rejects singleton string array (no bare-array shorthand)", async () => {

				expect(checkText({ model: ["hello"] } as any)).toHaveProperty("{model}");

			});

			it("rejects multi-element string array", async () => {

				expect(checkText({ model: ["hello", "world"] } as any)).toHaveProperty("{model}");

			});

			it("accepts object with string values", async () => {

				expect(checkText({ model: { "en": "hello" } } as any)).toBeUndefined();

			});

			it("accepts object with singleton string array values", async () => {

				expect(checkText({ model: { "en": ["hello"] } } as any)).toBeUndefined();

			});

			it("rejects object with multi-element string array values", async () => {

				const trace = checkText({ model: { "en": ["hello", "world"] } } as any);

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty(["{model}", "en"]);

			});

			it("accepts object with valid tag range keys", async () => {

				expect(checkText({ model: { "*": ["hello"] } } as any)).toBeUndefined();
				expect(checkText({ model: { "en-US": ["hello"] } } as any)).toBeUndefined();

			});

			it("accepts empty object", async () => {

				expect(checkText({ model: {} } as any)).toBeUndefined();

			});

			it("rejects non-string non-array non-object value", async () => {

				expect(checkText({ model: 42 } as any)).toHaveProperty("{model}");
				expect(checkText({ model: true } as any)).toHaveProperty("{model}");
				expect(checkText({ model: null } as any)).toHaveProperty("{model}");

			});

			it("reports invalid tag range keys", async () => {

				const trace = checkText({ model: { "123": ["hello"] } } as any);

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty(["{model}", "123"]);

				// extended ranges (RFC 4647 § 2.2) are not basic ranges and are rejected

				const extended = checkText({ model: { "en-*": ["hello"] } } as any);

				expect(extended).toBeDefined();
				expect(extended).toHaveProperty(["{model}", "en-*"]);

			});

			it("reports non-string non-array values", async () => {

				const trace = checkText({ model: { en: 42 } } as any);

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty(["{model}", "en"]);

			});

			it("reports only invalid entries in mixed object", async () => {

				const trace = checkText({ model: { en: ["hello"], "123": ["bad"], fr: 42 } } as any);

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty(["{model}", "123"]);
				expect(trace).toHaveProperty(["{model}", "fr"]);
				expect(trace).not.toHaveProperty(["{model}", "en"]);

			});

			it("rejects mixed scalar and singleton-array values across tag-range keys", async () => {

				// qest's Locale type defines `{ TagRange: string }` and `{ TagRange: [string] }` as
				// distinct arms; a single map with both shapes satisfies neither

				expect(checkText({ model: { en: "hello", fr: ["bonjour"] } } as any)).toHaveProperty("{model}");

			});

			describe("selection operator keys rejected", () => {

				// localised properties carry no inline Selection — Locale is its own Placeholders
				// arm, not a Locale & Selection branch — so an operator-prefixed key is just an
				// invalid tag range

				it("reports a selection key alongside tag-range keys as an invalid tag range", async () => {

					const trace = checkText({ model: { en: ["hi"], ">=length:": 5 } } as any);

					expect(trace).toHaveProperty(["{model}", ">=length:"]);
					expect(trace).not.toHaveProperty(["{model}", "en"]);

				});

				it("rejects an object with only selection keys", async () => {

					expect(checkText({ model: { ">=length:": 5 } } as any)).toHaveProperty("{model}");

				});

				it.each([
					["keyword search", { en: ["hi"], "~": "foo" }],
					["sort ordering", { en: ["hi"], "^": "asc" }],
					["pagination offset", { en: ["hi"], ":": 0 }],
					["pagination limit", { en: ["hi"], "#": 10 }]
				])("rejects %s selection key", async (_label, value) => {

					expect(checkText({ model: value } as any)).toHaveProperty("{model}");

				});

			});

		});

	});

	describe("narrowsText", () => {

		it("accepts a child that tightens minLength", async () => {

			expect(narrowsText(text({ minLength: 5 }), text())).toBeUndefined();

		});

		it("rejects a child that widens minLength", async () => {

			expect(narrowsText(text({ minLength: 1 }), text({ minLength: 5 }))).toBeDefined();

		});

		it("rejects a child with a disjoint languageIn", async () => {

			expect(narrowsText(text({ languageIn: ["en"] }), text({ languageIn: ["fr"] }))).toBeDefined();

		});

	});

	describe("mergeText", () => {

		describe.each([

			["mergeText (scalar)", mergeText, text, "text", { "*": "" },
				{ target: { en: "hello", fr: "bonjour" }, source: { en: "hello", fr: "bonjour" } },
				{ equal: { en: "hello", fr: "bonjour" } },
				{ target: { en: "hello" }, source: { fr: "bonjour" }, expected: { en: "hello" } }
			],

			["mergeText (array)", mergeText, (constraints: any = {}) => ({
				...text(),
				...constraints
			}), "text", { "*": "" },
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

				it("computes intersection of both languageIn", async () => {

					const merged = merge(
						factory({ languageIn: ["en", "fr", "de"] } as any) as any,
						factory({ languageIn: ["en", "de", "it"] } as any) as any
					);

					expect(merged.languageIn).toEqual(["en", "de"]);

				});

				it("rejects empty intersection", async () => {

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

	describe("deriveText", () => {

		it("derives the wildcard placeholder when no language constraint is set", async () => {

			expect(deriveText({})).toEqual({ "*": "" });

		});

		it("derives an empty placeholder keyed by every languageIn range", async () => {

			expect(deriveText({ languageIn: ["en", "it"] })).toEqual({ en: "", it: "" });

		});

	});

});

describe("validators", () => {

	describe("validateText", () => {

		it("propagates per-tag detail when both arms reject the value", async () => {

			// `{ en: 42 }` fails the scalar arm (en value is not a string) and the array arm (en
			// value is not a string array); the merged trace should preserve the per-tag detail
			// rather than returning a single top-level kind error

			const trace = validateText([{ en: 42 }], text());

			expect(trace).toBeDefined();
			expect(JSON.stringify(trace)).toContain("en");

		});

		// @none is banned (use und/zxx); a map is uniformly scalar or uniformly array

		it("rejects the banned @none tag", async () => {

			const trace = validateText([{ "@none": "x" }], text());

			expect(trace).toBeDefined();
			expect(JSON.stringify(trace)).toContain("@none");

		});

		it("accepts the und tag", async () => {
			expect(validateText([{ und: "Acme" }], text())).toBeUndefined();
		});

		it("accepts the zxx tag", async () => {
			expect(validateText([{ zxx: "H2O" }], text())).toBeUndefined();
		});

		it("rejects a map mixing scalar and array values", async () => {
			expect(validateText([{ en: "x", fr: ["y"] }], text())).toBeDefined();
		});

		it("accepts a uniform scalar map", async () => {
			expect(validateText([{ en: "x", fr: "y" }], text())).toBeUndefined();
		});

		it("accepts a uniform array map", async () => {
			expect(validateText([{ en: ["x"], fr: ["y"] }], text())).toBeUndefined();
		});

	});

	describe("validateTextString", () => {

		describe("type filtering", () => {

			it("returns undefined for valid local values", async () => {

				expect(validateTextString([{ "en": "hello" }], text())).toBeUndefined();

			});

			it("rejects plain string (no und shorthand)", async () => {

				expect(validateTextString(["hello"], text())).toHaveProperty("{kind}");

			});

			it("returns undefined for empty values array", async () => {

				expect(validateTextString([], text())).toBeUndefined();

			});

			it.each<[string, readonly unknown[]]>([
				["a single non-object non-string value", [42]],
				["multiple non-object non-string values", [42, true]],
				["mixed valid and non-object values", [{ "en": "hello" }, 42]]
			])("returns a kind trace for %s", async (_label, values) => {

				expect(validateTextString(values, text())).toHaveProperty("{kind}");

			});

			it("rejects multiple object values", async () => {

				expect(validateTextString([{ "en": "hello" }, { "fr": "bonjour" }], text())).toBeDefined();

			});

		});

		describe("structural validation", () => {

			it("returns undefined for empty object", async () => {

				expect(validateTextString([{}], text())).toBeUndefined();

			});

			it("returns trace for object with invalid tag key", async () => {

				const result = validateTextString([{ "123": "hello" }], text());

				expect(result).toBeDefined();
				expect(result).toHaveProperty("123");

			});

			it("returns trace for object with non-string value", async () => {

				const result = validateTextString([{ en: 42 }], text());

				expect(result).toBeDefined();
				expect(result).toHaveProperty("en");

			});

			it("reports only invalid entries in mixed object", async () => {

				const result = validateTextString([{ en: "hello", "123": "bad tag", fr: 42 }], text());

				expect(result).toBeDefined();
				expect(result).toHaveProperty("123");
				expect(result).toHaveProperty("fr");
				expect(result).not.toHaveProperty("en");

			});

			it("validates structural issues alongside constraint violations", async () => {

				const result = validateTextString([{ en: "hi", "123": "bad" }], text({ minLength: 5 }));

				expect(result).toBeDefined();
				expect(result).toHaveProperty("123"); // invalid tag
				expect(result).toHaveProperty("en"); // valid tag but fails minLength

			});

			it("does not apply constraints to structurally invalid entries", async () => {

				const result = validateTextString([{ en: 42 }], text({ minLength: 5 }));

				expect(result).toBeDefined();
				expect(result).toHaveProperty("en");

				// structural error, not a constraint error
				const en = (result as any).en;
				expect(typeof en === "string" || (typeof en === "object" && !en["{minLength}"])).toBeTruthy();

			});

		});

		describe("minLength constraint", () => {

			it("returns undefined when all strings meet minimum length", async () => {

				expect(validateTextString([{
					en: "hello",
					fr: "bonjour"
				}], text({ minLength: 3 }))).toBeUndefined();

			});

			it("returns trace when any string is below minimum length", async () => {

				const result = validateTextString([{ en: "hi", fr: "bonjour" }], text({ minLength: 5 }));

				expect(result).toHaveProperty("en");
				expect(result).not.toHaveProperty("fr");

			});

			it("returns trace for empty string when minLength > 0", async () => {

				expect(validateTextString([{ en: "" }], text({ minLength: 1 }))).toHaveProperty("en");

			});

		});

		describe("maxLength constraint", () => {

			it("returns undefined when all strings are within maximum length", async () => {

				expect(validateTextString([{
					en: "hello",
					fr: "bonjour"
				}], text({ maxLength: 10 }))).toBeUndefined();

			});

			it("returns trace when any string exceeds maximum length", async () => {

				const result = validateTextString([{
					en: "hello",
					fr: "bonjour"
				}], text({ maxLength: 5 }));

				expect(result).toHaveProperty("fr");

			});

		});

		describe("languageIn constraint", () => {

			it("returns undefined when all tags match allowed languages", async () => {

				expect(validateTextString([{
					en: "hello",
					fr: "bonjour"
				}], text({ languageIn: ["en", "fr"] }))).toBeUndefined();

			});

			it("returns trace when tag is not in allowed languages", async () => {

				const result = validateTextString([{
					en: "hello",
					de: "hallo"
				}], text({ languageIn: ["en", "fr"] }));

				expect(result).toHaveProperty("de");
				expect(result).not.toHaveProperty("en");

			});

			it("handles language range matching", async () => {

				const shape = text({ languageIn: ["en"] });

				expect(validateTextString([{ "en-US": "color" }], shape)).toBeUndefined();
				expect(validateTextString([{ "en-GB": "colour" }], shape)).toBeUndefined();

			});

			it("returns trace for base language when only subtag allowed", async () => {

				expect(validateTextString([{ en: "hello" }], text({ languageIn: ["en-US"] }))).toHaveProperty("en");

			});

		});

		describe("combined constraints", () => {

			it("returns undefined when all constraints are satisfied", async () => {

				expect(validateTextString([{ en: "hello", fr: "bonjour" }], text({
					minLength: 2,
					maxLength: 10,
					languageIn: ["en", "fr"]
				}))).toBeUndefined();

			});

			it("returns trace when length constraint fails", async () => {

				const result = validateTextString([{ en: "hello" }], text({
					minLength: 10,
					languageIn: ["en"]
				}));

				expect(result).toHaveProperty("en");

			});

			it("returns trace when language constraint fails", async () => {

				const result = validateTextString([{ fr: "bonjour" }], text({
					minLength: 2,
					languageIn: ["en"]
				}));

				expect(result).toHaveProperty("fr");

			});

		});

		describe("plain-string rejection", () => {

			it("rejects plain string values (no und shorthand)", async () => {

				expect(validateTextString(["hello"], text())).toHaveProperty("{kind}");

			});

			it("rejects empty plain string values", async () => {

				expect(validateTextString([""], text())).toHaveProperty("{kind}");

			});

		});

	});

	describe("validateTextStrings", () => {

		describe("type filtering", () => {

			it("returns undefined for valid locals values", async () => {

				expect(validateTextStrings([{ "en": ["hello"] }], text())).toBeUndefined();

			});

			it("rejects plain string array (no und shorthand)", async () => {

				expect(validateTextStrings([["hello"]], text())).toHaveProperty("{kind}");

			});

			it("returns undefined for empty values array", async () => {

				expect(validateTextStrings([], text())).toBeUndefined();

			});

			it.each<[string, readonly unknown[]]>([
				["a single non-object non-array value", [42]],
				["multiple non-object non-array values", [42, true]],
				["mixed valid and non-object values", [{ "en": ["hello"] }, 42]]
			])("returns a kind trace for %s", async (_label, values) => {

				expect(validateTextStrings(values, text())).toHaveProperty("{kind}");

			});

			it("accepts scalar string value for array-model shape", async () => {

				expect(validateText([{ "en": "hello" }], text())).toBeUndefined();

			});

			it("rejects multiple object values", async () => {

				expect(validateTextStrings([{ "en": ["hello"] }, { "fr": ["bonjour"] }], text())).toBeDefined();

			});

		});

		describe("structural validation", () => {

			it("returns undefined for empty object", async () => {

				expect(validateTextStrings([{}], text())).toBeUndefined();

			});

			it("returns trace for object with invalid tag key", async () => {

				const result = validateTextStrings([{ "123": ["hello"] }], text());

				expect(result).toBeDefined();
				expect(result).toHaveProperty("123");

			});

			it("returns trace for object with non-string non-array value", async () => {

				const result = validateTextStrings([{ en: 42 }], text());

				expect(result).toBeDefined();
				expect(result).toHaveProperty("en");

			});

			it("reports only invalid entries in mixed object", async () => {

				const result = validateTextStrings([{ en: ["hello"], "123": ["bad tag"], fr: 42 }], text());

				expect(result).toBeDefined();
				expect(result).toHaveProperty("123");
				expect(result).toHaveProperty("fr");
				expect(result).not.toHaveProperty("en");

			});

			it("does not apply constraints to structurally invalid entries", async () => {

				const result = validateTextStrings([{ en: 42 }], { ...text(), minLength: 5 } as any);

				expect(result).toBeDefined();
				expect(result).toHaveProperty("en");

				const en = (result as any).en;
				expect(typeof en === "string" || (typeof en === "object" && !en["{minLength}"])).toBeTruthy();

			});

		});

		describe("minLength constraint", () => {

			it("returns undefined when all strings meet minimum length", async () => {

				expect(validateTextStrings([{
					en: ["hello", "world"],
					fr: ["bonjour"]
				}], { ...text(), minLength: 3 } as any)).toBeUndefined();

			});

			it("returns trace when any string is below minimum length", async () => {

				const result = validateTextStrings([{ en: ["hello", "hi"] }], {
					...text(),
					minLength: 5
				} as any);

				expect(result).toHaveProperty("en");

			});

		});

		describe("maxLength constraint", () => {

			it("returns undefined when all strings are within maximum length", async () => {

				expect(validateTextStrings([{
					en: ["hello", "hi"],
					fr: ["bonjour"]
				}], { ...text(), maxLength: 10 } as any)).toBeUndefined();

			});

			it("returns trace when any string exceeds maximum length", async () => {

				const result = validateTextStrings([{ en: ["hello", "greetings"] }], {
					...text(),
					maxLength: 5
				} as any);

				expect(result).toHaveProperty("en");

			});

		});

		describe("languageIn constraint", () => {

			it("returns undefined when all tags match allowed languages", async () => {

				expect(validateTextStrings([{
					en: ["hello"],
					fr: ["bonjour"]
				}], { ...text(), languageIn: ["en", "fr"] } as any)).toBeUndefined();

			});

			it("returns trace when tag is not in allowed languages", async () => {

				const result = validateTextStrings([{
					en: ["hello"],
					de: ["hallo"]
				}], { ...text(), languageIn: ["en", "fr"] } as any);

				expect(result).toHaveProperty("de");
				expect(result).not.toHaveProperty("en");

			});

			it("handles language range matching", async () => {

				expect(validateTextStrings([{ "en-US": ["color"] }], {
					...text(),
					languageIn: ["en"]
				} as any)).toBeUndefined();

			});

		});

		describe("combined constraints", () => {

			it("returns undefined when all constraints are satisfied", async () => {

				expect(validateTextStrings([{ en: ["hello", "world"], fr: ["bonjour"] }], {
					...text(),
					minLength: 2,
					maxLength: 10,
					languageIn: ["en", "fr"]
				} as any)).toBeUndefined();

			});

			it("returns trace when any constraint fails", async () => {

				const result = validateTextStrings([{ en: ["hello"] }], {
					...text(),
					minLength: 10,
					languageIn: ["en"]
				} as any);

				expect(result).toHaveProperty("en");

			});

		});

		describe("plain-string-array rejection", () => {

			it("rejects plain string array values (no und shorthand)", async () => {

				expect(validateTextStrings([["hello", "world"]], {
					...text(),
					minLength: 3
				} as any)).toHaveProperty("{kind}");

			});

			it("rejects single-element plain string array", async () => {

				expect(validateTextStrings([["hello"]], text())).toHaveProperty("{kind}");

			});

		});

		describe("per-value errors", () => {

			it.each<[string, readonly string[], Record<string, number>, string, RegExp]>([
				["a count prefix for multiple failing minLength texts", ["ab", "c", "d"], { minLength: 3 }, "{minLength}", /^\(3\/3\) /],
				["a count prefix for maxLength violations", ["toolong", "alsotoolong"], { maxLength: 3 }, "{maxLength}", /^\(2\/2\) /],
				["only failing texts in the prefix", ["ab", "hello", "c"], { minLength: 3 }, "{minLength}", /^\(2\/3\) /]
			])("includes %s", async (_label, values, constraints, key, message) => {

				const result = validateTextStrings([{ en: values }], { ...text(), ...constraints } as any);
				const en = (result as any).en as Record<string, string>;

				expect(en[key]).toMatch(message);

			});

		});

	});


	describe("validateLocaleString", () => {

		it("accepts bare string as coalesced scalar placeholder", async () => {

			expect(validateLocaleString("")).toBeUndefined();
			expect(validateLocaleString("hello")).toBeUndefined();

		});

		it("accepts object with valid tag range keys", async () => {

			expect(validateLocaleString({ "en": "hello" })).toBeUndefined();
			expect(validateLocaleString({ "*": "hello" })).toBeUndefined();
			expect(validateLocaleString({ "en-US": "hello" })).toBeUndefined();

		});

		it("accepts empty object", async () => {

			expect(validateLocaleString({})).toBeUndefined();

		});

		it("rejects non-string non-object value", async () => {

			expect(validateLocaleString(42)).toBeDefined();
			expect(validateLocaleString(true)).toBeDefined();
			expect(validateLocaleString(null)).toBeDefined();

		});

		it("rejects array value", async () => {

			expect(validateLocaleString(["hello"])).toBeDefined();

		});

		it("reports invalid tag range keys", async () => {

			const result = validateLocaleString({ "123": "hello" });

			expect(result).toBeDefined();
			expect(result).toHaveProperty("123");

			// extended ranges (RFC 4647 § 2.2) are not basic ranges and are rejected

			const extended = validateLocaleString({ "en-*": "hello" });

			expect(extended).toBeDefined();
			expect(extended).toHaveProperty("en-*");

		});

		it("reports non-string values", async () => {

			const result = validateLocaleString({ en: 42 });

			expect(result).toBeDefined();
			expect(result).toHaveProperty("en");

		});

		it("reports only invalid entries in mixed object", async () => {

			const result = validateLocaleString({ en: "hello", "123": "bad", fr: 42 });

			expect(result).toBeDefined();
			expect(result).toHaveProperty("123");
			expect(result).toHaveProperty("fr");
			expect(result).not.toHaveProperty("en");

		});

		describe("selection operator keys rejected", () => {

			// localised properties carry no inline Selection — Locale is its own Placeholders
			// arm, not a Locale & Selection branch — so an operator-prefixed key is just an
			// invalid tag range

			it("reports a selection key alongside tag-range keys as an invalid tag range", async () => {

				const result = validateLocaleString({ en: "hi", ">=length:": 5 });

				expect(result).toHaveProperty(">=length:");
				expect(result).not.toHaveProperty("en");

			});

			it("rejects an object with only selection keys", async () => {

				expect(validateLocaleString({ ">=length:": 5 })).toBeDefined();

			});

			it.each([
				["keyword search", { en: "hi", "~": "foo" }],
				["sort ordering", { en: "hi", "^": "asc" }],
				["pagination offset", { en: "hi", ":": 0 }],
				["pagination limit", { en: "hi", "#": 10 }]
			])("rejects %s selection key", async (_label, value) => {

				expect(validateLocaleString(value)).toBeDefined();

			});

		});

	});

	describe("validateLocaleStrings", () => {

		it("rejects plain string (no bare-string shorthand)", async () => {

			expect(validateLocaleStrings("hello")).toBeDefined();
			expect(validateLocaleStrings("")).toBeDefined();

		});

		it("accepts bare singleton array as coalesced array placeholder", async () => {

			expect(validateLocaleStrings(["hello"])).toBeUndefined();
			expect(validateLocaleStrings([""])).toBeUndefined();

		});

		it("rejects bare multi-element array", async () => {

			expect(validateLocaleStrings(["hello", "world"])).toBeDefined();

		});

		it("accepts object with singleton-tuple tag values", async () => {

			expect(validateLocaleStrings({ "en": ["hello"] })).toBeUndefined();
			expect(validateLocaleStrings({ "*": ["hello"] })).toBeUndefined();
			expect(validateLocaleStrings({ "en-US": ["hello"] })).toBeUndefined();

		});

		it("rejects single-string tag values (the single-string arm)", async () => {

			const result = validateLocaleStrings({ "en": "hello" });

			expect(result).toBeDefined();
			expect(result).toHaveProperty("en");

		});

		it("rejects multi-element tuple tag values", async () => {

			const result = validateLocaleStrings({ "en": ["hello", "world"] });

			expect(result).toBeDefined();
			expect(result).toHaveProperty("en");

		});

		it("accepts empty object", async () => {

			expect(validateLocaleStrings({})).toBeUndefined();

		});

		it("rejects non-object value", async () => {

			expect(validateLocaleStrings(42)).toBeDefined();
			expect(validateLocaleStrings(true)).toBeDefined();
			expect(validateLocaleStrings(null)).toBeDefined();

		});

		it("reports invalid tag range keys", async () => {

			const result = validateLocaleStrings({ "123": ["hello"] });

			expect(result).toBeDefined();
			expect(result).toHaveProperty("123");

			// extended ranges (RFC 4647 § 2.2) are not basic ranges and are rejected

			const extended = validateLocaleStrings({ "en-*": ["hello"] });

			expect(extended).toBeDefined();
			expect(extended).toHaveProperty("en-*");

		});

	});

});
