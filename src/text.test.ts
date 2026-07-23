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
	validateLocale,
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

			expect(trace).toContainEqual(expect.stringContaining("{minLength/maxLength}"));

		});

		describe("model", () => {

			it("rejects plain string (no bare-string shorthand)", async () => {

				expect(at(checkText({ model: "hello" } as any), "{model}")).toBeDefined();
				expect(at(checkText({ model: "" } as any), "{model}")).toBeDefined();

			});

			it("rejects singleton string array (no bare-array shorthand)", async () => {

				expect(at(checkText({ model: ["hello"] } as any), "{model}")).toBeDefined();

			});

			it("rejects multi-element string array", async () => {

				expect(at(checkText({ model: ["hello", "world"] } as any), "{model}")).toBeDefined();

			});

			it("accepts object with string values", async () => {

				expect(checkText({ model: { "en": "hello" } } as any)).toBeUndefined();

			});

			it("accepts object with singleton string array values", async () => {

				expect(checkText({ model: { "en": ["hello"] } } as any)).toBeUndefined();

			});

			it("rejects object with multi-element string array values", async () => {

				const trace = checkText({ model: { "en": ["hello", "world"] } } as any);

				expect(at(trace, "{model}", "en")).toBeDefined();

			});

			it("accepts object with valid tag range keys", async () => {

				expect(checkText({ model: { "*": ["hello"] } } as any)).toBeUndefined();
				expect(checkText({ model: { "en-US": ["hello"] } } as any)).toBeUndefined();

			});

			it("accepts empty object", async () => {

				expect(checkText({ model: {} } as any)).toBeUndefined();

			});

			it("rejects non-string non-array non-object value", async () => {

				expect(at(checkText({ model: 42 } as any), "{model}")).toBeDefined();
				expect(at(checkText({ model: true } as any), "{model}")).toBeDefined();
				expect(at(checkText({ model: null } as any), "{model}")).toBeDefined();

			});

			it("reports invalid tag range keys", async () => {

				const trace = checkText({ model: { "123": ["hello"] } } as any);

				expect(at(trace, "{model}", "123")).toBeDefined();

				// extended ranges (RFC 4647 § 2.2) are not basic ranges and are rejected

				const extended = checkText({ model: { "en-*": ["hello"] } } as any);

				expect(at(extended, "{model}", "en-*")).toBeDefined();

			});

			it("reports non-string non-array values", async () => {

				const trace = checkText({ model: { en: 42 } } as any);

				expect(at(trace, "{model}", "en")).toBeDefined();

			});

			it("reports only invalid entries in mixed object", async () => {

				const trace = checkText({ model: { en: ["hello"], "123": ["bad"], fr: 42 } } as any);

				expect(at(trace, "{model}", "123")).toBeDefined();
				expect(at(trace, "{model}", "fr")).toBeDefined();
				expect(at(trace, "{model}", "en")).toBeUndefined();

			});

			it("rejects mixed scalar and singleton-array values across tag-range keys", async () => {

				// qest's Locale type defines `{ TagRange: string }` and `{ TagRange: [string] }` as
				// distinct arms; a single map with both shapes satisfies neither

				expect(at(checkText({ model: { en: "hello", fr: ["bonjour"] } } as any), "{model}")).toBeDefined();

			});

			describe("selection operator keys rejected", () => {

				// localised entries carry no inline Selection — Locale is its own Placeholders
				// arm, not a Locale & Selection branch — so an operator-prefixed key is just an
				// invalid tag range

				it("reports a selection key alongside tag-range keys as an invalid tag range", async () => {

					const trace = checkText({ model: { en: ["hi"], ">=length:": 5 } } as any);

					expect(at(trace, "{model}", ">=length:")).toBeDefined();
					expect(at(trace, "{model}", "en")).toBeUndefined();

				});

				it("rejects an object with only selection keys", async () => {

					expect(at(checkText({ model: { ">=length:": 5 } } as any), "{model}")).toBeDefined();

				});

				it.each([
					["keyword search", { en: ["hi"], "~": "foo" }],
					["sort ordering", { en: ["hi"], "^": "asc" }],
					["pagination offset", { en: ["hi"], ":": 0 }],
					["pagination limit", { en: ["hi"], "#": 10 }]
				])("rejects %s selection key", async (_label, value) => {

					expect(at(checkText({ model: value } as any), "{model}")).toBeDefined();

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

				expect(validateTextString(["hello"], text())).toContainEqual(expect.stringContaining("{kind}"));

			});

			it("returns undefined for empty values array", async () => {

				expect(validateTextString([], text())).toBeUndefined();

			});

			it.each<[string, readonly unknown[]]>([
				["a single non-object non-string value", [42]],
				["multiple non-object non-string values", [42, true]],
				["mixed valid and non-object values", [{ "en": "hello" }, 42]]
			])("returns a kind trace for %s", async (_label, values) => {

				expect(validateTextString(values, text())).toContainEqual(expect.stringContaining("{kind}"));

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
				expect(at(result, "123")).toBeDefined();

			});

			it("returns trace for object with non-string value", async () => {

				const result = validateTextString([{ en: 42 }], text());

				expect(result).toBeDefined();
				expect(at(result, "en")).toBeDefined();

			});

			it("reports only invalid entries in mixed object", async () => {

				const result = validateTextString([{ en: "hello", "123": "bad tag", fr: 42 }], text());

				expect(result).toBeDefined();
				expect(at(result, "123")).toBeDefined();
				expect(at(result, "fr")).toBeDefined();
				expect(at(result, "en")).toBeUndefined();

			});

			it("validates structural issues alongside constraint violations", async () => {

				const result = validateTextString([{ en: "hi", "123": "bad" }], text({ minLength: 5 }));

				expect(result).toBeDefined();
				expect(at(result, "123")).toBeDefined(); // invalid tag
				expect(at(result, "en")).toBeDefined(); // valid tag but fails minLength

			});

			it("does not apply constraints to structurally invalid entries", async () => {

				const result = validateTextString([{ en: 42 }], text({ minLength: 5 }));

				// structural error, not a constraint error

				expect(at(result, "en")).toEqual(["expected string value"]);

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

				expect(at(result, "en")).toBeDefined();
				expect(at(result, "fr")).toBeUndefined();

			});

			it("returns trace for empty string when minLength > 0", async () => {

				expect(at(validateTextString([{ en: "" }], text({ minLength: 1 })), "en")).toBeDefined();

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

				expect(at(result, "fr")).toBeDefined();

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

				expect(at(result, "de")).toBeDefined();
				expect(at(result, "en")).toBeUndefined();

			});

			it("handles language range matching", async () => {

				const shape = text({ languageIn: ["en"] });

				expect(validateTextString([{ "en-US": "color" }], shape)).toBeUndefined();
				expect(validateTextString([{ "en-GB": "colour" }], shape)).toBeUndefined();

			});

			it("returns trace for base language when only subtag allowed", async () => {

				expect(at(validateTextString([{ en: "hello" }], text({ languageIn: ["en-US"] })), "en")).toBeDefined();

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

				expect(at(result, "en")).toBeDefined();

			});

			it("returns trace when language constraint fails", async () => {

				const result = validateTextString([{ fr: "bonjour" }], text({
					minLength: 2,
					languageIn: ["en"]
				}));

				expect(at(result, "fr")).toBeDefined();

			});

		});

		describe("plain-string rejection", () => {

			it("rejects plain string values (no und shorthand)", async () => {

				expect(validateTextString(["hello"], text())).toContainEqual(expect.stringContaining("{kind}"));

			});

			it("rejects empty plain string values", async () => {

				expect(validateTextString([""], text())).toContainEqual(expect.stringContaining("{kind}"));

			});

		});

	});

	describe("validateTextStrings", () => {

		describe("type filtering", () => {

			it("returns undefined for valid locals values", async () => {

				expect(validateTextStrings([{ "en": ["hello"] }], text())).toBeUndefined();

			});

			it("rejects plain string array (no und shorthand)", async () => {

				expect(validateTextStrings([["hello"]], text())).toContainEqual(expect.stringContaining("{kind}"));

			});

			it("returns undefined for empty values array", async () => {

				expect(validateTextStrings([], text())).toBeUndefined();

			});

			it.each<[string, readonly unknown[]]>([
				["a single non-object non-array value", [42]],
				["multiple non-object non-array values", [42, true]],
				["mixed valid and non-object values", [{ "en": ["hello"] }, 42]]
			])("returns a kind trace for %s", async (_label, values) => {

				expect(validateTextStrings(values, text())).toContainEqual(expect.stringContaining("{kind}"));

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
				expect(at(result, "123")).toBeDefined();

			});

			it("returns trace for object with non-string non-array value", async () => {

				const result = validateTextStrings([{ en: 42 }], text());

				expect(result).toBeDefined();
				expect(at(result, "en")).toBeDefined();

			});

			it("reports only invalid entries in mixed object", async () => {

				const result = validateTextStrings([{ en: ["hello"], "123": ["bad tag"], fr: 42 }], text());

				expect(result).toBeDefined();
				expect(at(result, "123")).toBeDefined();
				expect(at(result, "fr")).toBeDefined();
				expect(at(result, "en")).toBeUndefined();

			});

			it("does not apply constraints to structurally invalid entries", async () => {

				const result = validateTextStrings([{ en: 42 }], { ...text(), minLength: 5 } as any);

				// structural error, not a constraint error

				expect(at(result, "en")).toEqual(["expected string array value"]);

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

				expect(at(result, "en")).toBeDefined();

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

				expect(at(result, "en")).toBeDefined();

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

				expect(at(result, "de")).toBeDefined();
				expect(at(result, "en")).toBeUndefined();

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

				expect(at(result, "en")).toBeDefined();

			});

		});

		describe("plain-string-array rejection", () => {

			it("rejects plain string array values (no und shorthand)", async () => {

				expect(validateTextStrings([["hello", "world"]], {
					...text(),
					minLength: 3
				} as any)).toContainEqual(expect.stringContaining("{kind}"));

			});

			it("rejects single-element plain string array", async () => {

				expect(validateTextStrings([["hello"]], text())).toContainEqual(expect.stringContaining("{kind}"));

			});

		});

		describe("per-value errors", () => {

			it.each<[string, readonly string[], Record<string, number>]>([
				["multiple failing minLength texts", ["ab", "c", "d"], { minLength: 3 }],
				["maxLength violations", ["toolong", "alsotoolong"], { maxLength: 3 }],
				["only failing texts", ["ab", "hello", "c"], { minLength: 3 }]
			])("keys per-element length violations for %s", async (_label, values, constraints) => {

				const result = validateTextStrings([{ en: values }], { ...text(), ...constraints } as any);

				expect(JSON.stringify(at(result, "en"))).toContain("{length}");

			});

		});

	});


	describe("validateLocale", () => {

		it("returns undefined for an empty values array", async () => {
			expect(validateLocale([])).toBeUndefined();
		});

		it("rejects more than one value", async () => {
			expect(validateLocale(["a", "b"])).toBeDefined();
		});

		it("reports an arity violation under the kind key, as the text arms do", async () => {
			expect(validateLocale(["a", "b"])).toEqual(["{kind} expected at most one <text> value"]);
		});

		it("accepts a bare string (coalesced scalar placeholder)", async () => {
			expect(validateLocale(["hello"])).toBeUndefined();
			expect(validateLocale([""])).toBeUndefined();
		});

		it("accepts a bare singleton string array (coalesced array placeholder)", async () => {
			expect(validateLocale([["hello"]])).toBeUndefined();
		});

		it("accepts a single-string-per-tag map", async () => {
			expect(validateLocale([{ en: "hello" }])).toBeUndefined();
			expect(validateLocale([{ "*": "hello" }])).toBeUndefined();
		});

		it("accepts an array-per-tag map", async () => {
			expect(validateLocale([{ en: ["hello"] }])).toBeUndefined();
		});

		it("rejects a non-text scalar", async () => {
			expect(validateLocale([42])).toBeDefined();
			expect(validateLocale([true])).toBeDefined();
		});

		it("propagates per-tag detail when both arms reject the value", async () => {

			const trace = validateLocale([{ en: 42 }]);

			expect(trace).toBeDefined();
			expect(JSON.stringify(trace)).toContain("en");

		});

		it("reports an invalid tag range", async () => {

			const trace = validateLocale([{ "123": "hello" }]);

			expect(trace).toBeDefined();
			expect(JSON.stringify(trace)).toContain("123");

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
			expect(at(result, "123")).toBeDefined();

			// extended ranges (RFC 4647 § 2.2) are not basic ranges and are rejected

			const extended = validateLocaleString({ "en-*": "hello" });

			expect(extended).toBeDefined();
			expect(at(extended, "en-*")).toBeDefined();

		});

		it("reports non-string values", async () => {

			const result = validateLocaleString({ en: 42 });

			expect(result).toBeDefined();
			expect(at(result, "en")).toBeDefined();

		});

		it("reports only invalid entries in mixed object", async () => {

			const result = validateLocaleString({ en: "hello", "123": "bad", fr: 42 });

			expect(result).toBeDefined();
			expect(at(result, "123")).toBeDefined();
			expect(at(result, "fr")).toBeDefined();
			expect(at(result, "en")).toBeUndefined();

		});

		describe("selection operator keys rejected", () => {

			// localised entries carry no inline Selection — Locale is its own Placeholders
			// arm, not a Locale & Selection branch — so an operator-prefixed key is just an
			// invalid tag range

			it("reports a selection key alongside tag-range keys as an invalid tag range", async () => {

				const result = validateLocaleString({ en: "hi", ">=length:": 5 });

				expect(at(result, ">=length:")).toBeDefined();
				expect(at(result, "en")).toBeUndefined();

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
			expect(at(result, "en")).toBeDefined();

		});

		it("rejects multi-element tuple tag values", async () => {

			const result = validateLocaleStrings({ "en": ["hello", "world"] });

			expect(result).toBeDefined();
			expect(at(result, "en")).toBeDefined();

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
			expect(at(result, "123")).toBeDefined();

			// extended ranges (RFC 4647 § 2.2) are not basic ranges and are rejected

			const extended = validateLocaleStrings({ "en-*": ["hello"] });

			expect(extended).toBeDefined();
			expect(at(extended, "en-*")).toBeDefined();

		});

	});

});
