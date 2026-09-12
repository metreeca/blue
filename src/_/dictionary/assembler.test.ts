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
import { checkDictionary, mergeDictionary, narrowsDictionary } from "./assembler.js";
import { dictionary } from "./index.js";


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
