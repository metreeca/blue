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
import { checkDictionary, mergeDictionary, narrowsDictionary, validateDictionary } from "./dictionary.core.js";
import { dictionary } from "./dictionary.js";
import type { Scope } from "./index.core.js";


// navigate an array-shaped trace by key path, returning the value at the path or undefined

function at(trace: unknown, ...path: readonly string[]): unknown {
	return path.reduce<unknown>((node, key) => {
		const record = Array.isArray(node) ? node.find(item => item !== null && typeof item === "object") : node;
		return record === null || typeof record !== "object" ? undefined : (record as Record<string, unknown>)[key];
	}, trace);
}


describe("factories", () => {

	describe("dictionary", () => {

		describe("shape", () => {

			it("returns a shape with kind 'dictionary'", async () => {

				expect(dictionary().kind).toBe("dictionary");
				expect(dictionary({ uniqueLang: true }).kind).toBe("dictionary");

			});

			it("returns an immutable shape", async () => {

				const shape = dictionary();

				expect(() => Object.assign(shape, { kind: "string" })).toThrow();

			});

		});

		describe("constraints", () => {

			it("accepts the arity constraint", async () => {

				expect(dictionary({ uniqueLang: true }).uniqueLang).toBe(true);
				expect(dictionary({ uniqueLang: false }).uniqueLang).toBe(false);

			});

			it("accepts the length constraints", async () => {

				expect(dictionary({ minLength: 1 }).minLength).toBe(1);
				expect(dictionary({ maxLength: 100 }).maxLength).toBe(100);

			});

			it("accepts the language constraint", async () => {

				expect(dictionary({ languageIn: ["en", "fr"] }).languageIn).toEqual(["en", "fr"]);

			});

			describe("combined", () => {

				it("accepts multiple constraints", async () => {

					const shape = dictionary({
						uniqueLang: true, minLength: 1, maxLength: 100, languageIn: ["en", "fr"]
					});

					expect(shape.uniqueLang).toBe(true);
					expect(shape.minLength).toBe(1);
					expect(shape.maxLength).toBe(100);
					expect(shape.languageIn).toEqual(["en", "fr"]);

				});

				it("includes only provided entries", async () => {

					expect(Object.keys(dictionary()).sort()).toEqual(["kind"]);

				});

			});

			describe("consistency", () => {

				it("rejects contradictory length bounds", async () => {

					expect(() => dictionary({ minLength: 10, maxLength: 5 })).toThrow(RangeError);

				});

			});

		});

	});

});

describe("operators", () => {

	describe("checkDictionary", () => {

		it("returns undefined for consistent constraints", async () => {

			expect(checkDictionary({ minLength: 3, maxLength: 10 })).toBeUndefined();
			expect(checkDictionary({ minLength: 5, maxLength: 5 })).toBeUndefined();
			expect(checkDictionary({})).toBeUndefined();

		});

		it("returns trace for minLength > maxLength", async () => {

			expect(checkDictionary({ minLength: 10, maxLength: 5 }))
				.toContainEqual(expect.stringContaining("{minLength/maxLength}"));

		});

		it("returns undefined when only one bound is specified", async () => {

			expect(checkDictionary({ minLength: 5 })).toBeUndefined();
			expect(checkDictionary({ maxLength: 10 })).toBeUndefined();

		});

	});

	describe("narrowsDictionary", () => {

		it("accepts an identical child", async () => {

			expect(narrowsDictionary(dictionary(), dictionary())).toBeUndefined();

		});

		it("accepts a child that tightens minLength", async () => {

			expect(narrowsDictionary(dictionary({ minLength: 5 }), dictionary())).toBeUndefined();

		});

		it("rejects a child that widens minLength", async () => {

			expect(narrowsDictionary(dictionary({ minLength: 1 }), dictionary({ minLength: 5 }))).toBeDefined();

		});

		it("accepts a child that tightens maxLength", async () => {

			expect(narrowsDictionary(dictionary({ maxLength: 5 }), dictionary({ maxLength: 10 }))).toBeUndefined();

		});

		it("rejects a child that widens maxLength", async () => {

			expect(narrowsDictionary(dictionary({ maxLength: 10 }), dictionary({ maxLength: 5 }))).toBeDefined();

		});

		it("rejects a child with a disjoint languageIn", async () => {

			expect(narrowsDictionary(
				dictionary({ languageIn: ["en"] }),
				dictionary({ languageIn: ["fr"] })
			)).toBeDefined();

		});

		it("accepts a child narrowing languageIn", async () => {

			expect(narrowsDictionary(
				dictionary({ languageIn: ["en"] }),
				dictionary({ languageIn: ["en", "fr"] })
			)).toBeUndefined();

		});

		it("rejects a child widening languageIn", async () => {

			// a range the parent omits would be intersected away, leaving the state wider than the shape admits

			expect(narrowsDictionary(
				dictionary({ languageIn: ["en", "fr"] }),
				dictionary({ languageIn: ["en"] })
			)).toBeDefined();

		});

		it("accepts a child that inherits a unique-tagged parent", async () => {

			expect(narrowsDictionary(dictionary(), dictionary({ uniqueLang: true }))).toBeUndefined();

		});

		it("accepts a child that adds the arity constraint", async () => {

			expect(narrowsDictionary(dictionary({ uniqueLang: true }), dictionary())).toBeUndefined();

		});

		it("rejects a child that drops a unique-tagged parent", async () => {

			expect(narrowsDictionary(dictionary({ uniqueLang: false }), dictionary({ uniqueLang: true })))
				.toContainEqual(expect.stringContaining("{uniqueLang}"));

		});

	});

	describe("mergeDictionary", () => {

		describe("kind", () => {

			it("preserves kind as 'dictionary'", async () => {

				expect(mergeDictionary(dictionary(), dictionary()).kind).toBe("dictionary");

			});

		});

		describe("minLength", () => {

			it("inherits source minLength when target has none", async () => {

				expect(mergeDictionary(dictionary(), dictionary({ minLength: 5 })).minLength).toBe(5);

			});

			it("keeps target minLength when source has none", async () => {

				expect(mergeDictionary(dictionary({ minLength: 5 }), dictionary()).minLength).toBe(5);

			});

			it("keeps the tighter target minLength", async () => {

				expect(mergeDictionary(
					dictionary({ minLength: 10 }),
					dictionary({ minLength: 5 })
				).minLength).toBe(10);

			});

			it("rejects a widened target minLength", async () => {

				expect(() => mergeDictionary(
					dictionary({ minLength: 3 }),
					dictionary({ minLength: 5 })
				)).toThrow(RangeError);

			});

		});

		describe("maxLength", () => {

			it("inherits source maxLength when target has none", async () => {

				expect(mergeDictionary(dictionary(), dictionary({ maxLength: 100 })).maxLength).toBe(100);

			});

			it("keeps target maxLength when source has none", async () => {

				expect(mergeDictionary(dictionary({ maxLength: 100 }), dictionary()).maxLength).toBe(100);

			});

			it("keeps the tighter target maxLength", async () => {

				expect(mergeDictionary(
					dictionary({ maxLength: 50 }),
					dictionary({ maxLength: 100 })
				).maxLength).toBe(50);

			});

			it("rejects a widened target maxLength", async () => {

				expect(() => mergeDictionary(
					dictionary({ maxLength: 200 }),
					dictionary({ maxLength: 100 })
				)).toThrow(RangeError);

			});

		});

		describe("languageIn", () => {

			it("inherits source languageIn when target has none", async () => {

				expect(mergeDictionary(dictionary(), dictionary({ languageIn: ["en", "fr"] })).languageIn)
					.toEqual(["en", "fr"]);

			});

			it("keeps target languageIn when source has none", async () => {

				expect(mergeDictionary(dictionary({ languageIn: ["en", "fr"] }), dictionary()).languageIn)
					.toEqual(["en", "fr"]);

			});

			it("keeps a target languageIn narrowing source", async () => {

				expect(mergeDictionary(
					dictionary({ languageIn: ["en", "de"] }),
					dictionary({ languageIn: ["en", "fr", "de"] })
				).languageIn).toEqual(["en", "de"]);

			});

			it("rejects a target languageIn widening source", async () => {

				expect(() => mergeDictionary(
					dictionary({ languageIn: ["en", "fr", "de"] }),
					dictionary({ languageIn: ["en", "de", "it"] })
				)).toThrow(RangeError);

			});

			it("rejects disjoint sets", async () => {

				expect(() => mergeDictionary(
					dictionary({ languageIn: ["en"] }),
					dictionary({ languageIn: ["fr"] })
				)).toThrow(RangeError);

			});

		});

		describe("uniqueLang", () => {

			it("inherits a unique-tagged parent when the child omits it", async () => {

				expect(mergeDictionary(dictionary(), dictionary({ uniqueLang: true })).uniqueLang).toBe(true);

			});

			it("keeps the child arity when the parent omits it", async () => {

				expect(mergeDictionary(dictionary({ uniqueLang: true }), dictionary()).uniqueLang).toBe(true);

			});

			it("rejects a child that drops a unique-tagged parent", async () => {

				expect(() => mergeDictionary(
					dictionary({ uniqueLang: false }),
					dictionary({ uniqueLang: true })
				)).toThrow(RangeError);

			});

		});

		describe("post-merge validation", () => {

			it("rejects merged minLength > merged maxLength", async () => {

				expect(() => mergeDictionary(
					dictionary({ minLength: 10 }),
					dictionary({ maxLength: 5 })
				)).toThrow(RangeError);

			});

			it("accepts merged minLength equal to merged maxLength", async () => {

				const merged = mergeDictionary(dictionary({ minLength: 5 }), dictionary({ maxLength: 5 }));

				expect(merged.minLength).toBe(5);
				expect(merged.maxLength).toBe(5);

			});

		});

	});

});

describe("validators", () => {

	describe("validateDictionary", () => {

		describe("unique-tagged arity", () => {

			const unique = dictionary({ uniqueLang: true });

			describe("type filtering", () => {

				it("returns undefined for a tag-keyed map of strings", async () => {

					expect(validateDictionary([{ en: "hello" }], unique)).toBeUndefined();

				});

				it("returns undefined for empty values", async () => {

					expect(validateDictionary([], unique)).toBeUndefined();

				});

				it.each<[string, readonly unknown[]]>([
					["a plain string", ["hello"]],
					["an empty plain string", [""]],
					["a non-object value", [42]],
					["mixed valid and non-object values", [{ en: "hello" }, 42]]
				])("returns a kind trace for %s", async (_label, values) => {

					expect(validateDictionary(values, unique)).toContainEqual(expect.stringContaining("{kind}"));

				});

				it("rejects multiple map values", async () => {

					expect(validateDictionary([{ en: "hello" }, { fr: "bonjour" }], unique)).toBeDefined();

				});

			});

			describe("structural validation", () => {

				it("returns undefined for an empty map", async () => {

					expect(validateDictionary([{}], unique)).toBeUndefined();

				});

				it("keys a violation by an invalid tag", async () => {

					expect(at(validateDictionary([{ "123": "hello" }], unique), "123")).toBeDefined();

				});

				it("keys a violation by a tag carrying a non-string", async () => {

					expect(at(validateDictionary([{ en: 42 }], unique), "en")).toBeDefined();

				});

				it("rejects a tag carrying an array, which states the other arity", async () => {

					expect(at(validateDictionary([{ en: ["hello"] }], unique), "en"))
						.toEqual(["expected string value"]);

				});

				it("reports only the invalid entries", async () => {

					const trace = validateDictionary([{ en: "hello", "123": "bad tag", fr: 42 }], unique);

					expect(at(trace, "123")).toBeDefined();
					expect(at(trace, "fr")).toBeDefined();
					expect(at(trace, "en")).toBeUndefined();

				});

				it("does not apply constraints to structurally invalid entries", async () => {

					const trace = validateDictionary([{ en: 42 }], dictionary({ uniqueLang: true, minLength: 5 }));

					expect(at(trace, "en")).toEqual(["expected string value"]);

				});

			});

			describe("length constraints", () => {

				it("returns undefined when every string meets the minimum", async () => {

					expect(validateDictionary(
						[{ en: "hello", fr: "bonjour" }],
						dictionary({ uniqueLang: true, minLength: 3 })
					)).toBeUndefined();

				});

				it("keys a violation by the tag falling below the minimum", async () => {

					const trace = validateDictionary(
						[{ en: "hi", fr: "bonjour" }],
						dictionary({ uniqueLang: true, minLength: 5 })
					);

					expect(at(trace, "en")).toBeDefined();
					expect(at(trace, "fr")).toBeUndefined();

				});

				it("keys a violation by the tag exceeding the maximum", async () => {

					const trace = validateDictionary(
						[{ en: "hello", fr: "bonjour" }],
						dictionary({ uniqueLang: true, maxLength: 5 })
					);

					expect(at(trace, "fr")).toBeDefined();
					expect(at(trace, "en")).toBeUndefined();

				});

			});

			describe("languageIn constraint", () => {

				it("returns undefined when every tag matches an accepted range", async () => {

					expect(validateDictionary(
						[{ en: "hello", fr: "bonjour" }],
						dictionary({ uniqueLang: true, languageIn: ["en", "fr"] })
					)).toBeUndefined();

				});

				it("keys a violation by the tag outside the accepted ranges", async () => {

					const trace = validateDictionary(
						[{ en: "hello", de: "hallo" }],
						dictionary({ uniqueLang: true, languageIn: ["en", "fr"] })
					);

					expect(at(trace, "de")).toBeDefined();
					expect(at(trace, "en")).toBeUndefined();

				});

				it("matches a tag against a range by basic filtering", async () => {

					const shape = dictionary({ uniqueLang: true, languageIn: ["en"] });

					expect(validateDictionary([{ "en-US": "color" }], shape)).toBeUndefined();
					expect(validateDictionary([{ "en-GB": "colour" }], shape)).toBeUndefined();

				});

				it("rejects a base language where only a subtag is accepted", async () => {

					expect(at(validateDictionary(
						[{ en: "hello" }],
						dictionary({ uniqueLang: true, languageIn: ["en-US"] })
					), "en")).toBeDefined();

				});

			});

			describe("combined constraints", () => {

				it("returns undefined when every constraint is satisfied", async () => {

					expect(validateDictionary([{ en: "hello", fr: "bonjour" }], dictionary({
						uniqueLang: true,
						minLength: 2,
						maxLength: 10,
						languageIn: ["en", "fr"]
					}))).toBeUndefined();

				});

				it("keys a violation by the tag breaking the length bound", async () => {

					expect(at(validateDictionary([{ en: "hello" }], dictionary({
						uniqueLang: true,
						minLength: 10,
						languageIn: ["en"]
					})), "en")).toBeDefined();

				});

				it("keys a violation by the tag breaking the language constraint", async () => {

					expect(at(validateDictionary([{ fr: "bonjour" }], dictionary({
						uniqueLang: true,
						minLength: 2,
						languageIn: ["en"]
					})), "fr")).toBeDefined();

				});

			});

		});

		describe("stacked arity", () => {

			const stacked = dictionary();

			describe("type filtering", () => {

				it("returns undefined for a tag-keyed map of string arrays", async () => {

					expect(validateDictionary([{ en: ["hello"] }], stacked)).toBeUndefined();

				});

				it("returns undefined for empty values", async () => {

					expect(validateDictionary([], stacked)).toBeUndefined();

				});

				it.each<[string, readonly unknown[]]>([
					["a plain string array", [["hello"]]],
					["a non-object value", [42]],
					["mixed valid and non-object values", [{ en: ["hello"] }, 42]]
				])("returns a kind trace for %s", async (_label, values) => {

					expect(validateDictionary(values, stacked)).toContainEqual(expect.stringContaining("{kind}"));

				});

				it("rejects multiple map values", async () => {

					expect(validateDictionary([{ en: ["hello"] }, { fr: ["bonjour"] }], stacked)).toBeDefined();

				});

			});

			describe("structural validation", () => {

				it("returns undefined for an empty map", async () => {

					expect(validateDictionary([{}], stacked)).toBeUndefined();

				});

				it("returns undefined for a tag carrying an empty array", async () => {

					expect(validateDictionary([{ en: [] }], stacked)).toBeUndefined();

				});

				it("returns undefined for a tag carrying several strings", async () => {

					expect(validateDictionary([{ en: ["hello", "hi"] }], stacked)).toBeUndefined();

				});

				it("keys a violation by an invalid tag", async () => {

					expect(at(validateDictionary([{ "123": ["hello"] }], stacked), "123")).toBeDefined();

				});

				it("rejects a tag carrying a bare string, which states the other arity", async () => {

					expect(at(validateDictionary([{ en: "hello" }], stacked), "en"))
						.toEqual(["expected string array value"]);

				});

			});

			describe("length constraints", () => {

				it("holds every string under a tag to the bounds", async () => {

					const shape = dictionary({ minLength: 3 });

					expect(validateDictionary([{ en: ["hello", "hey"] }], shape)).toBeUndefined();
					expect(at(validateDictionary([{ en: ["hello", "hi"] }], shape), "en")).toBeDefined();

				});

			});

			describe("languageIn constraint", () => {

				it("keys a violation by the tag outside the accepted ranges", async () => {

					const trace = validateDictionary(
						[{ en: ["hello"], de: ["hallo"] }],
						dictionary({ languageIn: ["en", "fr"] })
					);

					expect(at(trace, "de")).toBeDefined();
					expect(at(trace, "en")).toBeUndefined();

				});

			});

		});

		describe.each<[string, Scope]>([
			["bound", "bound"],
			["model", "model"]
		])("%s scope", (_label, scope) => {

			it("skips the value-domain constraints", async () => {

				expect(validateDictionary([{ en: "hi" }], dictionary({
					uniqueLang: true,
					minLength: 5,
					languageIn: ["fr"]
				}), { scope })).toBeUndefined();

			});

			it("still rejects a value of the wrong kind", async () => {

				expect(validateDictionary(["hello"], dictionary({ uniqueLang: true }), { scope }))
					.toContainEqual(expect.stringContaining("{kind}"));

			});

		});

	});

});
