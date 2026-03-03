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
	isLocalConstraints,
	isLocalizedConstraints,
	isLocalsConstraints,
	isLocalShape,
	isLocalsShape,
	validateLocal,
	validateLocals
} from "./local.core.js";
import { local, locals } from "./local.js";


describe("guards", () => {

	describe("isLocalShape", () => {

		it("returns true for valid local shape", async () => {

			expect(isLocalShape(local())).toBe(true);
			expect(isLocalShape(local({ "*": "example" }))).toBe(true);

		});

		it("returns false for object with wrong kind", async () => {

			expect(isLocalShape({ kind: "string", model: { "*": "" } })).toBe(false);

		});

		it("returns true for object with string model shorthand", async () => {

			expect(isLocalShape({ kind: "local", model: "text" })).toBe(true);

		});

		it("returns false for non-object values", async () => {

			expect(isLocalShape(null)).toBe(false);
			expect(isLocalShape(undefined)).toBe(false);

		});

	});

	describe("isLocalsShape", () => {

		it("returns true for valid locals shape", async () => {

			expect(isLocalsShape(locals())).toBe(true);

		});

		it("returns false for object with wrong kind", async () => {

			expect(isLocalsShape({ kind: "local", model: { "*": [""] } })).toBe(false);

		});

		it("returns false for object with non-locals model", async () => {

			expect(isLocalsShape({ kind: "locals", model: { "*": "" } })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isLocalsShape(null)).toBe(false);
			expect(isLocalsShape(undefined)).toBe(false);

		});

	});

	describe("isLocalConstraints", () => {

		it("returns true for empty object", async () => {

			expect(isLocalConstraints({})).toBe(true);

		});

		it("returns true for object with valid constraints", async () => {

			expect(isLocalConstraints({ minLength: 1, maxLength: 100 })).toBe(true);
			expect(isLocalConstraints({ languageIn: ["en", "fr"] })).toBe(true);

		});

		it("returns true for object with model", async () => {

			expect(isLocalConstraints({ model: { "*": "" } })).toBe(true);
			expect(isLocalConstraints({ model: { en: "hello" }, minLength: 1 })).toBe(true);

		});

		it("returns true for object with string model shorthand", async () => {

			expect(isLocalConstraints({ model: "text" })).toBe(true);

		});

		it("returns false for object with invalid model", async () => {

			expect(isLocalConstraints({ model: { en: 42 } })).toBe(false);

		});

		it("returns false for object with non-number length constraints", async () => {

			expect(isLocalConstraints({ minLength: "1" })).toBe(false);
			expect(isLocalConstraints({ maxLength: "100" })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isLocalConstraints(null)).toBe(false);
			expect(isLocalConstraints(undefined)).toBe(false);

		});

	});

	describe("isLocalsConstraints", () => {

		it("returns true for empty object", async () => {

			expect(isLocalsConstraints({})).toBe(true);

		});

		it("returns true for object with valid constraints", async () => {

			expect(isLocalsConstraints({ minLength: 1, maxLength: 100 })).toBe(true);
			expect(isLocalsConstraints({ languageIn: ["en", "fr"] })).toBe(true);

		});

		it("returns true for object with model", async () => {

			expect(isLocalsConstraints({ model: { "*": [""] } })).toBe(true);
			expect(isLocalsConstraints({ model: { en: ["hello"] }, minLength: 1 })).toBe(true);

		});

		it("returns false for object with invalid model", async () => {

			expect(isLocalsConstraints({ model: "text" })).toBe(false);
			expect(isLocalsConstraints({ model: { en: "hello" } })).toBe(false);

		});

		it("returns false for object with non-number length constraints", async () => {

			expect(isLocalsConstraints({ minLength: "1" })).toBe(false);
			expect(isLocalsConstraints({ maxLength: "100" })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isLocalsConstraints(null)).toBe(false);
			expect(isLocalsConstraints(undefined)).toBe(false);

		});

	});

	describe("isLocalizedConstraints", () => {

		it("returns true for empty object", async () => {

			expect(isLocalizedConstraints({})).toBe(true);

		});

		it("returns true for object with valid constraints", async () => {

			expect(isLocalizedConstraints({ minLength: 1, maxLength: 100 })).toBe(true);
			expect(isLocalizedConstraints({ languageIn: ["en", "fr"] })).toBe(true);

		});

		it("returns false for object with non-number length constraints", async () => {

			expect(isLocalizedConstraints({ minLength: "1" })).toBe(false);
			expect(isLocalizedConstraints({ maxLength: "100" })).toBe(false);

		});

		it("returns false for non-object values", async () => {

			expect(isLocalizedConstraints(null)).toBe(false);
			expect(isLocalizedConstraints(undefined)).toBe(false);

		});

	});

});

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

				expect(local("example").model).toEqual({ und: "example" });
				expect(local("").model).toEqual({ und: "" });

			});

			it("normalizes string model in constraints to { und: value }", async () => {

				expect(local({ model: "example" }).model).toEqual({ und: "example" });

			});

			it("returns an immutable shape", async () => {

				const shape = local();

				expect(() => (shape as any).kind = "string").toThrow();
				expect(() => (shape as any).model = { "*": "test" }).toThrow();

			});

		});

		describe("constraints", () => {

			describe("minLength", () => {

				it("accepts constraint", async () => {

					expect(local({ minLength: 1 }).minLength).toBe(1);

				});

				it("rejects non-number value", async () => {

					expect(() => local({ minLength: "1" } as any)).toThrow(TypeError);

				});

			});

			describe("maxLength", () => {

				it("accepts constraint", async () => {

					expect(local({ maxLength: 100 }).maxLength).toBe(100);

				});

				it("rejects non-number value", async () => {

					expect(() => local({ maxLength: "100" } as any)).toThrow(TypeError);

				});

			});

			describe("languageIn", () => {

				it("accepts constraint", async () => {

					expect(local({ languageIn: ["en", "fr"] }).languageIn).toEqual(["en", "fr"]);

				});

				it("rejects non-array value", async () => {

					expect(() => local({ languageIn: "en" } as any)).toThrow(TypeError);

				});

				it("rejects non-string array elements", async () => {

					expect(() => local({ languageIn: ["en", 42] } as any)).toThrow(TypeError);

				});

			});

			describe("combined", () => {

				it("accepts multiple constraints", async () => {

					const shape = local({ minLength: 1, maxLength: 100, languageIn: ["en", "fr"] });

					expect(shape.minLength).toBe(1);
					expect(shape.maxLength).toBe(100);
					expect(shape.languageIn).toEqual(["en", "fr"]);

				});

				it("includes only provided properties", async () => {

					expect(Object.keys(local()).sort()).toEqual(["kind", "languageIn", "model"]);

				});

				it("rejects extra properties", async () => {

					expect(() => local({ _extra: "ignored" } as any)).toThrow(TypeError);

				});

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

			it("normalizes string array model shorthand to { und: value }", async () => {

				expect(locals({ model: ["example"] }).model).toEqual({ und: ["example"] });

			});

			it("returns an immutable shape", async () => {

				const shape = locals();

				expect(() => (shape as any).kind = "local").toThrow();
				expect(() => (shape as any).model = { "*": ["test"] }).toThrow();

			});

		});

		describe("constraints", () => {

			describe("minLength", () => {

				it("accepts constraint", async () => {

					expect(locals({ minLength: 1 }).minLength).toBe(1);

				});

				it("rejects non-number value", async () => {

					expect(() => locals({ minLength: "1" } as any)).toThrow(TypeError);

				});

			});

			describe("maxLength", () => {

				it("accepts constraint", async () => {

					expect(locals({ maxLength: 100 }).maxLength).toBe(100);

				});

				it("rejects non-number value", async () => {

					expect(() => locals({ maxLength: "100" } as any)).toThrow(TypeError);

				});

			});

			describe("languageIn", () => {

				it("accepts constraint", async () => {

					expect(locals({ languageIn: ["en", "fr"] }).languageIn).toEqual(["en", "fr"]);

				});

				it("rejects non-array value", async () => {

					expect(() => locals({ languageIn: "en" } as any)).toThrow(TypeError);

				});

				it("rejects non-string array elements", async () => {

					expect(() => locals({ languageIn: ["en", 42] } as any)).toThrow(TypeError);

				});

			});

			describe("combined", () => {

				it("accepts multiple constraints", async () => {

					const shape = locals({ minLength: 1, maxLength: 100, languageIn: ["en", "fr"] });

					expect(shape.minLength).toBe(1);
					expect(shape.maxLength).toBe(100);
					expect(shape.languageIn).toEqual(["en", "fr"]);

				});

				it("includes only provided properties", async () => {

					expect(Object.keys(locals()).sort()).toEqual(["kind", "languageIn", "model"]);

				});

				it("rejects extra properties", async () => {

					expect(() => locals({ extra: "ignored" } as any)).toThrow(TypeError);

				});

			});

		});

	});

});

describe("validators", () => {

	describe("validateLocal", () => {

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

		describe("trace structure", () => {

			it("includes tag key for length violation", async () => {

				const result = validateLocal([{ en: "hi" }], local({ minLength: 5 }));

				expect(result).toHaveProperty("en");

			});

			it("includes tag key for language constraint violation", async () => {

				const result = validateLocal([{ de: "hallo" }], local({ languageIn: ["en", "fr"] }));

				expect(result).toHaveProperty("de");

			});

			it("includes only violating tag keys", async () => {

				const result = validateLocal([{ en: "hi", fr: "bonjour" }], local({ minLength: 5 }));

				expect(result).toHaveProperty("en");
				expect(result).not.toHaveProperty("fr");

			});

			it("includes range key for subtag violation", async () => {

				const result = validateLocal([{ "en-US": "color", "de": "farbe" }], local({ languageIn: ["en-*"] }));

				expect(result).toHaveProperty("de");
				expect(result).not.toHaveProperty("en-US");

			});

		});

	});

	describe("validateLocals", () => {

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

		describe("trace structure", () => {

			it("includes tag key for length violation", async () => {

				const result = validateLocals([{ en: ["hi"] }], locals({ minLength: 5 }));

				expect(result).toHaveProperty("en");

			});

			it("includes tag key for language constraint violation", async () => {

				const result = validateLocals([{ de: ["hallo"] }], locals({ languageIn: ["en", "fr"] }));

				expect(result).toHaveProperty("de");

			});

			it("includes only violating tag keys", async () => {

				const result = validateLocals([{ en: ["hi"], fr: ["bonjour"] }], locals({ minLength: 5 }));

				expect(result).toHaveProperty("en");
				expect(result).not.toHaveProperty("fr");

			});

			it("includes range key for subtag violation", async () => {

				const result = validateLocals([{
					"en-US": ["color"],
					"de": ["farbe"]
				}], locals({ languageIn: ["en-*"] }));

				expect(result).toHaveProperty("de");
				expect(result).not.toHaveProperty("en-US");

			});

		});

		describe("per-value errors", () => {

			it("includes count prefix for multiple failing texts", async () => {

				const result = validateLocals([{ en: ["ab", "c", "d"] }], locals({ minLength: 3 }));

				expect(result).toHaveProperty("en");
				const en = (result as any).en;
				expect(typeof en === "object" && typeof en.minLength === "string"
					&& en.minLength.startsWith("(3/3)")).toBeTruthy();

			});

			it("includes count prefix for maxLength violations", async () => {

				const result = validateLocals([{ en: ["toolong", "alsotoolong"] }], locals({ maxLength: 3 }));

				expect(result).toHaveProperty("en");
				const en = (result as any).en;
				expect(typeof en === "object" && typeof en.maxLength === "string"
					&& en.maxLength.startsWith("(2/2)")).toBeTruthy();

			});

			it("counts only failing texts in prefix", async () => {

				const result = validateLocals([{ en: ["ab", "hello", "c"] }], locals({ minLength: 3 }));

				expect(result).toHaveProperty("en");
				const en = (result as any).en;
				expect(typeof en === "object" && typeof en.minLength === "string"
					&& en.minLength.startsWith("(2/3)")).toBeTruthy();

			});

		});

	});

});
