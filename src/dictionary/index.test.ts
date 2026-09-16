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
import { dictionary } from "./index.js";


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
