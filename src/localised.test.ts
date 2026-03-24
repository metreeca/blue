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
	checkLocalised,
	mergeLocalised,
	validateArrayLocale,
	validateArrayLocalised,
	validateLocalised,
	validateScalarLocale,
	validateScalarLocalised
} from "./localised.core.js";
import { localised } from "./localised.js";


describe("factories", () => {

	describe("localised", () => {

		describe("shape", () => {

			it("returns a shape with kind 'localised'", async () => {

				expect(localised().kind).toBe("localised");
				expect(localised({ "*": "example" }).kind).toBe("localised");
				expect(localised({ minLength: 1 }).kind).toBe("localised");

			});

			it("returns a shape with default model", async () => {

				expect(localised().model).toEqual({ "*": "" });
				expect(localised({}).model).toEqual({ "*": "" });

			});

			it("returns a shape with model argument", async () => {

				expect(localised({ "*": "example" }).model).toEqual({ "*": "example" });
				expect(localised({ en: "hello", fr: "bonjour" }).model).toEqual({ en: "hello", fr: "bonjour" });

			});

			it("normalizes string model shorthand to { und: value }", async () => {

				expect(localised("example").model).toEqual({ "*": "example" });
				expect(localised("").model).toEqual({ "*": "" });

			});

			it("normalizes string model shorthand to { *: value }", async () => {

				expect(localised("example").model).toEqual({ "*": "example" });

			});

			it("accepts array model shorthand", async () => {

				expect(localised(["example"]).model).toEqual({ "*": ["example"] });

			});

			it("returns an immutable shape", async () => {

				const shape = localised();

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).model = { "*": "test" }).toThrow();

			});

			it("returns an immutable shape with array model", async () => {

				const shape = localised(["test"]);

				expect(() => (shape as any).kind = "localised").toThrow();
				expect(() => (shape as any).model = { "*": ["test"] }).toThrow();

			});

		});

	});

	describe.each([

		["localised", localised]

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

	describe("checkLocalised", () => {

		it("returns undefined for consistent constraints", async () => {

			expect(checkLocalised({ minLength: 1, maxLength: 10 })).toBeUndefined();

		});

		it("returns undefined when minLength equals maxLength", async () => {

			expect(checkLocalised({ minLength: 5, maxLength: 5 })).toBeUndefined();

		});

		it("returns undefined when only minLength is provided", async () => {

			expect(checkLocalised({ minLength: 5 })).toBeUndefined();

		});

		it("returns undefined when only maxLength is provided", async () => {

			expect(checkLocalised({ maxLength: 5 })).toBeUndefined();

		});

		it("returns undefined when no constraints are provided", async () => {

			expect(checkLocalised({})).toBeUndefined();

		});

		it("returns trace when minLength > maxLength", async () => {

			const trace = checkLocalised({ minLength: 10, maxLength: 5 });

			expect(trace).toBeDefined();
			expect(trace).toHaveProperty("{minLength/maxLength}");

		});

	});


	describe("validateScalarLocalised", () => {

		describe("type filtering", () => {

			it("returns undefined for valid local values", async () => {

				expect(validateScalarLocalised([{ "en": "hello" }], localised())).toBeUndefined();

			});

			it("returns undefined for plain string shorthand", async () => {

				expect(validateScalarLocalised(["hello"], localised())).toBeUndefined();

			});

			it("returns undefined for empty values array", async () => {

				expect(validateScalarLocalised([], localised())).toBeUndefined();

			});

			it("returns trace with kind key for non-object non-string value", async () => {

				const trace = validateScalarLocalised([42], localised());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

			it("returns trace with kind key for multiple non-object non-string values", async () => {

				const trace = validateScalarLocalised([42, true], localised());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

			it("returns trace with kind key for mixed valid and non-object values", async () => {

				const trace = validateScalarLocalised([{ "en": "hello" }, 42], localised());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

			it("rejects multiple object values", async () => {

				expect(validateScalarLocalised([{ "en": "hello" }, { "fr": "bonjour" }], localised())).toBeDefined();

			});

		});

		describe("structural validation", () => {

			it("returns undefined for empty object", async () => {

				expect(validateScalarLocalised([{}], localised())).toBeUndefined();

			});

			it("returns trace for object with invalid tag key", async () => {

				const result = validateScalarLocalised([{ "123": "hello" }], localised());

				expect(result).toBeDefined();
				expect(result).toHaveProperty("123");

			});

			it("returns trace for object with non-string value", async () => {

				const result = validateScalarLocalised([{ en: 42 }], localised());

				expect(result).toBeDefined();
				expect(result).toHaveProperty("en");

			});

			it("reports only invalid entries in mixed object", async () => {

				const result = validateScalarLocalised([{ en: "hello", "123": "bad tag", fr: 42 }], localised());

				expect(result).toBeDefined();
				expect(result).toHaveProperty("123");
				expect(result).toHaveProperty("fr");
				expect(result).not.toHaveProperty("en");

			});

			it("validates structural issues alongside constraint violations", async () => {

				const result = validateScalarLocalised([{ en: "hi", "123": "bad" }], localised({ minLength: 5 }));

				expect(result).toBeDefined();
				expect(result).toHaveProperty("123"); // invalid tag
				expect(result).toHaveProperty("en"); // valid tag but fails minLength

			});

			it("does not apply constraints to structurally invalid entries", async () => {

				const result = validateScalarLocalised([{ en: 42 }], localised({ minLength: 5 }));

				expect(result).toBeDefined();
				expect(result).toHaveProperty("en");

				// structural error, not a constraint error
				const en = (result as any).en;
				expect(typeof en === "string" || (typeof en === "object" && !en["{minLength}"])).toBeTruthy();

			});

		});

		describe("minLength constraint", () => {

			it("returns undefined when all strings meet minimum length", async () => {

				expect(validateScalarLocalised([{
					en: "hello",
					fr: "bonjour"
				}], localised({ minLength: 3 }))).toBeUndefined();

			});

			it("returns trace when any string is below minimum length", async () => {

				const result = validateScalarLocalised([{ en: "hi", fr: "bonjour" }], localised({ minLength: 5 }));

				expect(result).toHaveProperty("en");
				expect(result).not.toHaveProperty("fr");

			});

			it("returns trace for empty string when minLength > 0", async () => {

				expect(validateScalarLocalised([{ en: "" }], localised({ minLength: 1 }))).toHaveProperty("en");

			});

		});

		describe("maxLength constraint", () => {

			it("returns undefined when all strings are within maximum length", async () => {

				expect(validateScalarLocalised([{
					en: "hello",
					fr: "bonjour"
				}], localised({ maxLength: 10 }))).toBeUndefined();

			});

			it("returns trace when any string exceeds maximum length", async () => {

				const result = validateScalarLocalised([{
					en: "hello",
					fr: "bonjour"
				}], localised({ maxLength: 5 }));

				expect(result).toHaveProperty("fr");

			});

		});

		describe("languageIn constraint", () => {

			it("returns undefined when all tags match allowed languages", async () => {

				expect(validateScalarLocalised([{
					en: "hello",
					fr: "bonjour"
				}], localised({ languageIn: ["en", "fr"] }))).toBeUndefined();

			});

			it("returns trace when tag is not in allowed languages", async () => {

				const result = validateScalarLocalised([{
					en: "hello",
					de: "hallo"
				}], localised({ languageIn: ["en", "fr"] }));

				expect(result).toHaveProperty("de");
				expect(result).not.toHaveProperty("en");

			});

			it("handles language range matching", async () => {

				const shape = localised({ languageIn: ["en-*"] });

				expect(validateScalarLocalised([{ "en-US": "color" }], shape)).toBeUndefined();
				expect(validateScalarLocalised([{ "en-GB": "colour" }], shape)).toBeUndefined();

			});

			it("returns trace for base language when only subtag allowed", async () => {

				expect(validateScalarLocalised([{ en: "hello" }], localised({ languageIn: ["en-US"] }))).toHaveProperty("en");

			});

		});

		describe("combined constraints", () => {

			it("returns undefined when all constraints are satisfied", async () => {

				expect(validateScalarLocalised([{ en: "hello", fr: "bonjour" }], localised({
					minLength: 2,
					maxLength: 10,
					languageIn: ["en", "fr"]
				}))).toBeUndefined();

			});

			it("returns trace when length constraint fails", async () => {

				const result = validateScalarLocalised([{ en: "hello" }], localised({
					minLength: 10,
					languageIn: ["en"]
				}));

				expect(result).toHaveProperty("en");

			});

			it("returns trace when language constraint fails", async () => {

				const result = validateScalarLocalised([{ fr: "bonjour" }], localised({
					minLength: 2,
					languageIn: ["en"]
				}));

				expect(result).toHaveProperty("fr");

			});

		});

		describe("string shorthand", () => {

			it("validates plain string values as { und: value }", async () => {

				expect(validateScalarLocalised(["hello"], localised({ minLength: 3 }))).toBeUndefined();

			});

			it("returns trace when plain string fails length constraint", async () => {

				expect(validateScalarLocalised(["hi"], localised({ minLength: 5 }))).toHaveProperty("und");

			});

			it("returns trace when plain string fails languageIn constraint", async () => {

				expect(validateScalarLocalised(["hello"], localised({ languageIn: ["en"] }))).toHaveProperty("und");

			});

			it("returns undefined when plain string matches languageIn with und", async () => {

				expect(validateLocalised(["hello"], localised({ languageIn: ["und"] }))).toBeUndefined();

			});

		});

	});

	describe("validateArrayLocalised", () => {

		describe("type filtering", () => {

			it("returns undefined for valid locals values", async () => {

				expect(validateArrayLocalised([{ "en": ["hello"] }], localised([""]))).toBeUndefined();

			});

			it("returns undefined for plain string array shorthand", async () => {

				expect(validateArrayLocalised([["hello"]], localised([""]))).toBeUndefined();

			});

			it("returns undefined for empty values array", async () => {

				expect(validateArrayLocalised([], localised([""]))).toBeUndefined();

			});

			it("returns trace with kind key for non-object non-array value", async () => {

				const trace = validateArrayLocalised([42], localised([""]));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

			it("returns trace with kind key for multiple non-object non-array values", async () => {

				const trace = validateArrayLocalised([42, true], localised([""]));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

			it("returns trace with kind key for mixed valid and non-object values", async () => {

				const trace = validateArrayLocalised([{ "en": ["hello"] }, 42], localised([""]));

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

			it("accepts scalar string value for array-model shape", async () => {

				expect(validateLocalised([{ "en": "hello" }], localised([""]))).toBeUndefined();

			});

			it("rejects multiple object values", async () => {

				expect(validateArrayLocalised([{ "en": ["hello"] }, { "fr": ["bonjour"] }], localised([""]))).toBeDefined();

			});

		});

		describe("structural validation", () => {

			it("returns undefined for empty object", async () => {

				expect(validateArrayLocalised([{}], localised([""]))).toBeUndefined();

			});

			it("returns trace for object with invalid tag key", async () => {

				const result = validateArrayLocalised([{ "123": ["hello"] }], localised([""]));

				expect(result).toBeDefined();
				expect(result).toHaveProperty("123");

			});

			it("returns trace for object with non-string non-array value", async () => {

				const result = validateArrayLocalised([{ en: 42 }], localised([""]));

				expect(result).toBeDefined();
				expect(result).toHaveProperty("en");

			});

			it("reports only invalid entries in mixed object", async () => {

				const result = validateArrayLocalised([{ en: ["hello"], "123": ["bad tag"], fr: 42 }], localised([""]));

				expect(result).toBeDefined();
				expect(result).toHaveProperty("123");
				expect(result).toHaveProperty("fr");
				expect(result).not.toHaveProperty("en");

			});

			it("does not apply constraints to structurally invalid entries", async () => {

				const result = validateArrayLocalised([{ en: 42 }], { ...localised([""]), minLength: 5 } as any);

				expect(result).toBeDefined();
				expect(result).toHaveProperty("en");

				const en = (result as any).en;
				expect(typeof en === "string" || (typeof en === "object" && !en["{minLength}"])).toBeTruthy();

			});

		});

		describe("minLength constraint", () => {

			it("returns undefined when all strings meet minimum length", async () => {

				expect(validateArrayLocalised([{
					en: ["hello", "world"],
					fr: ["bonjour"]
				}], { ...localised([""]), minLength: 3 } as any)).toBeUndefined();

			});

			it("returns trace when any string is below minimum length", async () => {

				const result = validateArrayLocalised([{ en: ["hello", "hi"] }], {
					...localised([""]),
					minLength: 5
				} as any);

				expect(result).toHaveProperty("en");

			});

		});

		describe("maxLength constraint", () => {

			it("returns undefined when all strings are within maximum length", async () => {

				expect(validateArrayLocalised([{
					en: ["hello", "hi"],
					fr: ["bonjour"]
				}], { ...localised([""]), maxLength: 10 } as any)).toBeUndefined();

			});

			it("returns trace when any string exceeds maximum length", async () => {

				const result = validateArrayLocalised([{ en: ["hello", "greetings"] }], {
					...localised([""]),
					maxLength: 5
				} as any);

				expect(result).toHaveProperty("en");

			});

		});

		describe("languageIn constraint", () => {

			it("returns undefined when all tags match allowed languages", async () => {

				expect(validateArrayLocalised([{
					en: ["hello"],
					fr: ["bonjour"]
				}], { ...localised([""]), languageIn: ["en", "fr"] } as any)).toBeUndefined();

			});

			it("returns trace when tag is not in allowed languages", async () => {

				const result = validateArrayLocalised([{
					en: ["hello"],
					de: ["hallo"]
				}], { ...localised([""]), languageIn: ["en", "fr"] } as any);

				expect(result).toHaveProperty("de");
				expect(result).not.toHaveProperty("en");

			});

			it("handles language range matching", async () => {

				expect(validateArrayLocalised([{ "en-US": ["color"] }], {
					...localised([""]),
					languageIn: ["en-*"]
				} as any)).toBeUndefined();

			});

		});

		describe("combined constraints", () => {

			it("returns undefined when all constraints are satisfied", async () => {

				expect(validateArrayLocalised([{ en: ["hello", "world"], fr: ["bonjour"] }], localised({
					model: [""],
					minLength: 2,
					maxLength: 10,
					languageIn: ["en", "fr"]
				} as any))).toBeUndefined();

			});

			it("returns trace when any constraint fails", async () => {

				const result = validateArrayLocalised([{ en: ["hello"] }], {
					...localised([""]),
					minLength: 10,
					languageIn: ["en"]
				} as any);

				expect(result).toHaveProperty("en");

			});

		});

		describe("string array shorthand", () => {

			it("validates plain string array values as { und: value }", async () => {

				expect(validateArrayLocalised([["hello", "world"]], {
					...localised([""]),
					minLength: 3
				} as any)).toBeUndefined();

			});

			it("returns trace when plain string array fails length constraint", async () => {

				expect(validateArrayLocalised([["hi"]], {
					...localised([""]),
					minLength: 5
				} as any)).toHaveProperty("und");

			});

			it("returns trace when plain string array fails languageIn constraint", async () => {

				expect(validateArrayLocalised([["hello"]], {
					...localised([""]),
					languageIn: ["en"]
				} as any)).toHaveProperty("und");

			});

			it("returns undefined when plain string array matches languageIn with und", async () => {

				expect(validateArrayLocalised([["hello"]], {
					...localised([""]),
					languageIn: ["und"]
				} as any)).toBeUndefined();

			});

		});

		describe("per-value errors", () => {

			it("includes count prefix for multiple failing texts", async () => {

				const result = validateArrayLocalised([{ en: ["ab", "c", "d"] }], {
					...localised([""]),
					minLength: 3
				} as any);

				expect(result).toHaveProperty("en");
				const en = (result as any).en;
				expect(typeof en === "object" && typeof en["{minLength}"] === "string"
					&& en["{minLength}"].startsWith("(3/3)")).toBeTruthy();

			});

			it("includes count prefix for maxLength violations", async () => {

				const result = validateArrayLocalised([{ en: ["toolong", "alsotoolong"] }], {
					...localised([""]),
					maxLength: 3
				} as any);

				expect(result).toHaveProperty("en");
				const en = (result as any).en;
				expect(typeof en === "object" && typeof en["{maxLength}"] === "string"
					&& en["{maxLength}"].startsWith("(2/2)")).toBeTruthy();

			});

			it("counts only failing texts in prefix", async () => {

				const result = validateArrayLocalised([{ en: ["ab", "hello", "c"] }], {
					...localised([""]),
					minLength: 3
				} as any);

				expect(result).toHaveProperty("en");
				const en = (result as any).en;
				expect(typeof en === "object" && typeof en["{minLength}"] === "string"
					&& en["{minLength}"].startsWith("(2/3)")).toBeTruthy();

			});

		});

	});


	describe("validateScalarLocale", () => {

		it("accepts plain string shorthand", async () => {

			expect(validateScalarLocale("hello")).toBeUndefined();
			expect(validateScalarLocale("")).toBeUndefined();

		});

		it("accepts object with valid tag range keys", async () => {

			expect(validateScalarLocale({ "en": "hello" })).toBeUndefined();
			expect(validateScalarLocale({ "*": "hello" })).toBeUndefined();
			expect(validateScalarLocale({ "en-*": "hello" })).toBeUndefined();

		});

		it("accepts empty object", async () => {

			expect(validateScalarLocale({})).toBeUndefined();

		});

		it("rejects non-string non-object value", async () => {

			expect(validateScalarLocale(42)).toBeDefined();
			expect(validateScalarLocale(true)).toBeDefined();
			expect(validateScalarLocale(null)).toBeDefined();

		});

		it("rejects array value", async () => {

			expect(validateScalarLocale(["hello"])).toBeDefined();

		});

		it("reports invalid tag range keys", async () => {

			const result = validateScalarLocale({ "123": "hello" });

			expect(result).toBeDefined();
			expect(result).toHaveProperty("123");

		});

		it("reports non-string values", async () => {

			const result = validateScalarLocale({ en: 42 });

			expect(result).toBeDefined();
			expect(result).toHaveProperty("en");

		});

		it("reports only invalid entries in mixed object", async () => {

			const result = validateScalarLocale({ en: "hello", "123": "bad", fr: 42 });

			expect(result).toBeDefined();
			expect(result).toHaveProperty("123");
			expect(result).toHaveProperty("fr");
			expect(result).not.toHaveProperty("en");

		});

	});

	describe("validateArrayLocale", () => {

		it("accepts plain string shorthand", async () => {

			expect(validateArrayLocale("hello")).toBeUndefined();
			expect(validateArrayLocale("")).toBeUndefined();

		});

		it("accepts singleton string array shorthand", async () => {

			expect(validateArrayLocale(["hello"])).toBeUndefined();

		});

		it("accepts object with string values", async () => {

			expect(validateArrayLocale({ "en": "hello" })).toBeUndefined();

		});

		it("accepts object with singleton string array values", async () => {

			expect(validateArrayLocale({ "en": ["hello"] })).toBeUndefined();

		});

		it("accepts object with valid tag range keys", async () => {

			expect(validateArrayLocale({ "*": ["hello"] })).toBeUndefined();
			expect(validateArrayLocale({ "en-*": ["hello"] })).toBeUndefined();

		});

		it("accepts empty object", async () => {

			expect(validateArrayLocale({})).toBeUndefined();

		});

		it("rejects non-string non-array non-object value", async () => {

			expect(validateArrayLocale(42)).toBeDefined();
			expect(validateArrayLocale(true)).toBeDefined();
			expect(validateArrayLocale(null)).toBeDefined();

		});

		it("reports invalid tag range keys", async () => {

			const result = validateArrayLocale({ "123": ["hello"] });

			expect(result).toBeDefined();
			expect(result).toHaveProperty("123");

		});

		it("reports non-string non-array values", async () => {

			const result = validateArrayLocale({ en: 42 });

			expect(result).toBeDefined();
			expect(result).toHaveProperty("en");

		});

		it("reports only invalid entries in mixed object", async () => {

			const result = validateArrayLocale({ en: ["hello"], "123": ["bad"], fr: 42 });

			expect(result).toBeDefined();
			expect(result).toHaveProperty("123");
			expect(result).toHaveProperty("fr");
			expect(result).not.toHaveProperty("en");

		});

	});


	describe("mergeLocalised", () => {

		describe.each([

			["mergeLocalised (scalar)", mergeLocalised, localised, "localised", { "*": "" },
				{ target: { en: "hello", fr: "bonjour" }, source: { en: "hello", fr: "bonjour" } },
				{ equal: { en: "hello", fr: "bonjour" } },
				{ target: { en: "hello" }, source: { fr: "bonjour" }, expected: { en: "hello" } }
			],

			["mergeLocalised (array)", mergeLocalised, (constraints: any = {}) => ({
				...localised([""]),
				...constraints
			}), "localised", { "*": [""] },
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

});
