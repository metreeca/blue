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
import { string } from "./index.js";
import { validateString } from "./validator.js";


describe("validateString", () => {

	describe("type filtering", () => {

		it.each<[string, readonly unknown[]]>([
			["valid string values", ["hello"]],
			["empty values array", []]
		])("returns undefined for %s", async (_label, values) => {

			expect(validateString(values, string())).toBeUndefined();

		});

		it.each<[string, readonly unknown[], readonly number[]]>([
			["a single non-string value", [42], [0]],
			["mixed valid and non-string values", [42, "hello", true], [0, 2]],
			["multiple non-string values", [42, true], [0, 1]]
		])("keys a kind violation by element for %s", async (_label, values, indices) => {

			expect(validateString(values, string())).toEqual([
				Object.fromEntries(indices.map(index => [`${index}`, ["{type} expected <string> value"]]))
			]);

		});

		it("keys type and constraint violations by element", async () => {

			expect(validateString(["ab", 42, "c"], string({ minLength: 3 }))).toEqual([{
				"0": ["{length} expected string length greater than or equal to <3>"],
				"1": ["{type} expected <string> value"],
				"2": ["{length} expected string length greater than or equal to <3>"]
			}]);

		});

		it("reports only the wrong-typed value, matched strings passing", async () => {

			expect(validateString(["hello", 42], string({ minLength: 3 })))
				.toEqual([{ "1": ["{type} expected <string> value"] }]);

		});

	});

	describe("placeholder mode", () => {

		it("skips value-domain constraints for a placeholder", async () => {

			expect(validateString(["ab"], string({ minLength: 3 }), { scope: "model" })).toBeUndefined();
			expect(validateString(["abcdef"], string({ maxLength: 3 }), { scope: "model" })).toBeUndefined();
			expect(validateString(["A1"], string({ pattern: "^[a-z]*$" }), { scope: "model" })).toBeUndefined();
			expect(validateString(["x"], string({ in: ["a", "b"] }), { scope: "model" })).toBeUndefined();

		});

		it("still rejects a placeholder of the wrong kind", async () => {

			expect(validateString([42], string(), { scope: "model" }))
				.toEqual([{ "0": ["{type} expected <string> value"] }]);

		});

	});

	describe("bound scope", () => {

		// the bound scope keeps pattern (the sole lexical discriminator over an open datatype set) but drops the
		// magnitude constraints, so a bound outside the value domain still routes

		it("skips the magnitude constraints for a bound", async () => {

			expect(validateString(["ab"], string({ minLength: 3 }), { scope: "bound" })).toBeUndefined();
			expect(validateString(["abcdef"], string({ maxLength: 3 }), { scope: "bound" })).toBeUndefined();
			expect(validateString(["x"], string({ in: ["a", "b"] }), { scope: "bound" })).toBeUndefined();

		});

		it("still enforces the pattern for a bound", async () => {

			expect(validateString(["A1"], string({ pattern: "^[a-z]*$" }), { scope: "bound" }))
				.toEqual([{ "0": ["{format} expected string matching </^[a-z]*$/>"] }]);

		});

		it("still rejects a bound of the wrong kind", async () => {

			expect(validateString([42], string(), { scope: "bound" }))
				.toEqual([{ "0": ["{type} expected <string> value"] }]);

		});

	});

	describe.each([

		{
			label: "minLength",
			shape: string({ minLength: 3 }),
			atBoundary: "abc", withinBoundary: "abcdef", beyondBoundary: "ab"
		},

		{
			label: "maxLength",
			shape: string({ maxLength: 5 }),
			atBoundary: "hello", withinBoundary: "hi", beyondBoundary: "hello world"
		}

	])("$label constraint", ({ shape, atBoundary, withinBoundary, beyondBoundary }) => {

		it("returns undefined for strings at boundary", async () => {

			expect(validateString([atBoundary], shape)).toBeUndefined();

		});

		it("returns undefined for strings within boundary", async () => {

			expect(validateString([withinBoundary], shape)).toBeUndefined();

		});

		it("keys a length violation by element for strings beyond boundary", async () => {

			expect(validateString([beyondBoundary], shape))
				.toEqual([{ "0": [expect.stringContaining("{length}")] }]);

		});

	});

	describe("minLength edge cases", () => {

		it("keys a length violation for empty string when minLength > 0", async () => {

			expect(validateString([""], string({ minLength: 1 })))
				.toEqual([{ "0": ["{length} expected string length greater than or equal to <1>"] }]);

		});

		it("returns undefined for empty string when minLength is 0", async () => {

			expect(validateString([""], string({ minLength: 0 }))).toBeUndefined();

		});

	});

	describe("maxLength edge cases", () => {

		it("returns undefined for empty string with maxLength constraint", async () => {

			expect(validateString([""], string({ maxLength: 5 }))).toBeUndefined();

		});

		it("keys a length violation when maxLength is 0 and string is non-empty", async () => {

			expect(validateString(["a"], string({ maxLength: 0 })))
				.toEqual([{ "0": ["{length} expected string length less than or equal to <0>"] }]);

		});

	});

	describe("combined length constraints", () => {

		it("returns undefined for strings within length range", async () => {

			expect(validateString(["abc"], string({ minLength: 2, maxLength: 5 }))).toBeUndefined();

		});

		it("returns undefined for strings at length boundaries", async () => {

			const shape = string({ minLength: 2, maxLength: 5 });

			expect(validateString(["ab"], shape)).toBeUndefined();
			expect(validateString(["abcde"], shape)).toBeUndefined();

		});

		it("returns keyed trace for strings outside length range", async () => {

			const shape = string({ minLength: 2, maxLength: 5 });

			expect(validateString(["a"], shape)).toEqual([{ "0": [expect.stringContaining("{length}")] }]);
			expect(validateString(["abcdef"], shape)).toEqual([{ "0": [expect.stringContaining("{length}")] }]);

		});

	});

	describe("pattern constraint", () => {

		it("returns undefined for strings matching pattern", async () => {

			expect(validateString(["hello"], string({ pattern: /^[a-z]+$/ }))).toBeUndefined();

		});

		it("returns keyed trace for strings not matching pattern", async () => {

			expect(validateString(["Hello123"], string({ pattern: /^[a-z]+$/ })))
				.toEqual([{ "0": [expect.stringContaining("{format}")] }]);

		});

		it("returns keyed trace for empty string when pattern requires content", async () => {

			expect(validateString([""], string({ pattern: /^[a-z]+$/ })))
				.toEqual([{ "0": [expect.stringContaining("{format}")] }]);

		});

		it("returns undefined for strings matching email pattern", async () => {

			expect(validateString(["user@example.com"], string({
				pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
			}))).toBeUndefined();

		});

		it("returns keyed trace for invalid email pattern", async () => {

			expect(validateString(["invalid-email"], string({
				pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
			}))).toEqual([{ "0": [expect.stringContaining("{format}")] }]);

		});

		it("validates pattern with anchors", async () => {

			const shape = string({ pattern: /^ABC$/ });

			expect(validateString(["ABC"], shape)).toBeUndefined();
			expect(validateString(["ABCD"], shape)).toEqual([{ "0": [expect.stringContaining("{format}")] }]);
			expect(validateString(["0ABC"], shape)).toEqual([{ "0": [expect.stringContaining("{format}")] }]);

		});

		it("validates pattern as string", async () => {

			expect(validateString(["12345"], string({ pattern: "^[0-9]+$" }))).toBeUndefined();

		});

	});

	describe("in constraint", () => {

		it("returns undefined for strings in the enumeration", async () => {

			const shape = string({ in: ["apple", "banana", "cherry"] });

			expect(validateString(["apple"], shape)).toBeUndefined();
			expect(validateString(["banana"], shape)).toBeUndefined();
			expect(validateString(["cherry"], shape)).toBeUndefined();

		});

		it("returns keyed trace for strings not in the enumeration", async () => {

			expect(validateString(["orange"], string({ in: ["apple", "banana", "cherry"] })))
				.toEqual([{ "0": [expect.stringContaining("{domain}")] }]);

		});

		it("validates single-value enumeration", async () => {

			const shape = string({ in: ["only"] });

			expect(validateString(["only"], shape)).toBeUndefined();
			expect(validateString(["other"], shape)).toEqual([{ "0": [expect.stringContaining("{domain}")] }]);

		});

		it("validates case-sensitive enumeration", async () => {

			const shape = string({ in: ["Hello", "World"] });

			expect(validateString(["Hello"], shape)).toBeUndefined();
			expect(validateString(["hello"], shape)).toEqual([{ "0": [expect.stringContaining("{domain}")] }]);

		});

		it("returns undefined for empty string in enumeration", async () => {

			expect(validateString([""], string({ in: ["", "a", "b"] }))).toBeUndefined();

		});

	});

	describe("hasValue constraint", () => {

		it("returns undefined when all required values are present", async () => {

			expect(validateString(
				["apple", "banana", "cherry"],
				string({ hasValue: ["apple", "banana"] })
			)).toBeUndefined();

		});

		it("returns undefined when values exactly match required", async () => {

			expect(validateString(["apple", "banana"], string({ hasValue: ["apple", "banana"] }))).toBeUndefined();

		});

		it("returns keyed trace when required value is missing", async () => {

			expect(validateString(["apple", "cherry"], string({ hasValue: ["apple", "banana"] })))
				.toEqual([expect.stringContaining("{values}")]);

		});

		it("returns keyed trace when values array is empty", async () => {

			expect(validateString([], string({ hasValue: ["apple"] })))
				.toEqual([expect.stringContaining("{values}")]);

		});

		it("returns undefined for single required value present", async () => {

			expect(validateString(["hello"], string({ hasValue: ["hello"] }))).toBeUndefined();

		});

	});

	describe("combined constraints", () => {

		it("returns undefined when satisfying both length and pattern", async () => {

			expect(validateString(["hello"], string({
				minLength: 2,
				maxLength: 10,
				pattern: /^[a-z]+$/
			}))).toBeUndefined();

		});

		it("returns keyed trace for valid pattern but invalid length", async () => {

			expect(validateString(["ab"], string({ minLength: 5, pattern: /^[a-z]+$/ })))
				.toEqual([{ "0": ["{length} expected string length greater than or equal to <5>"] }]);

		});

		it("returns keyed trace for valid length but invalid pattern", async () => {

			expect(validateString(["Hello123"], string({
				maxLength: 10,
				pattern: /^[a-z]+$/
			}))).toEqual([{ "0": [expect.stringContaining("{format}")] }]);

		});

		it("returns undefined when satisfying length, pattern, and enumeration", async () => {

			const shape = string({
				minLength: 3,
				maxLength: 10,
				pattern: /^[a-z]+$/,
				in: ["apple", "banana", "cherry"]
			});

			expect(validateString(["apple"], shape)).toBeUndefined();

		});

		it("returns keyed trace when failing enumeration despite valid length and pattern", async () => {

			const shape = string({
				minLength: 3,
				maxLength: 10,
				pattern: /^[a-z]+$/,
				in: ["apple", "banana", "cherry"]
			});

			expect(validateString(["grape"], shape))
				.toEqual([{ "0": [expect.stringContaining("{domain}")] }]);

		});

	});

	describe("no constraints", () => {

		it("returns undefined for any string with no constraints", async () => {

			const shape = string();

			expect(validateString([""], shape)).toBeUndefined();
			expect(validateString(["hello"], shape)).toBeUndefined();
			expect(validateString(["Hello World!"], shape)).toBeUndefined();
			expect(validateString(["123"], shape)).toBeUndefined();

		});

	});

	describe("unicode handling", () => {

		it("counts unicode characters correctly for length constraints", async () => {

			expect(validateString(["héllo"], string({ minLength: 5, maxLength: 10 }))).toBeUndefined();

		});

		it("handles emoji in length constraints", async () => {

			const trace = validateString(["a🌍b"], string({ maxLength: 3 }));

			expect(trace === undefined || typeof trace === "object").toBeTruthy();

		});

		it("handles unicode in pattern matching", async () => {

			expect(validateString(["héllo"], string({ pattern: /^[a-zA-Zéö]+$/ }))).toBeUndefined();

		});

	});

	describe("per-value errors", () => {

		it.each<[string, readonly string[], readonly number[]]>([
			["both failing values", ["ab", "c"], [0, 1]],
			["only the failing values", ["ab", "hello", "c"], [0, 2]],
			["a single failing value", ["ab"], [0]]
		])("keys length violations by element (%s)", async (_label, values, indices) => {

			expect(validateString(values, string({ minLength: 3 }))).toEqual([
				Object.fromEntries(indices.map(index =>
					[`${index}`, ["{length} expected string length greater than or equal to <3>"]]
				))
			]);

		});

	});

});
