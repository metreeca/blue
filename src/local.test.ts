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
import { checkLocalized, mergeLocal, mergeLocals, validateLocal, validateLocals } from "./local.core.js";
import { local, locals } from "./local.js";


describe("factories", () => {

	describe("local", () => {

		describe("shape", () => {

			it("returns a shape with kind 'local'", async () => {

				expect(local().kind).toBe("local");
				expect(local({ "*": "example" }).kind).toBe("local");
				expect(local({ minLength: 1 }).kind).toBe("local");

			});

			it("returns a shape with default model", async () => {

				expect(local().model).toEqual({ "*": "" });
				expect(local({}).model).toEqual({ "*": "" });

			});

			it("returns a shape with model argument", async () => {

				expect(local({ "*": "example" }).model).toEqual({ "*": "example" });
				expect(local({ en: "hello", fr: "bonjour" }).model).toEqual({ en: "hello", fr: "bonjour" });

			});

			it("normalizes string model shorthand to { und: value }", async () => {

				expect(local("example").model).toEqual({ "*": "example" });
				expect(local("").model).toEqual({ "*": "" });

			});

			it("normalizes string model in constraints to { *: value }", async () => {

				expect(local({ model: "example" }).model).toEqual({ "*": "example" });

			});

			it("returns an immutable shape", async () => {

				const shape = local();

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).model = { "*": "test" }).toThrow();

			});

		});

	});

	describe("locals", () => {

		describe("shape", () => {

			it("returns a shape with kind 'locals'", async () => {

				expect(locals().kind).toBe("locals");
				expect(locals({ minLength: 1 }).kind).toBe("locals");

			});

			it("returns a shape with default model", async () => {

				expect(locals().model).toEqual({ "*": [""] });
				expect(locals({}).model).toEqual({ "*": [""] });

			});

			it("normalizes string array model shorthand to { *: value }", async () => {

				expect(locals({ model: ["example"] }).model).toEqual({ "*": ["example"] });

			});

			it("returns an immutable shape", async () => {

				const shape = locals();

				expect(() => (shape as any).kind = "local").toThrow();
				expect(() => (shape as any).model = { "*": ["test"] }).toThrow();

			});

		});

	});

	describe.each([

		["local", local],
		["locals", locals]

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

	describe("validateLocal", () => {

		describe("type filtering", () => {

			it("returns undefined for valid local values", async () => {

				expect(validateLocal([{ "en": "hello" }], local())).toBeUndefined();

			});

			it("returns undefined for plain string shorthand", async () => {

				expect(validateLocal(["hello"], local())).toBeUndefined();

			});

			it("returns undefined for empty values array", async () => {

				expect(validateLocal([], local())).toBeUndefined();

			});

			it("returns trace with kind key for non-object non-string value", async () => {

				const trace = validateLocal([42], local());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

			it("returns trace with kind key for multiple non-object non-string values", async () => {

				const trace = validateLocal([42, true], local());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");
				expect((trace as Record<string, string>)["{kind}"]).toMatch(/\(2\/2\)/);

			});

			it("returns trace with kind key for mixed valid and non-object values", async () => {

				const trace = validateLocal([{ "en": "hello" }, 42], local());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

		});

		describe("structural validation", () => {

			it("returns undefined for empty object", async () => {

				expect(validateLocal([{}], local())).toBeUndefined();

			});

			it("returns trace for object with invalid tag key", async () => {

				const result = validateLocal([{ "123": "hello" }], local());

				expect(result).toBeDefined();
				expect(result).toHaveProperty("123");

			});

			it("returns trace for object with non-string value", async () => {

				const result = validateLocal([{ en: 42 }], local());

				expect(result).toBeDefined();
				expect(result).toHaveProperty("en");

			});

			it("reports only invalid entries in mixed object", async () => {

				const result = validateLocal([{ en: "hello", "123": "bad tag", fr: 42 }], local());

				expect(result).toBeDefined();
				expect(result).toHaveProperty("123");
				expect(result).toHaveProperty("fr");
				expect(result).not.toHaveProperty("en");

			});

			it("validates structural issues alongside constraint violations", async () => {

				const result = validateLocal([{ en: "hi", "123": "bad" }], local({ minLength: 5 }));

				expect(result).toBeDefined();
				expect(result).toHaveProperty("123"); // invalid tag
				expect(result).toHaveProperty("en"); // valid tag but fails minLength

			});

			it("does not apply constraints to structurally invalid entries", async () => {

				const result = validateLocal([{ en: 42 }], local({ minLength: 5 }));

				expect(result).toBeDefined();
				expect(result).toHaveProperty("en");

				// structural error, not a constraint error
				const en = (result as any).en;
				expect(typeof en === "string" || (typeof en === "object" && !en["{minLength}"])).toBeTruthy();

			});

		});

		describe("minLength constraint", () => {

			it("returns undefined when all strings meet minimum length", async () => {

				expect(validateLocal([{ en: "hello", fr: "bonjour" }], local({ minLength: 3 }))).toBeUndefined();

			});

			it("returns trace when any string is below minimum length", async () => {

				const result = validateLocal([{ en: "hi", fr: "bonjour" }], local({ minLength: 5 }));

				expect(result).toHaveProperty("en");
				expect(result).not.toHaveProperty("fr");

			});

			it("returns trace for empty string when minLength > 0", async () => {

				expect(validateLocal([{ en: "" }], local({ minLength: 1 }))).toHaveProperty("en");

			});

		});

		describe("maxLength constraint", () => {

			it("returns undefined when all strings are within maximum length", async () => {

				expect(validateLocal([{ en: "hello", fr: "bonjour" }], local({ maxLength: 10 }))).toBeUndefined();

			});

			it("returns trace when any string exceeds maximum length", async () => {

				const result = validateLocal([{
					en: "hello",
					fr: "bonjour"
				}], local({ maxLength: 5 }));

				expect(result).toHaveProperty("fr");

			});

		});

		describe("languageIn constraint", () => {

			it("returns undefined when all tags match allowed languages", async () => {

				expect(validateLocal([{
					en: "hello",
					fr: "bonjour"
				}], local({ languageIn: ["en", "fr"] }))).toBeUndefined();

			});

			it("returns trace when tag is not in allowed languages", async () => {

				const result = validateLocal([{
					en: "hello",
					de: "hallo"
				}], local({ languageIn: ["en", "fr"] }));

				expect(result).toHaveProperty("de");
				expect(result).not.toHaveProperty("en");

			});

			it("handles language range matching", async () => {

				const shape = local({ languageIn: ["en-*"] });

				expect(validateLocal([{ "en-US": "color" }], shape)).toBeUndefined();
				expect(validateLocal([{ "en-GB": "colour" }], shape)).toBeUndefined();

			});

			it("returns trace for base language when only subtag allowed", async () => {

				expect(validateLocal([{ en: "hello" }], local({ languageIn: ["en-US"] }))).toHaveProperty("en");

			});

		});

		describe("combined constraints", () => {

			it("returns undefined when all constraints are satisfied", async () => {

				expect(validateLocal([{ en: "hello", fr: "bonjour" }], local({
					minLength: 2,
					maxLength: 10,
					languageIn: ["en", "fr"]
				}))).toBeUndefined();

			});

			it("returns trace when length constraint fails", async () => {

				const result = validateLocal([{ en: "hello" }], local({
					minLength: 10,
					languageIn: ["en"]
				}));

				expect(result).toHaveProperty("en");

			});

			it("returns trace when language constraint fails", async () => {

				const result = validateLocal([{ fr: "bonjour" }], local({
					minLength: 2,
					languageIn: ["en"]
				}));

				expect(result).toHaveProperty("fr");

			});

		});

		describe("string shorthand", () => {

			it("validates plain string values as { und: value }", async () => {

				expect(validateLocal(["hello"], local({ minLength: 3 }))).toBeUndefined();

			});

			it("returns trace when plain string fails length constraint", async () => {

				expect(validateLocal(["hi"], local({ minLength: 5 }))).toHaveProperty("und");

			});

			it("returns trace when plain string fails languageIn constraint", async () => {

				expect(validateLocal(["hello"], local({ languageIn: ["en"] }))).toHaveProperty("und");

			});

			it("returns undefined when plain string matches languageIn with und", async () => {

				expect(validateLocal(["hello"], local({ languageIn: ["und"] }))).toBeUndefined();

			});

		});

	});

	describe("validateLocals", () => {

		describe("type filtering", () => {

			it("returns undefined for valid locals values", async () => {

				expect(validateLocals([{ "en": ["hello"] }], locals())).toBeUndefined();

			});

			it("returns undefined for plain string array shorthand", async () => {

				expect(validateLocals([["hello"]], locals())).toBeUndefined();

			});

			it("returns undefined for empty values array", async () => {

				expect(validateLocals([], locals())).toBeUndefined();

			});

			it("returns trace with kind key for non-object non-array value", async () => {

				const trace = validateLocals([42], locals());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

			it("returns trace with kind key for multiple non-object non-array values", async () => {

				const trace = validateLocals([42, true], locals());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");
				expect((trace as Record<string, string>)["{kind}"]).toMatch(/\(2\/2\)/);

			});

			it("returns trace with kind key for mixed valid and non-object values", async () => {

				const trace = validateLocals([{ "en": ["hello"] }, 42], locals());

				expect(trace).toBeDefined();
				expect(trace).toHaveProperty("{kind}");

			});

			it("rejects local value for locals shape", async () => {

				expect(validateLocals([{ "en": "hello" }], locals())).toBeDefined();

			});

		});

		describe("structural validation", () => {

			it("returns undefined for empty object", async () => {

				expect(validateLocals([{}], locals())).toBeUndefined();

			});

			it("returns trace for object with invalid tag key", async () => {

				const result = validateLocals([{ "123": ["hello"] }], locals());

				expect(result).toBeDefined();
				expect(result).toHaveProperty("123");

			});

			it("returns trace for object with non-string-array value", async () => {

				const result = validateLocals([{ en: "hello" }], locals());

				expect(result).toBeDefined();
				expect(result).toHaveProperty("en");

			});

			it("reports only invalid entries in mixed object", async () => {

				const result = validateLocals([{ en: ["hello"], "123": ["bad tag"], fr: "not array" }], locals());

				expect(result).toBeDefined();
				expect(result).toHaveProperty("123");
				expect(result).toHaveProperty("fr");
				expect(result).not.toHaveProperty("en");

			});

			it("does not apply constraints to structurally invalid entries", async () => {

				const result = validateLocals([{ en: "hello" }], locals({ minLength: 5 }));

				expect(result).toBeDefined();
				expect(result).toHaveProperty("en");

				const en = (result as any).en;
				expect(typeof en === "string" || (typeof en === "object" && !en["{minLength}"])).toBeTruthy();

			});

		});

		describe("minLength constraint", () => {

			it("returns undefined when all strings meet minimum length", async () => {

				expect(validateLocals([{
					en: ["hello", "world"],
					fr: ["bonjour"]
				}], locals({ minLength: 3 }))).toBeUndefined();

			});

			it("returns trace when any string is below minimum length", async () => {

				const result = validateLocals([{ en: ["hello", "hi"] }], locals({ minLength: 5 }));

				expect(result).toHaveProperty("en");

			});

		});

		describe("maxLength constraint", () => {

			it("returns undefined when all strings are within maximum length", async () => {

				expect(validateLocals([{
					en: ["hello", "hi"],
					fr: ["bonjour"]
				}], locals({ maxLength: 10 }))).toBeUndefined();

			});

			it("returns trace when any string exceeds maximum length", async () => {

				const result = validateLocals([{ en: ["hello", "greetings"] }], locals({ maxLength: 5 }));

				expect(result).toHaveProperty("en");

			});

		});

		describe("languageIn constraint", () => {

			it("returns undefined when all tags match allowed languages", async () => {

				expect(validateLocals([{
					en: ["hello"],
					fr: ["bonjour"]
				}], locals({ languageIn: ["en", "fr"] }))).toBeUndefined();

			});

			it("returns trace when tag is not in allowed languages", async () => {

				const result = validateLocals([{
					en: ["hello"],
					de: ["hallo"]
				}], locals({ languageIn: ["en", "fr"] }));

				expect(result).toHaveProperty("de");
				expect(result).not.toHaveProperty("en");

			});

			it("handles language range matching", async () => {

				expect(validateLocals([{ "en-US": ["color"] }], locals({ languageIn: ["en-*"] }))).toBeUndefined();

			});

		});

		describe("combined constraints", () => {

			it("returns undefined when all constraints are satisfied", async () => {

				expect(validateLocals([{ en: ["hello", "world"], fr: ["bonjour"] }], locals({
					minLength: 2,
					maxLength: 10,
					languageIn: ["en", "fr"]
				}))).toBeUndefined();

			});

			it("returns trace when any constraint fails", async () => {

				const result = validateLocals([{ en: ["hello"] }], locals({
					minLength: 10,
					languageIn: ["en"]
				}));

				expect(result).toHaveProperty("en");

			});

		});

		describe("string array shorthand", () => {

			it("validates plain string array values as { und: value }", async () => {

				expect(validateLocals([["hello", "world"]], locals({ minLength: 3 }))).toBeUndefined();

			});

			it("returns trace when plain string array fails length constraint", async () => {

				expect(validateLocals([["hi"]], locals({ minLength: 5 }))).toHaveProperty("und");

			});

			it("returns trace when plain string array fails languageIn constraint", async () => {

				expect(validateLocals([["hello"]], locals({ languageIn: ["en"] }))).toHaveProperty("und");

			});

			it("returns undefined when plain string array matches languageIn with und", async () => {

				expect(validateLocals([["hello"]], locals({ languageIn: ["und"] }))).toBeUndefined();

			});

		});

		describe("per-value errors", () => {

			it("includes count prefix for multiple failing texts", async () => {

				const result = validateLocals([{ en: ["ab", "c", "d"] }], locals({ minLength: 3 }));

				expect(result).toHaveProperty("en");
				const en = (result as any).en;
				expect(typeof en === "object" && typeof en["{minLength}"] === "string"
					&& en["{minLength}"].startsWith("(3/3)")).toBeTruthy();

			});

			it("includes count prefix for maxLength violations", async () => {

				const result = validateLocals([{ en: ["toolong", "alsotoolong"] }], locals({ maxLength: 3 }));

				expect(result).toHaveProperty("en");
				const en = (result as any).en;
				expect(typeof en === "object" && typeof en["{maxLength}"] === "string"
					&& en["{maxLength}"].startsWith("(2/2)")).toBeTruthy();

			});

			it("counts only failing texts in prefix", async () => {

				const result = validateLocals([{ en: ["ab", "hello", "c"] }], locals({ minLength: 3 }));

				expect(result).toHaveProperty("en");
				const en = (result as any).en;
				expect(typeof en === "object" && typeof en["{minLength}"] === "string"
					&& en["{minLength}"].startsWith("(2/3)")).toBeTruthy();

			});

		});

	});

	describe.each([

		["mergeLocal", mergeLocal, local, "local", { "*": "" },
			{ target: { en: "hello", fr: "bonjour" }, source: { en: "hello", fr: "bonjour" } },
			{ equal: { en: "hello", fr: "bonjour" } },
			{ target: { en: "hello" }, source: { fr: "bonjour" }, expected: { en: "hello" } }
		],

		["mergeLocals", mergeLocals, locals, "locals", { "*": [""] },
			{
				target: { model: { en: ["hello"], fr: ["bonjour"] } },
				source: { model: { en: ["hello"], fr: ["bonjour"] } }
			},
			{ equal: { en: ["hello"], fr: ["bonjour"] } },
			{ target: { model: { en: ["hello"] } }, source: { model: { fr: ["bonjour"] } }, expected: { en: ["hello"] } }
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

	describe("checkLocalized", () => {

		it("returns undefined for consistent constraints", async () => {

			expect(checkLocalized({ minLength: 1, maxLength: 10 })).toBeUndefined();

		});

		it("returns undefined when minLength equals maxLength", async () => {

			expect(checkLocalized({ minLength: 5, maxLength: 5 })).toBeUndefined();

		});

		it("returns undefined when only minLength is provided", async () => {

			expect(checkLocalized({ minLength: 5 })).toBeUndefined();

		});

		it("returns undefined when only maxLength is provided", async () => {

			expect(checkLocalized({ maxLength: 5 })).toBeUndefined();

		});

		it("returns undefined when no constraints are provided", async () => {

			expect(checkLocalized({})).toBeUndefined();

		});

		it("returns trace when minLength > maxLength", async () => {

			const trace = checkLocalized({ minLength: 10, maxLength: 5 });

			expect(trace).toBeDefined();
			expect(trace).toHaveProperty("{minLength/maxLength}");

		});

	});

});
