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
import type { Scope } from "../value/validator.js";
import { dictionary } from "./index.js";
import { validateDictionary } from "./validator.js";


/**
 * Navigates the trace of the first validated map by tag path, yielding the value at the path or `undefined`.
 *
 * Every violation is keyed by the index of the map carrying it, so the leading index is descended here once and
 * for all.
 */
function at(trace: unknown, ...path: readonly string[]): unknown {
	return ["0", ...path].reduce<unknown>((node, key) => {
		const record = Array.isArray(node) ? node.find(item => item !== null && typeof item === "object") : node;
		return record === null || typeof record !== "object" ? undefined : (record as Record<string, unknown>)[key];
	}, trace);
}


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

			it.each<[string, readonly unknown[], string]>([
				["a plain string", ["hello"], "0"],
				["an empty plain string", [""], "0"],
				["a non-object value", [42], "0"],
				["mixed valid and non-object values", [{ en: "hello" }, 42], "1"]
			])("keys a kind violation by element for %s", async (_label, values, index) => {

				expect(validateDictionary(values, unique))
					.toEqual([{ [index]: [expect.stringContaining("{kind}")] }]);

			});

			it("admits several maps, as a member may carry several", async () => {

				expect(validateDictionary([{ en: "hello" }, { fr: "bonjour" }], unique)).toBeUndefined();

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

			it.each<[string, readonly unknown[], string]>([
				["a plain string array", [["hello"]], "0"],
				["a non-object value", [42], "0"],
				["mixed valid and non-object values", [{ en: ["hello"] }, 42], "1"]
			])("keys a kind violation by element for %s", async (_label, values, index) => {

				expect(validateDictionary(values, stacked))
					.toEqual([{ [index]: [expect.stringContaining("{kind}")] }]);

			});

			it("admits several maps, as a member may carry several", async () => {

				expect(validateDictionary([{ en: ["hello"] }, { fr: ["bonjour"] }], stacked)).toBeUndefined();

			});

		});

		describe("structural validation", () => {

			it("returns undefined for an empty map", async () => {

				expect(validateDictionary([{}], stacked)).toBeUndefined();

			});

			it("returns undefined for a tag carrying an empty array", async () => {

				expect(validateDictionary([{ en: [] }], stacked)).toBeUndefined();

			});

			it.each<[string, readonly string[], Record<string, number>]>([
				["several texts below the lower bound", ["ab", "c", "d"], { minLength: 3 }],
				["several texts above the upper bound", ["toolong", "alsotoolong"], { maxLength: 3 }],
				["one text among several breaking the bound", ["ab", "hello", "c"], { minLength: 3 }]
			])("keys a length violation by the tag carrying %s", async (_label, texts, constraints) => {

				expect(JSON.stringify(at(validateDictionary([{ en: texts }], dictionary(constraints)), "en")))
					.toContain("{length}");

			});

			it("keys a length violation by the text breaking the bound within a tag", async () => {

				const trace = validateDictionary([{ en: ["hello", "ab"] }], dictionary({ minLength: 3 }));

				expect(JSON.stringify(at(trace, "en"))).toContain("1");

			});

			it("keys a violation by the map carrying it, a member admitting several", async () => {

				const trace = validateDictionary([{ en: ["hello"] }, { en: ["ab"] }], dictionary({ minLength: 3 }));

				expect(trace).toEqual([{ "1": [{ en: expect.anything() }] }]);

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
				.toEqual([{ "0": [expect.stringContaining("{kind}")] }]);

		});

	});

});
